"""Player profiles, rankings and regional leaderboards.

Ported from backend/src/routes/players.ts. The two endpoints in that file that
call the ChallengerMode API (`/api/players/:id/tournaments` and
`/api/players/by-nickname/:nickname/tournaments`) stay on Express until that
client is ported.
"""

import logging
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.serialization import big_number, number

router = APIRouter()
log = logging.getLogger(__name__)

_PLATFORMS = {"challengermode", "challonge"}

# Points awarded per placement, times the number of participants. Written out in
# SQL because that is where the Express version computes it too.
_PLACEMENT_POINTS = (
    "COALESCE(SUM(CASE placement WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 0 END "
    "* total_participants), 0)"
)


def _clamp(raw: str | None, default: int, low: int, high: int) -> int:
    if raw is None or raw == "":
        return default
    match = re.match(r"^\s*[-+]?\d+", raw)
    if not match:
        return default
    return max(low, min(int(match.group()), high))


def _player_row(row: Any, include_top4: bool = False) -> dict:
    """Shape used by both the leaderboard and the rankings list."""
    out = {
        "id": row.player_id or row.nickname,
        "nickname": row.nickname,
        "avatar": row.avatar,
        "totalPoints": number(row.total_points or 0),
        "tournamentsPlayed": number(row.tournaments_played or 0),
        "wins": number(row.tournaments_won or 0),
        "top3Finishes": number(row.top3_finishes or 0),
    }
    if include_top4:
        out["top4Finishes"] = number(row.top4_finishes or 0)
    else:
        out["platform"] = getattr(row, "platform", None) or "mixed"
    return out


@router.get("/api/stats/leaderboard")
async def player_leaderboard(request: Request, db: Annotated[AsyncSession, Depends(get_session)]):
    params = request.query_params
    platform = params.get("platform")
    limit = _clamp(params.get("limit"), 200, 1, 500)

    if platform and platform not in _PLATFORMS:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid platform. Use challengermode or challonge."},
        )

    try:
        if platform:
            rows = await db.execute(
                text(
                    "SELECT nickname, player_id, avatar, platform, total_points, "
                    "tournaments_played, tournaments_won, top3_finishes "
                    "FROM player_platform_stats WHERE platform = :platform "
                    "ORDER BY total_points DESC LIMIT :limit"
                ),
                {"platform": platform, "limit": limit},
            )
        else:
            rows = await db.execute(
                text(
                    "SELECT nickname, player_id, avatar, total_points, tournaments_played, "
                    "tournaments_won, top3_finishes "
                    "FROM player_leaderboard ORDER BY total_points DESC LIMIT :limit"
                ),
                {"limit": limit},
            )

        return {"players": [_player_row(r) for r in rows]}
    except Exception as exc:
        log.error("Player leaderboard error: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch player leaderboard"}
        )


@router.get("/api/player-rankings")
async def player_rankings(db: Annotated[AsyncSession, Depends(get_session)]):
    try:
        rows = await db.execute(
            text(
                "SELECT nickname, player_id, avatar, total_points, tournaments_played, "
                "tournaments_won, top3_finishes, top4_finishes "
                "FROM player_leaderboard ORDER BY total_points DESC LIMIT 100"
            )
        )
        return {"players": [_player_row(r, include_top4=True) for r in rows]}
    except Exception as exc:
        log.error("Error fetching player rankings: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Internal Server Error"})


@router.get("/api/stats/player/{nickname}")
async def player_platform_stats(
    nickname: str, db: Annotated[AsyncSession, Depends(get_session)]
):
    if not nickname:
        return JSONResponse(status_code=400, content={"error": "Nickname is required"})

    try:
        rows = (
            await db.execute(
                text(
                    'SELECT nickname, player_id AS "playerId", platform, avatar, '
                    'total_points AS "totalPoints", tournaments_played AS "tournamentsPlayed", '
                    'tournaments_won AS "wins", top3_finishes AS "top3Finishes", '
                    'top4_finishes AS "top4Finishes" '
                    "FROM player_platform_stats WHERE nickname = :nickname "
                    "ORDER BY total_points DESC"
                ),
                {"nickname": nickname},
            )
        ).all()

        if not rows:
            return JSONResponse(status_code=404, content={"error": "Player not found"})

        return [{k: number(v) for k, v in r._mapping.items()} for r in rows]
    except Exception as exc:
        log.error("Player profile error: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch player profile"})


async def _scalar(db: AsyncSession, sql: str, args: dict) -> Any:
    return (await db.execute(text(sql), args)).scalar()


@router.get("/api/players/by-nickname/{nickname}")
async def player_by_nickname(
    nickname: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    season: Annotated[str, Query()] = "",
):
    nickname = nickname.strip()
    if not nickname:
        return JSONResponse(status_code=400, content={"error": "Missing nickname"})

    season = season.strip()
    # "All Time" means no season filter; anything empty falls back to the
    # season the app launched with.
    season = "" if season == "All Time" else (season or "Off Season 2025")

    try:
        cm_player = (
            await db.execute(
                text("SELECT id, nickname, avatar FROM cm_players WHERE nickname = :n LIMIT 1"),
                {"n": nickname},
            )
        ).first()
        challonge_player = (
            await db.execute(
                text(
                    "SELECT id, nickname, avatar FROM challonge_players "
                    "WHERE nickname = :n LIMIT 1"
                ),
                {"n": nickname},
            )
        ).first()

        if cm_player is None and challonge_player is None:
            return JSONResponse(status_code=404, content={"error": "Player not found"})

        # --- Avatar: the linked account wins, then any alias that has one ---
        avatar: str | None = None
        user_id: str | None = None

        if cm_player is not None:
            linked = (
                await db.execute(
                    text("SELECT id, photo_url FROM users WHERE challenger_id = :id LIMIT 1"),
                    {"id": cm_player.id},
                )
            ).first()
            if linked is not None:
                user_id = linked.id
                avatar = linked.photo_url or None

        if avatar is None and challonge_player is not None:
            linked = (
                await db.execute(
                    text("SELECT id, photo_url FROM users WHERE challonge_id = :id LIMIT 1"),
                    {"id": challonge_player.id},
                )
            ).first()
            if linked is None:
                linked = (
                    await db.execute(
                        text(
                            "SELECT id, photo_url FROM users "
                            "WHERE LOWER(challonge_username) = LOWER(:n) LIMIT 1"
                        ),
                        {"n": nickname},
                    )
                ).first()
            if linked is not None:
                user_id = user_id or linked.id
                avatar = linked.photo_url or None

        if avatar is None and user_id is not None:
            aliases = (
                await db.execute(
                    text("SELECT alias FROM user_aliases WHERE user_id = :id"),
                    {"id": user_id},
                )
            ).all()
            for alias in aliases:
                found = await _scalar(
                    db,
                    "SELECT avatar FROM challonge_players WHERE nickname = :a LIMIT 1",
                    {"a": alias.alias},
                )
                if found:
                    avatar = found
                    break
                found = await _scalar(
                    db,
                    "SELECT avatar FROM cm_players WHERE nickname = :a LIMIT 1",
                    {"a": alias.alias},
                )
                if found:
                    avatar = found
                    break

        # --- Per-platform stats, with a top-3 count computed per platform ---
        platform_rows = (
            await db.execute(
                text(
                    "SELECT platform, total_points, tournaments_played "
                    "FROM player_platform_stats WHERE nickname = :n "
                    "ORDER BY total_points DESC"
                ),
                {"n": nickname},
            )
        ).all()

        challonge_user_id = await _scalar(
            db,
            "SELECT id FROM users WHERE challonge_username = :n LIMIT 1",
            {"n": nickname},
        )

        platform_stats = []
        for stat in platform_rows:
            top3 = 0
            if stat.platform == "challengermode" and cm_player is not None:
                top3 = await _scalar(
                    db,
                    "SELECT COUNT(DISTINCT tournament_id) FROM cm_match_results "
                    "WHERE player_id = :id AND piazzamento <= 3",
                    {"id": cm_player.id},
                )
            elif stat.platform == "challonge" and challonge_user_id:
                top3 = await _scalar(
                    db,
                    "SELECT COUNT(DISTINCT tournament_id) FROM challonge_reported_combos "
                    "WHERE user_id = :id AND rank <= 3",
                    {"id": challonge_user_id},
                )
            platform_stats.append(
                {
                    "platform": stat.platform,
                    "totalPoints": number(stat.total_points),
                    "tournamentsPlayed": number(stat.tournaments_played),
                    "top3Finishes": number(top3 or 0),
                }
            )

        total_points = sum(s["totalPoints"] for s in platform_stats)

        # --- Signature combo and blade, ChallengerMode first ---
        most_used_combo = None
        favorite_blade = None

        if cm_player is not None:
            season_clause = " AND season = :season" if season else ""
            args = {"id": cm_player.id, **({"season": season} if season else {})}

            row = (
                await db.execute(
                    text(
                        "SELECT blade, assist_blade, ratchet, bit, lock_chip, "
                        f"COUNT(*) AS use_count, {_PLACEMENT_POINTS} AS points "
                        f"FROM external_player_combos WHERE player_id = :id{season_clause} "
                        "GROUP BY blade, assist_blade, ratchet, bit, lock_chip "
                        "ORDER BY use_count DESC, points DESC LIMIT 1"
                    ),
                    args,
                )
            ).first()
            if row is not None:
                most_used_combo = {
                    "blade": str(row.blade or ""),
                    "assistBlade": str(row.assist_blade or ""),
                    "ratchet": str(row.ratchet or ""),
                    "bit": str(row.bit or ""),
                    "lockChip": str(row.lock_chip or ""),
                    "count": number(row.use_count or 0),
                    "points": number(row.points or 0),
                }

            row = (
                await db.execute(
                    text(
                        f"SELECT blade, COUNT(*) AS use_count, {_PLACEMENT_POINTS} AS points "
                        f"FROM external_player_combos WHERE player_id = :id{season_clause} "
                        "GROUP BY blade ORDER BY use_count DESC, points DESC LIMIT 1"
                    ),
                    args,
                )
            ).first()
            if row is not None:
                favorite_blade = {
                    "blade": str(row.blade or ""),
                    "count": number(row.use_count or 0),
                    "points": number(row.points or 0),
                }

        # --- Challonge fallbacks, used only where ChallengerMode had nothing ---
        if challonge_user_id:
            if most_used_combo is None:
                row = (
                    await db.execute(
                        text(
                            "SELECT blade, assist_blade, ratchet, bit, lock_chip, "
                            "COUNT(*) AS use_count FROM challonge_reported_combos "
                            "WHERE user_id = :id "
                            "GROUP BY blade, assist_blade, ratchet, bit, lock_chip "
                            "ORDER BY use_count DESC LIMIT 1"
                        ),
                        {"id": challonge_user_id},
                    )
                ).first()
                if row is not None:
                    most_used_combo = {
                        "blade": str(row.blade or ""),
                        "assistBlade": str(row.assist_blade or ""),
                        "ratchet": str(row.ratchet or ""),
                        "bit": str(row.bit or ""),
                        "lockChip": str(row.lock_chip or ""),
                        "count": number(row.use_count or 0),
                        "points": 0,
                    }

            if favorite_blade is None:
                if season:
                    row = (
                        await db.execute(
                            text(
                                "SELECT blade, COUNT(*) AS use_count "
                                "FROM challonge_reported_combos c "
                                "JOIN challonge_match_results m ON c.tournament_id = m.tournament_id "
                                "WHERE c.user_id = :id AND m.data->>'season' = :season "
                                "GROUP BY blade ORDER BY use_count DESC LIMIT 1"
                            ),
                            {"id": challonge_user_id, "season": season},
                        )
                    ).first()
                else:
                    row = (
                        await db.execute(
                            text(
                                "SELECT blade, COUNT(*) AS use_count "
                                "FROM challonge_reported_combos WHERE user_id = :id "
                                "GROUP BY blade ORDER BY use_count DESC LIMIT 1"
                            ),
                            {"id": challonge_user_id},
                        )
                    ).first()
                if row is not None:
                    favorite_blade = {
                        "blade": str(row.blade or ""),
                        "count": number(row.use_count or 0),
                        "points": 0,
                    }

        fallback_avatar = None
        if challonge_player is not None:
            fallback_avatar = challonge_player.avatar
        if fallback_avatar is None and cm_player is not None:
            fallback_avatar = cm_player.avatar

        return {
            "player": {
                "nickname": nickname,
                "avatar": avatar or fallback_avatar or None,
                "platforms": [s["platform"] for s in platform_stats],
            },
            "stats": {
                "totalPoints": number(total_points),
                "mostUsedCombo": most_used_combo,
                "favoriteBlade": favorite_blade,
            },
            "platformStats": platform_stats,
        }
    except Exception as exc:
        log.error("Unified player profile error: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch player profile"})


@router.get("/api/players/{player_id}")
async def player_by_id(
    player_id: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    season: Annotated[str, Query()] = "",
):
    player_id = player_id.strip()
    if not player_id:
        return JSONResponse(status_code=400, content={"error": "Missing player id"})

    season = season.strip()
    season = "" if season == "All Time" else (season or "Off Season 2025")

    try:
        player = (
            await db.execute(
                text("SELECT id, nickname, avatar FROM cm_players WHERE id = :id LIMIT 1"),
                {"id": player_id},
            )
        ).first()
        if player is None:
            return JSONResponse(status_code=404, content={"error": "Player not found"})

        # Rows predating the season rename are still filed under a bare
        # "Off Season", so both labels have to be accepted.
        if season.lower().startswith("off season"):
            total_points = await _scalar(
                db,
                "SELECT COALESCE(SUM(points), 0) FROM player_regional_stats "
                "WHERE player_id = :id AND (season = :season OR season = 'Off Season')",
                {"id": player_id, "season": season},
            )
        else:
            total_points = await _scalar(
                db,
                "SELECT COALESCE(SUM(points), 0) FROM player_regional_stats "
                "WHERE player_id = :id AND season = :season",
                {"id": player_id, "season": season},
            )

        combo = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, "
                    f"COUNT(*) AS use_count, {_PLACEMENT_POINTS} AS points "
                    "FROM external_player_combos WHERE player_id = :id "
                    "GROUP BY blade, assist_blade, ratchet, bit, lock_chip "
                    "ORDER BY use_count DESC, points DESC LIMIT 1"
                ),
                {"id": player_id},
            )
        ).first()

        blade = (
            await db.execute(
                text(
                    f"SELECT blade, COUNT(*) AS use_count, {_PLACEMENT_POINTS} AS points "
                    "FROM external_player_combos WHERE player_id = :id "
                    "GROUP BY blade ORDER BY use_count DESC, points DESC LIMIT 1"
                ),
                {"id": player_id},
            )
        ).first()

        return {
            "player": {"id": player.id, "nickname": player.nickname, "avatar": player.avatar},
            "stats": {
                "totalPoints": number(total_points or 0),
                "mostUsedCombo": None
                if combo is None
                else {
                    "blade": combo.blade,
                    "assistBlade": combo.assist_blade,
                    "ratchet": combo.ratchet,
                    "bit": combo.bit,
                    "lockChip": combo.lock_chip,
                    "count": number(combo.use_count or 0),
                    "points": number(combo.points or 0),
                },
                "favoriteBlade": None
                if blade is None
                else {
                    "blade": blade.blade,
                    "count": number(blade.use_count or 0),
                    "points": number(blade.points or 0),
                },
            },
        }
    except Exception as exc:
        log.error("Error fetching player profile: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Internal Server Error"})


_REGIONAL_AGGREGATE = (
    "SELECT prs.player_id, MAX(prs.player_name) AS player_name, {region_select}, "
    "{season_select}, SUM(prs.points) AS points, "
    "SUM(prs.tournaments_played) AS tournaments_played, SUM(prs.wins) AS wins, "
    "SUM(prs.top4) AS top4, MAX(p.avatar) AS avatar "
    "FROM player_regional_stats prs "
    "LEFT JOIN cm_players p ON p.id = prs.player_id"
)
_REGIONAL_ORDER = " ORDER BY points DESC, wins DESC, top4 DESC"


@router.get("/api/leaderboard/regional")
async def regional_leaderboard(request: Request, db: Annotated[AsyncSession, Depends(get_session)]):
    params = request.query_params
    region = (params.get("region") or "").strip()
    season = (params.get("season") or "").strip() or "All Time"
    platform = (params.get("platform") or "all").strip() if params.get("platform") else "all"

    args: dict = {}
    platform_clause = ""
    # Every branch aggregates except the per-season, per-region one, where the
    # rows are already unique.
    aggregated = True
    if platform not in {"all", ""}:
        platform_clause = " AND prs.platform = :platform"
        args["platform"] = platform

    try:
        if season == "All Time":
            # The all-time view ignores the platform filter, as in Express.
            if region:
                args = {"region": region}
                sql = (
                    _REGIONAL_AGGREGATE.format(
                        region_select="prs.region", season_select="'All Time' AS season"
                    )
                    + " WHERE prs.region = :region GROUP BY prs.player_id, prs.region"
                    + _REGIONAL_ORDER
                )
            else:
                args = {}
                sql = (
                    _REGIONAL_AGGREGATE.format(
                        region_select="'Global' AS region", season_select="'All Time' AS season"
                    )
                    + " GROUP BY prs.player_id"
                    + _REGIONAL_ORDER
                )
        else:
            off_season = season.lower().startswith("off season")
            args["season"] = season

            if region:
                args["region"] = region
                if off_season:
                    sql = (
                        _REGIONAL_AGGREGATE.format(
                            region_select="prs.region",
                            season_select="'Off Season 2025' AS season",
                        )
                        + " WHERE prs.region = :region AND (prs.season = :season OR prs.season = 'Off Season')"
                        + platform_clause
                        + " GROUP BY prs.player_id, prs.region"
                        + _REGIONAL_ORDER
                    )
                else:
                    # Per-season, per-region rows are already unique, so this
                    # branch selects them directly instead of aggregating.
                    aggregated = False
                    sql = (
                        "SELECT prs.player_id, prs.player_name, prs.region, prs.season, "
                        "prs.points, prs.tournaments_played, prs.wins, prs.top4, p.avatar "
                        "FROM player_regional_stats prs "
                        "LEFT JOIN cm_players p ON p.id = prs.player_id "
                        "WHERE prs.season = :season AND prs.region = :region"
                        + platform_clause
                        + " ORDER BY prs.points DESC, prs.wins DESC, prs.top4 DESC"
                    )
            else:
                if off_season:
                    sql = (
                        _REGIONAL_AGGREGATE.format(
                            region_select="'Global' AS region",
                            season_select="'Off Season 2025' AS season",
                        )
                        + " WHERE (prs.season = :season OR prs.season = 'Off Season')"
                        + platform_clause
                        + " GROUP BY prs.player_id"
                        + _REGIONAL_ORDER
                    )
                else:
                    sql = (
                        _REGIONAL_AGGREGATE.format(
                            region_select="'Global' AS region", season_select="prs.season"
                        )
                        + " WHERE prs.season = :season"
                        + platform_clause
                        + " GROUP BY prs.player_id, prs.season"
                        + _REGIONAL_ORDER
                    )

        rows = await db.execute(text(sql), args)

        # Raw db.execute in Express hands the driver's row objects straight to
        # the client, so the keys stay snake_case. The aggregated branches SUM
        # integer columns, which makes them bigint — and node-postgres renders
        # bigint as a string. The one non-aggregated branch reads the integer
        # columns directly and so keeps real numbers.
        summed = {"points", "tournaments_played", "wins", "top4"}
        return {
            "leaderboard": [
                {
                    k: (big_number(v) if aggregated and k in summed else v)
                    for k, v in r._mapping.items()
                }
                for r in rows
            ]
        }
    except Exception as exc:
        log.error("Error fetching regional leaderboard: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})
