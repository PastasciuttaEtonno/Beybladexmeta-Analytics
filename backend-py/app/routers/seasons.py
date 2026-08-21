import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter()
log = logging.getLogger(__name__)

# Always offered, in this order, whether or not any row uses them.
_BUILTIN_SEASONS = ["Season 2026", "All Time", "Off Season 2025"]

# Scanned in this order; the resulting order of any extra season is part of the
# response contract, so it must not be sorted or reshuffled.
_SEASON_TABLES = [
    "player_regional_stats",
    "combo_stats",
    "blade_stats",
    "ratchet_stats",
    "bit_stats",
]


@router.get("/api/seasons")
async def seasons(db: Annotated[AsyncSession, Depends(get_session)]):
    discovered: list[str] = []

    async def collect(sql: str) -> None:
        rows = await db.execute(text(sql))
        for row in rows:
            value = str(row.season or "").strip()
            if value and value not in discovered:
                discovered.append(value)

    try:
        for table in _SEASON_TABLES:
            try:
                await collect(f"SELECT DISTINCT season FROM {table}")
            except Exception:
                # A missing or seasonless table is tolerated, as in Express.
                await db.rollback()

        try:
            has_season = (
                await db.execute(
                    text(
                        "SELECT EXISTS(SELECT 1 FROM information_schema.columns "
                        "WHERE table_schema = 'public' AND table_name = 'top_component_snapshot' "
                        "AND column_name = 'season') AS has_season"
                    )
                )
            ).scalar()
            if has_season:
                await collect("SELECT DISTINCT season FROM top_component_snapshot")
        except Exception:
            await db.rollback()

        result = list(_BUILTIN_SEASONS)
        result.extend(s for s in discovered if s not in result)
        return {"seasons": result}
    except Exception as exc:  # pragma: no cover - matches the Express catch-all
        log.error("Error fetching seasons: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch seasons"})
