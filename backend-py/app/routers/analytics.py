"""Meta analytics, trends and component synergy.

Ported from backend/src/routes/analytics.ts.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.lib.seasons import determine_season
from app.serialization import big_number, number

router = APIRouter()
log = logging.getLogger(__name__)

_ALL_TIME = {"", "all", "all time", "all-time"}

# Points awarded for a placement, before the participant-count multiplier.
_PLACEMENT_SCORE = {1: 10, 2: 7, 3: 5, 4: 3}


@router.get("/api/analytics/meta")
async def meta(
    db: Annotated[AsyncSession, Depends(get_session)],
    season: Annotated[str, Query()] = "",
    platform: Annotated[str, Query()] = "all",
):
    season = season.strip()
    all_time = season.lower() in _ALL_TIME
    platform = platform.strip().lower()

    try:
        sql = (
            'SELECT blade, assist_blade AS "assistBlade", ratchet, bit, '
            'lock_chip AS "lockChip", rank, date, '
            'participant_count AS "participantCount", platform, season '
            "FROM unified_meta_view"
        )
        args: dict = {}
        if platform and platform != "all":
            sql += " WHERE platform = :platform"
            args["platform"] = platform

        rows = await db.execute(text(sql), args)

        points: dict[str, dict[str, float]] = {k: {} for k in ("blade", "ratchet", "bit", "combo")}
        counts: dict[str, dict[str, int]] = {k: {} for k in ("blade", "ratchet", "bit", "combo")}

        def add(bucket: str, name: str, value: float) -> None:
            points[bucket][name] = points[bucket].get(name, 0) + value
            counts[bucket][name] = counts[bucket].get(name, 0) + 1

        for row in rows:
            rank = row.rank
            if not rank or rank > 4:
                continue

            if not all_time and season:
                if row.date is None or determine_season(row.date) != season:
                    continue

            earned = _PLACEMENT_SCORE.get(rank, 0) * (row.participantCount or 0)
            if earned == 0:
                continue

            if row.blade:
                add("blade", row.blade, earned)
            if row.ratchet:
                add("ratchet", row.ratchet, earned)
            if row.bit:
                add("bit", row.bit, earned)

            if row.blade and row.ratchet and row.bit:
                assist = row.assistBlade if row.assistBlade and row.assistBlade != "None" else None
                chip = row.lockChip if row.lockChip and row.lockChip != "None" else None
                label = row.blade
                if assist:
                    label += f" ({assist})"
                label += f" {row.ratchet} {row.bit}"
                if chip:
                    label += f" ({chip})"
                add("combo", label, earned)

        def as_list(bucket: str) -> list[dict]:
            return sorted(
                (
                    {"name": name, "totalPoints": number(total), "count": counts[bucket][name]}
                    for name, total in points[bucket].items()
                ),
                key=lambda item: item["totalPoints"],
                reverse=True,
            )

        return {
            "topBlades": as_list("blade"),
            "topRatchets": as_list("ratchet"),
            "topBits": as_list("bit"),
            "topCombos": as_list("combo"),
        }
    except Exception as exc:
        log.error("Analytics Meta Error: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch analytics meta"})


# Season windows are expressed as literal date bounds rather than by calling
# determine_season per row, exactly as the SQL in the Express version does.
_CM_SEASON_FILTER = {
    "Season 2026": " AND cm.data_torneo >= '2026-02-01'",
    "Off Season 2025": " AND cm.data_torneo >= '2025-10-01' AND cm.data_torneo <= '2026-01-31'",
    "Season 2025": " AND cm.data_torneo >= '2025-01-01' AND cm.data_torneo < '2025-10-01'",
}
_EPC_SEASON_FILTER = {
    "Season 2026": " AND epc.tournament_date >= '2026-02-01'",
    "Off Season 2025": " AND epc.tournament_date >= '2025-10-01' AND epc.tournament_date <= '2026-01-31'",
    "Season 2025": " AND epc.tournament_date >= '2025-01-01' AND epc.tournament_date < '2025-10-01'",
}


def _points_query(bucket: str, cm_filter: str) -> str:
    """Points earned per component per period, from ChallengerMode results only."""
    parts = [
        f"SELECT {bucket} AS month, '{component}' AS component_type, cm.{column} AS name, "
        f"SUM(cm.punti_guadagnati) AS total_points "
        f"FROM cm_match_results cm WHERE 1=1{cm_filter} GROUP BY month, cm.{column}"
        for component, column in (("blade", "blade"), ("ratchet", "ratchet"), ("bit", "bit"))
    ]
    return " UNION ALL ".join(parts)


def _count_query(bucket: str, group_by: str, cm_filter: str, epc_filter: str) -> str:
    """Appearances per component per period, across both platforms."""
    combined = (
        "WITH combined_data AS ("
        f"SELECT data_torneo as date, blade, ratchet, bit FROM cm_match_results cm WHERE 1=1{cm_filter}"
        " UNION ALL "
        f"SELECT tournament_date as date, blade, ratchet, bit FROM external_player_combos epc WHERE 1=1{epc_filter}"
        ") "
    )
    parts = [
        f"SELECT {bucket} AS month, '{component}' AS component_type, {component} AS name, "
        f"COUNT(*) AS total_points FROM combined_data GROUP BY {group_by}, {component}"
        for component in ("blade", "ratchet", "bit")
    ]
    return combined + " UNION ALL ".join(parts)


@router.get("/api/trends")
async def trends(
    db: Annotated[AsyncSession, Depends(get_session)],
    metric: Annotated[str, Query()] = "points",
    granularity: Annotated[str, Query()] = "month",
    season: Annotated[str, Query()] = "",
):
    metric = "count" if metric.lower() == "count" else "points"
    granularity = "week" if granularity.lower() == "week" else "month"
    season = season.strip()

    cm_filter = _CM_SEASON_FILTER.get(season, "")
    epc_filter = _EPC_SEASON_FILTER.get(season, "")

    if metric == "points":
        bucket = (
            "to_char(cm.data_torneo, 'YYYY-MM-01')"
            if granularity == "month"
            else "to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD')"
        )
        query = _points_query(bucket, cm_filter)
    elif granularity == "month":
        query = _count_query("to_char(date, 'YYYY-MM-01')", "month", cm_filter, epc_filter)
    else:
        # Weekly counts group by the raw date, not by the formatted bucket —
        # keeping the Express behaviour, which yields one row per day.
        query = _count_query("to_char(date, 'YYYY-MM-DD')", "date", cm_filter, epc_filter)

    try:
        rows = await db.execute(text(query))
        return [
            {
                "month": r.month,
                "component_type": r.component_type,
                "name": r.name,
                # COUNT(*) is a bigint (string); SUM over the points column
                # is double precision (number).
                "total_points": big_number(r.total_points) if metric == "count" else number(r.total_points),
            }
            for r in rows
        ]
    except Exception as exc:
        log.error("Error fetching trend data: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Internal Server Error"})


_SYNERGY_COLUMNS = {
    "blade": "blade",
    "ratchet": "ratchet",
    "bit": "bit",
    "assist-blade": "assist_blade",
    "lock-chip": "lock_chip",
}

# Which partners to report for each component type, and whether the 'None'
# placeholder should be filtered out of that partner's own column.
_SYNERGY_PARTNERS: dict[str, list[tuple[str, str, bool]]] = {
    "blade": [
        ("topAssistBlades", "assist_blade", True),
        ("topRatchets", "ratchet", False),
        ("topBits", "bit", False),
        ("topLockChips", "lock_chip", True),
    ],
    "ratchet": [
        ("topBlades", "blade", False),
        ("topBits", "bit", False),
        ("topAssistBlades", "assist_blade", True),
        ("topLockChips", "lock_chip", True),
    ],
    "bit": [
        ("topBlades", "blade", False),
        ("topRatchets", "ratchet", False),
        ("topAssistBlades", "assist_blade", True),
        ("topLockChips", "lock_chip", True),
    ],
    "assist-blade": [
        ("topBlades", "blade", False),
        ("topRatchets", "ratchet", False),
        ("topBits", "bit", False),
        ("topLockChips", "lock_chip", True),
    ],
    "lock-chip": [
        ("topBlades", "blade", False),
        ("topRatchets", "ratchet", False),
        ("topBits", "bit", False),
        ("topAssistBlades", "assist_blade", True),
    ],
}


@router.get("/api/synergy")
async def synergy(request: Request, db: Annotated[AsyncSession, Depends(get_session)]):
    kind = (request.query_params.get("type") or "").lower()
    name = (request.query_params.get("name") or "").strip()

    if kind not in _SYNERGY_COLUMNS:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid type. Use blade, ratchet, bit, assist-blade, or lock-chip."},
        )
    if not name:
        return JSONResponse(status_code=400, content={"error": "Missing name parameter"})

    selected = _SYNERGY_COLUMNS[kind]

    try:
        response: dict[str, list[dict]] = {}
        for key, partner, exclude_none in _SYNERGY_PARTNERS[kind]:
            # Column names come from the fixed maps above, never from user input;
            # only the component name is a bound parameter.
            none_filter = f"AND {partner} <> 'None'" if exclude_none else ""
            rows = await db.execute(
                text(
                    f"SELECT {partner} AS name, SUM(punteggio_totale) AS points "
                    f"FROM combo_stats WHERE {selected} = :name {none_filter} "
                    f"GROUP BY {partner} ORDER BY points DESC LIMIT 5"
                ),
                {"name": name},
            )
            response[key] = [{"name": r.name, "points": number(r.points)} for r in rows]

        return response
    except Exception as exc:
        log.error("Error fetching synergy data: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Internal Server Error"})
