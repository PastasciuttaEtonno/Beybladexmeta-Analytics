"""Compares what the ADMIN endpoints write, not what they answer.

Same method as tools/parity_tournament_writes.py — snapshot, call one backend,
read the diff, restore, call the other, compare the two diffs — but aimed at
the routes in backend/src/routes/admin.ts, which are the ones that can rewrite
every aggregate in the database or wipe a tournament's recorded results.

    python tools/dev_session.py                    # an admin account
    python tools/parity_admin_writes.py --cookie 'connect.sid=...'

Not covered here: POST /api/admin/refresh-all-tournaments. It walks all 124
tournaments with a 200 ms pause and re-fetches each one from ChallengerMode,
so a single case would make 248 live API calls and take minutes. Its only
database effect is refreshing a materialised view; it is checked by hand
instead, comparing the two response bodies.
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

# Columns that record WHEN something happened, or a sequence value.
VOLATILE = {"updated_at", "created_at", "data_creazione", "fetched_at", "id"}

# challonge_players.id is the player, not a surrogate key: it carries meaning
# and must be compared. Same for challonge_match_results.tournament_id, which
# is not named `id` and so is kept anyway.
VOLATILE_BY_TABLE = {"challonge_players": VOLATILE - {"id"}}

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
    "challonge_players",
    "challonge_match_results",
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
    skip = VOLATILE_BY_TABLE.get(table, VOLATILE)
    raw = psql(
        "SELECT column_name FROM information_schema.columns "
        f"WHERE table_name = '{table}' ORDER BY ordinal_position;"
    )
    return [c for c in raw.splitlines() if c and c not in skip]


COLUMNS: dict[str, list[str]] = {}


def snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS aw_snap_{table}; "
             f"CREATE TABLE aw_snap_{table} AS SELECT * FROM {table};")


def restore() -> None:
    # Foreign keys off for the duration: these tables reference each other and
    # no fixed truncate/insert order satisfies all of them.
    statements = ["BEGIN;", "SET session_replication_role = replica;"]
    statements.append("TRUNCATE " + ", ".join(TABLES) + ";")
    statements += [f"INSERT INTO {t} SELECT * FROM aw_snap_{t};" for t in TABLES]
    statements += ["SET session_replication_role = DEFAULT;", "COMMIT;"]
    psql(" ".join(statements))


def drop_snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS aw_snap_{table};")


def contents() -> dict[str, list[str]]:
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
        with urllib.request.urlopen(request, timeout=300) as response:
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
            known_body_difference: str | None = None, warmup: bool = False,
            compare_writes_by_count: str | None = None) -> None:
    """`compare_writes_by_count` names a reason the rows cannot match exactly.
    The per-table added/removed COUNTS are still compared, so a backend that
    silently wrote nothing is still caught; only the row contents are excused.
    """
    global failures, checks
    checks += 1

    restore()
    if prepare:
        psql(prepare)
    if warmup:
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
    if compare_writes_by_count:
        shape = lambda d: {t: (len(c["added"]), len(c["removed"])) for t, c in d.items()}  # noqa: E731
        if shape(express_diff) != shape(fastapi_diff):
            problems.append(f"write counts {shape(express_diff)} vs {shape(fastapi_diff)}")
    elif express_diff != fastapi_diff:
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
        print(f"diff  {label}  [{express_status}] {describe(express_diff)}")
        print(f"      known: {known_body_difference}")
    elif compare_writes_by_count:
        print(f"count {label}  [{express_status}] {describe(express_diff)}")
        print(f"      rows not compared: {compare_writes_by_count}")
    else:
        print(f"ok    {label}  [{express_status}] {describe(express_diff)}")


# --------------------------------------------------------------- fixtures ---

# A real tournament with twelve recorded results: four players, three combos
# each, twelve participants, 2025-11-20.
TOURNAMENT = "e309e8a8-e930-4f4c-389e-08de278ff875"
WINNER = "2a0ddd1a-6115-4a45-8c05-f8fc09d3a51a"
PLAYERS = [
    "2a0ddd1a-6115-4a45-8c05-f8fc09d3a51a",
    "e017fb67-e90e-4935-a633-caf9ae32f463",
    "f7158e1d-4e03-4ad1-b85f-b61d5829f48b",
    "bf0d2c91-4798-4294-a798-6bfe3e810ef3",
]

PROBE_TOURNAMENT = "parity-admin-probe"
IMPORT_TOURNAMENT = "parity-admin-import"

DECK = [
    ("SharkScale", "None", "1-70", "LowRush", "None"),
    ("SilverWolf", "None", "9-60", "FreeBall", "None"),
    ("WizardRod", "None", "1-60", "Hexa", "None"),
]


def seed_external_combos() -> str:
    """Three combos for each of the four players, on a tournament id that does
    not exist yet — the state POST /tournament-results/external requires."""
    rows = []
    for player in PLAYERS:
        for index, (blade, assist, ratchet, bit, chip) in enumerate(DECK, start=1):
            rows.append(
                f"('{PROBE_TOURNAMENT}', '{player}', {index}, '{blade}', '{assist}', "
                f"'{ratchet}', '{bit}', '{chip}', 'challengermode')"
            )
    return (
        "INSERT INTO external_player_combos (tournament_id, player_id, combo_number, "
        "blade, assist_blade, ratchet, bit, lock_chip, platform) VALUES "
        + ", ".join(rows)
        + ";"
    )


def external_body(**overrides: Any) -> dict:
    body = {
        "nomeTorneo": "Parity Admin Probe",
        "dataTorneo": "2026-03-14",
        "participants": 12,
        "regione": "Lazio",
        "tournamentId": PROBE_TOURNAMENT,
        "firstPlacePlayerId": PLAYERS[0],
        "secondPlacePlayerId": PLAYERS[1],
        "thirdPlacePlayerId": PLAYERS[2],
        "fourthPlacePlayerId": PLAYERS[3],
    }
    body.update(overrides)
    return body


IMPORT_BODY = {
    "id": IMPORT_TOURNAMENT,
    "tournament_name": "Parity Admin Import",
    "start_date": "2026-03-14",
    "total_players": 8,
    "standings": [
        {"id": 900001, "name": "Parity Ghost One", "rank": 1, "avatar_url": None},
        {"id": 900002, "name": "Parity Ghost Two", "rank": 2, "avatar_url": None},
        {"id": 900003, "name": "Parity Ghost Three", "rank": 3, "avatar_url": None},
    ],
}


def combo_body(deck: list[tuple[str, str, str, str, str]], platform: str = "challengermode") -> dict:
    return {
        "platform": platform,
        "combos": [
            {"blade": b, "assistBlade": a, "ratchet": r, "bit": t, "lockChip": c}
            for b, a, r, t, c in deck
        ],
    }


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
    if not whoami["user"].get("isAdmin"):
        print("That account is not an admin; every case would return 403.")
        return 1
    print(f"# signed in as {whoami['user']['displayName']} ({whoami['user']['email']})\n")

    seed = seed_external_combos()

    snapshot()
    try:
        print("--- refusals must write nothing on either side ---")
        compare("POST tournament-results (410 tombstone)", args.express, args.fastapi,
                "POST", "/api/admin/tournament-results", args.cookie, {})
        compare("external with isAdmin in the body", args.express, args.fastapi,
                "POST", "/api/admin/tournament-results/external", args.cookie,
                external_body(isAdmin=True))
        compare("external with an unknown region", args.express, args.fastapi,
                "POST", "/api/admin/tournament-results/external", args.cookie,
                external_body(regione="Californie"))
        compare("external with too few participants", args.express, args.fastapi,
                "POST", "/api/admin/tournament-results/external", args.cookie,
                external_body(participants=2))
        compare("external when the winners have no combos", args.express, args.fastapi,
                "POST", "/api/admin/tournament-results/external", args.cookie,
                external_body())
        compare("import-tournament with fields missing", args.express, args.fastapi,
                "POST", "/api/admin/import-tournament", args.cookie,
                {"id": "x", "tournament_name": "y"})
        compare("sync-ghost-players for an unknown tournament", args.express, args.fastapi,
                "POST", "/api/admin/tournaments/no-such-tournament/sync-ghost-players",
                args.cookie)
        compare("sync-challonge", args.express, args.fastapi,
                "POST", "/api/admin/sync-challonge", args.cookie,
                compare_writes_by_count=(
                    "the Challonge API returns each timestamp in a randomly "
                    "varying timezone — the same instant comes back as -05:00 on "
                    "one call and +07:00 on the next — so two syncs never store "
                    "byte-identical JSON. Verified against the API directly; it "
                    "is not the backends disagreeing."
                ))

        print("\n--- submitting an external tournament ---")
        compare("external, four placements, three combos each", args.express, args.fastapi,
                "POST", "/api/admin/tournament-results/external", args.cookie,
                external_body(), seed)
        # Resubmitting must not score anyone twice: only combos absent from
        # cm_match_results are pushed through processExternalCombo.
        compare("external again, same submission (must add no points)", args.express,
                args.fastapi, "POST", "/api/admin/tournament-results/external",
                args.cookie, external_body(), seed, warmup=True)

        print("\n--- importing a Challonge tournament ---")
        compare("import-tournament", args.express, args.fastapi,
                "POST", "/api/admin/import-tournament", args.cookie, IMPORT_BODY)
        compare("sync-ghost-players on the imported tournament", args.express, args.fastapi,
                "POST", f"/api/admin/tournaments/{IMPORT_TOURNAMENT}/sync-ghost-players",
                args.cookie, None,
                "INSERT INTO challonge_match_results (tournament_id, data) VALUES "
                f"('{IMPORT_TOURNAMENT}', '{json.dumps(IMPORT_BODY)}'::jsonb);")

        print("\n--- rebuilding the regional standings ---")
        compare("recalc-stats", args.express, args.fastapi,
                "POST", "/api/admin/recalc-stats", args.cookie)

        print("\n--- resetting a tournament's combos ---")
        compare("combos/reset on a tournament with twelve results", args.express,
                args.fastapi,
                "POST", f"/api/admin/tournaments/{TOURNAMENT}/combos/reset", args.cookie)
        compare("combos/reset on a tournament with nothing recorded", args.express,
                args.fastapi,
                "POST", "/api/admin/tournaments/no-such-tournament/combos/reset",
                args.cookie)

        print("\n--- the admin upsert of a player's deck ---")
        compare("PUT the same deck back", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{TOURNAMENT}/players/{WINNER}/combos",
                args.cookie,
                combo_body([("PhoenixWing", "None", "1-70", "Rush", "None"),
                            ("SharkScale", "None", "4-50", "Point", "None"),
                            ("WizardRod", "None", "1-60", "Hexa", "None")]))
        compare("PUT a different deck (points must move, not accumulate)",
                args.express, args.fastapi,
                "PUT", f"/api/tournaments/{TOURNAMENT}/players/{WINNER}/combos",
                args.cookie, combo_body(DECK))
        compare("PUT with an unknown blade", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{TOURNAMENT}/players/{WINNER}/combos",
                args.cookie,
                combo_body([("NoSuchBlade", "None", "1-60", "Hexa", "None")]))
        compare("PUT with the same combo twice", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{TOURNAMENT}/players/{WINNER}/combos",
                args.cookie, combo_body([DECK[0], DECK[0]]))
        compare("PUT with no combos at all", args.express, args.fastapi,
                "PUT", f"/api/tournaments/{TOURNAMENT}/players/{WINNER}/combos",
                args.cookie, {"combos": []},
                known_body_difference=(
                    "Express returns Zod's raw JSON issue dump as the error "
                    "message; FastAPI returns a plain sentence. Same status, "
                    "no writes on either side."
                ))
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
