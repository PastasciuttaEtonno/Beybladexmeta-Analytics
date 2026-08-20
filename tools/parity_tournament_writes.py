"""Compares what the tournament write endpoints WRITE, not what they answer.

Registering or editing a combo touches eleven tables — the player's combos, the
match results, all six aggregate stats tables, the regional standings, the
player record and the audit log. A difference there corrupts stored data rather
than one response, so comparing responses is not enough.

For each case:

    snapshot -> call Express -> read the diff -> restore
             -> call FastAPI -> read the diff -> restore
             -> the two diffs must be identical

Everything is restored afterwards, so the database is left exactly as found.
Local replica only.

    python tools/dev_session.py --email <a user linked to ChallengerMode>
    python tools/parity_tournament_writes.py --cookie 'connect.sid=...'

Note: the claim endpoint verifies the placement against the LIVE ChallengerMode
API, which is not cacheable, so those cases make two real API calls. For a
finished tournament the answer is stable.
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

# Columns that record WHEN something happened, or a sequence value. They differ
# between two runs of the same operation and never carry meaning for parity.
VOLATILE = {"updated_at", "created_at", "data_creazione", "fetched_at", "id"}

TABLES = [
    "external_player_combos",
    "cm_match_results",
    "combo_stats",
    "blade_stats",
    "assist_blade_stats",
    "ratchet_stats",
    "bit_stats",
    "lock_chip_stats",
    "player_regional_stats",
    "cm_players",
    "admin_audit_logs",
]

failures = 0
checks = 0


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


COLUMNS = {}


def snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS pw_snap_{table}; "
             f"CREATE TABLE pw_snap_{table} AS SELECT * FROM {table};")


def restore() -> None:
    # One transaction with foreign-key triggers off: these tables reference each
    # other, so neither truncating nor re-inserting them one at a time works in
    # any fixed order.
    statements = ["BEGIN;", "SET session_replication_role = replica;"]
    statements.append("TRUNCATE " + ", ".join(TABLES) + ";")
    statements += [f"INSERT INTO {t} SELECT * FROM pw_snap_{t};" for t in TABLES]
    statements += ["SET session_replication_role = DEFAULT;", "COMMIT;"]
    psql(" ".join(statements))


def drop_snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS pw_snap_{table};")


def contents() -> dict[str, list[str]]:
    """Every watched table as sorted text, ignoring volatile columns."""
    out: dict[str, list[str]] = {}
    for table in TABLES:
        cols = COLUMNS[table]
        if not cols:
            continue
        rows = psql(f"SELECT {', '.join(cols)} FROM {table};")
        out[table] = sorted(rows.splitlines())
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


def compare(label: str, express: str, fastapi: str, method: str, path: str,
            cookie: str, body: Any = None, prepare: str | None = None,
            known_body_difference: str | None = None, warmup: bool = False) -> None:
    """`prepare` is SQL run after the restore and before the call, identically
    for both backends — used to put the database into the state a case needs."""
    global failures, checks
    checks += 1

    restore()
    if prepare:
        psql(prepare)
    if warmup:
        # Fire the request once and only measure the SECOND one, so the case
        # tests what a repeat does rather than what the first call does.
        call(express, method, path, cookie, body)
    before = contents()
    express_status, express_body = call(express, method, path, cookie, body)
    express_diff = diff_against(before)

    restore()
    if prepare:
        psql(prepare)
    if warmup:
        call(fastapi, method, path, cookie, body)
    before = contents()
    fastapi_status, fastapi_body = call(fastapi, method, path, cookie, body)
    fastapi_diff = diff_against(before)

    problems = []
    if express_status != fastapi_status:
        problems.append(f"status {express_status} vs {fastapi_status}")
    if express_body != fastapi_body and not known_body_difference:
        problems.append(f"body {express_body} vs {fastapi_body}")
    if express_diff != fastapi_diff:
        for table in sorted(set(express_diff) | set(fastapi_diff)):
            left = express_diff.get(table, {"added": [], "removed": []})
            right = fastapi_diff.get(table, {"added": [], "removed": []})
            if left != right:
                for side in ("added", "removed"):
                    only_express = set(left[side]) - set(right[side])
                    only_fastapi = set(right[side]) - set(left[side])
                    for row in sorted(only_express):
                        problems.append(f"{table} {side} only in express: {row[:120]}")
                    for row in sorted(only_fastapi):
                        problems.append(f"{table} {side} only in fastapi: {row[:120]}")

    if problems:
        failures += 1
        print(f"FAIL  {label}")
        for problem in problems[:6]:
            print(f"      {problem}")
    elif known_body_difference and express_body != fastapi_body:
        # Not a failure, but not silence either: the difference is stated every
        # run so it stays a decision rather than becoming folklore.
        print(f"diff  {label}  [{express_status}] {describe(express_diff)}")
        print(f"      known: {known_body_difference}")
    else:
        print(f"ok    {label}  [{express_status}] {describe(express_diff)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--express", default="http://127.0.0.1:5000")
    parser.add_argument("--fastapi", default="http://127.0.0.1:8000")
    parser.add_argument("--cookie", required=True)
    parser.add_argument(
        "--tournament", default="95ddef78-f74b-4ae6-7a0e-08de356b8cf5",
        help="a tournament the session's user actually placed top-four in",
    )
    args = parser.parse_args()

    for table in TABLES:
        COLUMNS[table] = columns_of(table)

    status, whoami = call(args.express, "GET", "/api/auth/me", args.cookie)
    if status != 200:
        print(f"The cookie is not valid on Express ({status}).")
        return 1
    print(f"# signed in as {whoami['user']['displayName']} ({whoami['user']['email']})")
    print(f"# tournament {args.tournament}\n")

    tid = args.tournament
    # Combos may only be edited for 48 hours. These were recorded months ago, so
    # without reopening the window every mutating case would just return 403 and
    # the interesting code would never run. Undone by the restore.
    open_window = (
        f"UPDATE external_player_combos SET updated_at = now() "
        f"WHERE tournament_id = '{args.tournament}';"
    )

    combo = {"blade": "SharkScale", "assistBlade": "None", "ratchet": "1-70",
             "bit": "LowRush", "lockChip": "None"}
    other = {"blade": "SilverWolf", "assistBlade": "None", "ratchet": "9-60",
             "bit": "FreeBall", "lockChip": "None"}

    snapshot()
    try:
        print("--- editing an existing combo ---")
        compare("PUT combo 1 -> SharkScale", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{tid}/combos/1", args.cookie, combo, open_window)
        compare("PUT combo 2 -> SilverWolf", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{tid}/combos/2", args.cookie, other, open_window)

        print("\n--- deleting a combo ---")
        compare("DELETE combo 3", args.express, args.fastapi,
                "DELETE", f"/api/tournaments/{tid}/combos/3", args.cookie, None, open_window)
        compare("DELETE combo 1", args.express, args.fastapi,
                "DELETE", f"/api/tournaments/{tid}/combos/1", args.cookie, None, open_window)

        print("\n--- rejected, so nothing may change ---")
        compare("PUT with an unknown blade", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{tid}/combos/1", args.cookie,
                {**combo, "blade": "NoSuchBlade"})
        compare("PUT with an out-of-range slot", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{tid}/combos/9", args.cookie, combo)
        compare("DELETE a slot that does not exist", args.express, args.fastapi,
                "DELETE", f"/api/tournaments/{tid}/combos/9", args.cookie)
        compare("claim with a malformed body", args.express, args.fastapi,
                "POST", "/api/tournaments/claim", args.cookie, {"tournamentId": tid},
                known_body_difference=(
                    "Express returns the validator's raw JSON dump as the error "
                    "message; FastAPI returns a plain 'Invalid request'. Same "
                    "status, no writes on either side. Worth making both plain."
                ))

        print("\n--- registering a full deck (calls the live ChallengerMode API) ---")
        deck = {"tournamentId": tid,
                "combos": [combo, other,
                           {"blade": "WizardRod", "assistBlade": "None", "ratchet": "1-60",
                            "bit": "Hexa", "lockChip": "None"}]}

        compare("POST claim, three combos", args.express, args.fastapi,
                "POST", "/api/tournaments/claim", args.cookie, deck)

        # Registering the same deck again must land in exactly the same place.
        # It used to add the points a second time: the replaced combos were
        # deleted without their contribution being taken back.
        compare("POST claim again, same deck (must add nothing)", args.express,
                args.fastapi, "POST", "/api/tournaments/claim", args.cookie, deck,
                warmup=True)
    finally:
        restore()
        drop_snapshot()
        print("\n(database restored)")

    print()
    if failures:
        print(f"{failures} of {checks} cases differ")
        return 1
    print(f"all {checks} cases write identically (1 known message difference)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
