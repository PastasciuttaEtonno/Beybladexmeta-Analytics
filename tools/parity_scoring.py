"""Proves the two scoring engines mutate the database identically.

The aggregate tables (combo_stats and the five component tables) are what every
ranking on the site is built from, so a difference here corrupts stored data
rather than one response. Comparing responses is therefore not enough — this
compares the WRITES.

For each case:

    snapshot -> run Express -> read the diff -> restore
             -> run FastAPI -> read the diff -> restore
             -> the two diffs must be identical

Everything is restored afterwards, so the database is left exactly as found.
Local replica only: it refuses to run against anything but the dev container.

    python tools/parity_scoring.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = "beyblade-dev-db"
DATABASE = "beyblade_tracker"

TABLES = [
    "combo_stats",
    "blade_stats",
    "assist_blade_stats",
    "ratchet_stats",
    "bit_stats",
    "lock_chip_stats",
]

KEY_COLUMNS = {
    "combo_stats": ["blade", "assist_blade", "ratchet", "bit", "lock_chip", "season"],
    "blade_stats": ["blade", "season"],
    "assist_blade_stats": ["assist_blade", "season"],
    "ratchet_stats": ["ratchet", "season"],
    "bit_stats": ['"bit"', "season"],
    "lock_chip_stats": ["lock_chip", "season"],
}

COUNTERS = ["primi_posti", "secondi_posti", "terzi_posti", "quarti_posti", "punteggio_totale"]


def psql(sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", "postgres", "-d", DATABASE,
         "-t", "-A", "-F", "\x1f", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"psql failed:\n{result.stderr.strip()}\nSQL: {sql[:200]}")
    return result.stdout.strip()


def snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS parity_snap_{table}; "
             f"CREATE TABLE parity_snap_{table} AS SELECT * FROM {table};")


def restore() -> None:
    for table in TABLES:
        psql(f"TRUNCATE {table}; INSERT INTO {table} SELECT * FROM parity_snap_{table};")


def drop_snapshot() -> None:
    for table in TABLES:
        psql(f"DROP TABLE IF EXISTS parity_snap_{table};")


def read_diff() -> dict[str, list[str]]:
    """Rows that differ from the snapshot, per table, as sorted text."""
    changes: dict[str, list[str]] = {}
    for table in TABLES:
        keys = KEY_COLUMNS[table]
        # Qualified with t. because the snapshot table has the same column names.
        selected = ", ".join(f"t.{c}" for c in keys + COUNTERS)
        joined = " AND ".join(f"t.{k} IS NOT DISTINCT FROM s.{k}" for k in keys)
        differs = " OR ".join(f"t.{c} IS DISTINCT FROM s.{c}" for c in COUNTERS)

        # Rows that changed, plus rows that are new (no snapshot match).
        rows = psql(
            f"SELECT {selected} FROM {table} t "
            f"LEFT JOIN parity_snap_{table} s ON {joined} "
            f"WHERE s.season IS NULL OR ({differs}) "
            f"ORDER BY 1, 2;"
        )
        if rows:
            changes[table] = sorted(rows.splitlines())
    return changes


def run_express(action: str, combo: dict) -> tuple[bool, str]:
    result = subprocess.run(
        ["npx", "tsx", "scripts/apply-scoring.ts", action, json.dumps(combo)],
        cwd=ROOT / "backend", capture_output=True, text=True, shell=True,
    )
    return result.returncode == 0, (result.stderr or result.stdout).strip()


def run_fastapi(action: str, combo: dict) -> tuple[bool, str]:
    result = subprocess.run(
        ["uv", "run", "apply_scoring.py", action, json.dumps(combo)],
        cwd=ROOT / "backend-py", capture_output=True, text=True, shell=True,
    )
    return result.returncode == 0, (result.stderr or result.stdout).strip()


def describe(diff: dict[str, list[str]]) -> str:
    if not diff:
        return "(no rows changed)"
    return "; ".join(f"{table}: {len(rows)} row(s)" for table, rows in sorted(diff.items()))


CASES: list[tuple[str, str, dict]] = [
    (
        "1st place, combo that already exists",
        "add",
        {"blade": "WizardRod", "assistBlade": "None", "ratchet": "1-60", "bit": "Hexa",
         "lockChip": "None", "season": "Off Season 2025", "placement": 1,
         "totalParticipants": 24},
    ),
    (
        "2nd place, same combo",
        "add",
        {"blade": "WizardRod", "assistBlade": "None", "ratchet": "1-60", "bit": "Hexa",
         "lockChip": "None", "season": "Off Season 2025", "placement": 2,
         "totalParticipants": 17},
    ),
    (
        "3rd place",
        "add",
        {"blade": "SilverWolf", "assistBlade": "None", "ratchet": "9-60", "bit": "FreeBall",
         "lockChip": "None", "season": "Off Season 2025", "placement": 3,
         "totalParticipants": 8},
    ),
    (
        "4th place",
        "add",
        {"blade": "SharkScale", "assistBlade": "None", "ratchet": "1-70", "bit": "LowRush",
         "lockChip": "None", "season": "Off Season 2025", "placement": 4,
         "totalParticipants": 32},
    ),
    (
        "5th place scores nothing, so nothing must change",
        "add",
        {"blade": "WizardRod", "assistBlade": "None", "ratchet": "1-60", "bit": "Hexa",
         "lockChip": "None", "season": "Off Season 2025", "placement": 5,
         "totalParticipants": 24},
    ),
    (
        "combo not seen before, in a season not seen before",
        "add",
        {"blade": "WizardRod", "assistBlade": "Charge", "ratchet": "4-55", "bit": "Hexa",
         "lockChip": "None", "season": "Season 2026", "placement": 1,
         "totalParticipants": 12},
    ),
    (
        "revert a result that was recorded",
        "revert",
        {"blade": "WizardRod", "assistBlade": "None", "ratchet": "1-60", "bit": "Hexa",
         "lockChip": "None", "season": "Off Season 2025", "placement": 1,
         "totalParticipants": 24},
    ),
    (
        "revert something never recorded — counters must floor at zero",
        "revert",
        {"blade": "WizardRod", "assistBlade": "Charge", "ratchet": "4-55", "bit": "Hexa",
         "lockChip": "None", "season": "Season 2026", "placement": 1,
         "totalParticipants": 999},
    ),
]


def main() -> int:
    where = psql("SELECT current_database() || ' @ ' || inet_server_addr();")
    print(f"# {where} (dev container)\n")

    failures = 0
    snapshot()

    try:
        for label, action, combo in CASES:
            restore()
            express_ok, express_msg = run_express(action, combo)
            express_diff = read_diff()

            restore()
            fastapi_ok, fastapi_msg = run_fastapi(action, combo)
            fastapi_diff = read_diff()

            if not express_ok or not fastapi_ok:
                print(f"FAIL  {label}")
                if not express_ok:
                    print(f"      express failed: {express_msg[:200]}")
                if not fastapi_ok:
                    print(f"      fastapi failed: {fastapi_msg[:200]}")
                failures += 1
                continue

            if express_diff != fastapi_diff:
                print(f"FAIL  {label}")
                for table in sorted(set(express_diff) | set(fastapi_diff)):
                    left = express_diff.get(table, [])
                    right = fastapi_diff.get(table, [])
                    if left != right:
                        print(f"      {table}:")
                        for row in sorted(set(left) ^ set(right)):
                            side = "express" if row in left else "fastapi"
                            print(f"        only in {side}: {row}")
                failures += 1
                continue

            print(f"ok    {label}  [{describe(express_diff)}]")
    finally:
        restore()
        drop_snapshot()
        print("\n(database restored)")

    print()
    if failures:
        print(f"{failures} of {len(CASES)} cases differ")
        return 1
    print(f"all {len(CASES)} cases produce identical writes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
