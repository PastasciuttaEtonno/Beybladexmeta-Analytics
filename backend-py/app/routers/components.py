from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter()

# Placeholder rows the stats tables carry for "no component in this slot".
_PLACEHOLDERS = {"NONE", "-"}


def _is_real(name: str | None) -> bool:
    return bool(name) and name.upper() not in _PLACEHOLDERS  # type: ignore[union-attr]


async def _distinct(db: AsyncSession, column: str, table: str) -> list[str]:
    rows = await db.execute(
        text(f"SELECT {column} AS name FROM {table} GROUP BY {column} ORDER BY {column} ASC")
    )
    return [r.name for r in rows if _is_real(r.name)]


@router.get("/api/components")
async def components(db: Annotated[AsyncSession, Depends(get_session)]) -> dict:
    """Every component name that appears in the stats tables, for the filters.

    The grouping and ordering are done in SQL so the result matches the Express
    implementation exactly — same collation, same order.
    """
    bit_rows = await db.execute(
        text(
            'SELECT "bit" AS name, is_ratchet_less FROM bit_stats '
            'GROUP BY "bit", is_ratchet_less ORDER BY "bit" ASC'
        )
    )

    return {
        "blades": await _distinct(db, "blade", "blade_stats"),
        "assistBlades": await _distinct(db, "assist_blade", "assist_blade_stats"),
        "ratchets": await _distinct(db, "ratchet", "ratchet_stats"),
        "bits": [
            {"name": r.name, "isRatchetLess": bool(r.is_ratchet_less)}
            for r in bit_rows
            if _is_real(r.name)
        ],
        "lockChips": await _distinct(db, "lock_chip", "lock_chip_stats"),
    }
