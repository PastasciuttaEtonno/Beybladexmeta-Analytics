"""Applies one scoring operation and exits — the FastAPI half of the scoring
parity check (tools/parity_scoring.py).

Mirrors backend/scripts/apply-scoring.ts. The aggregate tables are only written
through process_external_combo / revert_external_combo, which no HTTP route
exposes directly, so the two implementations are compared by calling them here.

    uv run apply_scoring.py add '{"blade": "…", …}'
    uv run apply_scoring.py revert '{…}'
"""

import asyncio
import json
import sys

from app.db import dispose_engine, get_engine
from app.lib.regional_scoring import recalculate_all
from app.lib.scoring import ComboResult, process_external_combo, revert_external_combo
from sqlalchemy.ext.asyncio import async_sessionmaker


async def main() -> int:
    if len(sys.argv) < 2:
        print("usage: apply_scoring.py <add|revert> '<json>' | apply_scoring.py regional",
              file=sys.stderr)
        return 2

    action = sys.argv[1]

    if action == "regional":
        engine = get_engine()
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with sessionmaker() as session:
                print(json.dumps(await recalculate_all(session)))
        finally:
            await dispose_engine()
        return 0

    if len(sys.argv) != 3:
        print("usage: apply_scoring.py <add|revert> '<json>'", file=sys.stderr)
        return 2

    payload = sys.argv[2]
    raw = json.loads(payload)

    # The TypeScript side takes camelCase; accept it so both probes can be
    # handed the exact same JSON.
    combo = ComboResult(
        blade=raw["blade"],
        assist_blade=raw.get("assistBlade", raw.get("assist_blade")),
        ratchet=raw["ratchet"],
        bit=raw["bit"],
        lock_chip=raw.get("lockChip", raw.get("lock_chip")),
        season=raw["season"],
        placement=int(raw["placement"]),
        total_participants=int(raw.get("totalParticipants", raw.get("total_participants"))),
    )

    engine = get_engine()
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sessionmaker() as session:
            if action == "add":
                await process_external_combo(session, combo)
            elif action == "revert":
                await revert_external_combo(session, combo)
            else:
                print(f"unknown action: {action}", file=sys.stderr)
                return 2
    finally:
        await dispose_engine()

    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
