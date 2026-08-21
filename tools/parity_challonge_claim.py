"""Compares what POST /api/tournaments/:id/claim writes on both backends.

This is the Challonge counterpart of the ChallengerMode claim already covered
by tools/parity_tournament_writes.py, and the trickier of the two: Challonge
exposes no API to confirm a placement, so the route decides who the caller is
by matching their VERIFIED aliases against the stored standings. Get that wrong
and one player can file results under another's name, so the refusal paths
matter as much as the happy one.

Everything the harness needs is created here and removed afterwards: a probe
tournament in challonge_match_results, a verified alias for the test account,
and the combos the route writes.

    python tools/dev_session.py --email <any account>
    python tools/parity_challonge_claim.py --cookie 'connect.sid=...'
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any

CONTAINER = "beyblade-dev-db"
DATABASE = "beyblade_tracker"

VOLATILE = {"updated_at", "created_at", "data_creazione", "fetched_at", "id"}

TABLES = [
    "challonge_reported_combos",
    "external_player_combos",
    "combo_stats",
    "blade_stats",
    "assist_blade_stats",
    "ratchet_stats",
    "bit_stats",
    "lock_chip_stats",
    "user_aliases",
    "challonge_match_results",
]

PROBE_TOURNAMENT = "parity-claim-probe"

failures = 0
checks = 0
COLUMNS: dict[str, list[str]] = {}


def psql(sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", "postgres", "-d", DATABASE,
         "-t", "-A", "-F", "\x1f", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        raise SystemExit(f"psql failed:\n{result.stderr.strip()}\nSQL: {sql[:200]}")
    return result.stdout.strip()


def columns_of(table: str) -> list[str]:
    raw = psql(
        "SELECT column_name FROM information_schema.columns "
        f"WHERE table_name = '{table}' ORDER BY ordinal_position;"
    )
    return [c for c in raw.splitlines() if c and c not in VOLATILE]


def snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS cc_snap_{table}; "
             f"CREATE TABLE cc_snap_{table} AS SELECT * FROM {table};")


def restore() -> None:
    statements = ["BEGIN;", "SET session_replication_role = replica;"]
    statements.append("TRUNCATE " + ", ".join(TABLES) + ";")
    statements += [f"INSERT INTO {t} SELECT * FROM cc_snap_{t};" for t in TABLES]
    statements += ["SET session_replication_role = DEFAULT;", "COMMIT;"]
    psql(" ".join(statements))


def drop_snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS cc_snap_{table};")


def contents() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for table in TABLES:
        cols = COLUMNS[table]
        if not cols:
            continue
        out[table] = sorted(psql(f"SELECT {', '.join(cols)} FROM {table};").splitlines())
    return out


def diff_against(before: dict[str, list[str]]) -> dict[str, dict[str, list[str]]]:
    after = contents()
    changes: dict[str, dict[str, list[str]]] = {}
    for table in TABLES:
        was, now = set(before.get(table, [])), set(after.get(table, []))
        added, removed = sorted(now - was), sorted(was - now)
        if added or removed:
            changes[table] = {"added": added, "removed": removed}
    return changes


def call(base: str, method: str, path: str, cookie: str, body: Any = None) -> tuple[int, Any]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base.rstrip("/") + path, data=data, method=method)
    request.add_header("Cookie", cookie)
    if data:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    except Exception as exc:
        return 0, f"request failed: {exc}"

    text_body = raw.decode("utf-8", "replace")
    try:
        return status, json.loads(text_body)
    except json.JSONDecodeError:
        return status, text_body


def describe(changes: dict) -> str:
    if not changes:
        return "no writes"
    return "; ".join(
        f"{t}: +{len(c['added'])}/-{len(c['removed'])}" for t, c in sorted(changes.items())
    )


def compare(label: str, express: str, fastapi: str, path: str, cookie: str,
            body: Any = None, prepare: str | None = None, warmup: bool = False) -> None:
    global failures, checks
    checks += 1

    for backend, base in (("express", express), ("fastapi", fastapi)):
        restore()
        if prepare:
            psql(prepare)
        if warmup:
            call(base, "POST", path, cookie, body)
        before = contents()
        status, response = call(base, "POST", path, cookie, body)
        diff = diff_against(before)
        if backend == "express":
            express_status, express_body, express_diff = status, response, diff
        else:
            fastapi_status, fastapi_body, fastapi_diff = status, response, diff

    problems = []
    if express_status != fastapi_status:
        problems.append(f"status {express_status} vs {fastapi_status}")
    if express_body != fastapi_body:
        problems.append(f"body {express_body} vs {fastapi_body}")
    if express_diff != fastapi_diff:
        for table in sorted(set(express_diff) | set(fastapi_diff)):
            left = express_diff.get(table, {"added": [], "removed": []})
            right = fastapi_diff.get(table, {"added": [], "removed": []})
            for side in ("added", "removed"):
                for row in sorted(set(left[side]) - set(right[side])):
                    problems.append(f"{table} {side} only in express: {row[:120]}")
                for row in sorted(set(right[side]) - set(left[side])):
                    problems.append(f"{table} {side} only in fastapi: {row[:120]}")

    if problems:
        failures += 1
        print(f"FAIL  {label}")
        for problem in problems[:6]:
            print(f"      {problem}")
    else:
        print(f"ok    {label}  [{express_status}] {describe(express_diff)}")


TOURNAMENT_DATA = {
    "id": PROBE_TOURNAMENT,
    "tournament_name": "Parity Claim Probe",
    "start_date": "2026-03-14",
    "total_players": 16,
    "standings": [
        {"id": 910001, "name": "Parity Claimant", "rank": 2},
        {"id": 910002, "name": "Someone Else", "rank": 1},
        {"id": 910003, "name": "Parity Latecomer", "rank": 9},
    ],
}

DECK = [
    {"blade": "SharkScale", "assistBlade": "None", "ratchet": "1-70",
     "bit": "LowRush", "lockChip": "None"},
    {"blade": "SilverWolf", "assistBlade": "None", "ratchet": "9-60",
     "bit": "FreeBall", "lockChip": "None"},
    {"blade": "WizardRod", "assistBlade": "None", "ratchet": "1-60",
     "bit": "Hexa", "lockChip": "None"},
]


def seed(user_id: str, alias: str) -> str:
    return (
        "INSERT INTO challonge_match_results (tournament_id, data) VALUES "
        f"('{PROBE_TOURNAMENT}', '{json.dumps(TOURNAMENT_DATA)}'::jsonb); "
        "INSERT INTO user_aliases (user_id, alias, platform, is_verified) VALUES "
        f"('{user_id}', '{alias}', 'challonge', true);"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--express", default="http://127.0.0.1:5000")
    parser.add_argument("--fastapi", default="http://127.0.0.1:8000")
    parser.add_argument("--cookie", required=True)
    args = parser.parse_args()

    for table in TABLES:
        COLUMNS[table] = columns_of(table)

    status, whoami = call(args.express, "GET", "/api/auth/me", args.cookie)
    if status != 200:
        print(f"The cookie is not valid on Express ({status}).")
        return 1
    user = whoami["user"]
    print(f"# signed in as {user['displayName']} ({user['email']})")
    if user.get("isAdmin"):
        print("# NOTE: this account is an admin, so the 'no linked account' "
              "refusal cannot be exercised.")
    print()

    path = f"/api/tournaments/{PROBE_TOURNAMENT}/claim"
    matching = seed(user["id"], "Parity Claimant")
    unranked = seed(user["id"], "Parity Latecomer")
    stranger = seed(user["id"], "Nobody In This Bracket")

    snapshot()
    try:
        print("--- refusals ---")
        compare("claim an unknown tournament", args.express, args.fastapi,
                "/api/tournaments/no-such-tournament/claim", args.cookie,
                {"combos": DECK})
        compare("alias matches nobody in the standings", args.express, args.fastapi,
                path, args.cookie, {"combos": DECK}, stranger)
        compare("alias placed outside the top four", args.express, args.fastapi,
                path, args.cookie, {"combos": DECK}, unranked)
        compare("the same blade twice", args.express, args.fastapi, path, args.cookie,
                {"combos": [DECK[0], DECK[0]]}, matching)

        print("\n--- registering ---")
        compare("claim a second place with three combos", args.express, args.fastapi,
                path, args.cookie, {"combos": DECK}, matching)
        compare("more than three combos (only the first three count)",
                args.express, args.fastapi, path, args.cookie,
                {"combos": DECK + [{"blade": "PhoenixWing", "assistBlade": "None",
                                    "ratchet": "3-70", "bit": "Rush",
                                    "lockChip": "None"}]}, matching)
        compare("an empty deck just clears the previous one",
                args.express, args.fastapi, path, args.cookie, {"combos": []}, matching)

        print("\n--- re-registering must move points, not add them ---")
        compare("claim the same deck twice", args.express, args.fastapi, path,
                args.cookie, {"combos": DECK}, matching, warmup=True)
    finally:
        restore()
        drop_snapshot()
        print("\n(database restored)")

    print()
    if failures:
        print(f"{failures} of {checks} cases differ")
        return 1
    print(f"all {checks} cases write identically")
    return 0


if __name__ == "__main__":
    sys.exit(main())
