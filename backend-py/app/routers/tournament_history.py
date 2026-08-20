"""Tournament history for a combo or a player.

These three endpoints were the last ones held back by the ChallengerMode client:
the tournament NAMES are not in our database, only the ids, so each row has to
be enriched from ChallengerMode's API (served from `external_api_cache` in
practice). Ported from routes/stats.ts and routes/players.ts.
"""

import logging
from datetime import date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.lib.challengermode import fetch_tournament_detail
from app.lib.challonge_points import calculate_challonge_points
from app.routers.stats import _clamp, _is_all_time
from app.serialization import number

router = APIRouter()
log = logging.getLogger(__name__)


def _day(value: Any) -> str | None:
    """The YYYY-MM-DD form the client expects, from a date, datetime or string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def _sort_key(item: dict) -> str:
    # Newest first. Missing dates sort last, as they do in Express where an
    # absent date becomes epoch 0.
    return item.get("date") or ""


async def _detail_or_none(db: AsyncSession, tournament_id: str) -> dict | None:
    try:
        return await fetch_tournament_detail(db, tournament_id)
    except Exception:
        # A tournament that cannot be resolved still belongs in the list, just
        # without its name — matching the try/catch around each fetch in Express.
        return None


def _started_at(detail: dict | None) -> str | None:
    if not detail:
        return None
    started = (detail.get("schedule") or {}).get("startedAt")
    return str(started)[:10] if started else None


@router.get("/api/stats/combos/{combo_key}/tournaments")
async def combo_tournaments(
    combo_key: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
):
    key = combo_key.strip()
    if not key:
        return JSONResponse(status_code=400, content={"error": "Missing combo key"})

    parts = key.split("|")
    if len(parts) != 5:
        return JSONResponse(status_code=400, content={"error": "Invalid key format"})
    blade, assist, ratchet, bit, chip = parts

    params = request.query_params
    season = (params.get("season") or "").strip()
    all_time = not season or _is_all_time(season)
    limit = _clamp(params.get("limit"), 200, 1, 500)

    args = {
        "blade": blade,
        "assist": assist,
        "ratchet": ratchet,
        "bit": bit,
        "chip": chip,
        "limit": limit,
    }

    try:
        season_clause = "" if all_time else " AND epc.season = :season"
        if not all_time:
            args["season"] = season

        cm_rows = (
            await db.execute(
                text(
                    "SELECT epc.tournament_id, epc.player_id, cm.nickname as player_name, "
                    "epc.placement, epc.total_participants, epc.tournament_date as date, epc.season "
                    "FROM external_player_combos epc "
                    "JOIN cm_players cm ON epc.player_id = cm.id "
                    "WHERE epc.blade = :blade AND epc.assist_blade = :assist "
                    "AND epc.ratchet = :ratchet AND epc.bit = :bit AND epc.lock_chip = :chip "
                    f"AND epc.placement <= 4{season_clause} "
                    "ORDER BY epc.tournament_date DESC LIMIT :limit"
                ),
                args,
            )
        ).all()

        tournaments: list[dict] = []
        for row in cm_rows:
            detail = await _detail_or_none(db, str(row.tournament_id))
            # Note: this is a literal placement x participants, NOT the placement
            # scoring used elsewhere. Kept as-is.
            points = (
                int(row.placement) * int(row.total_participants)
                if row.placement and row.total_participants
                else 0
            )
            tournaments.append(
                {
                    "tournamentId": str(row.tournament_id),
                    "tournamentName": (detail or {}).get("name")
                    or f"Tournament {row.tournament_id}",
                    "date": _day(row.date) or _started_at(detail),
                    "playerName": row.player_name,
                    "playerId": row.player_id,
                    "placement": number(row.placement) if row.placement is not None else None,
                    "totalParticipants": number(row.total_participants or 0),
                    "points": points,
                    "platform": "challengermode",
                    "season": row.season or "Unknown",
                }
            )

        challonge_clause = "" if all_time else " AND crc.season = :season"
        challonge_rows = (
            await db.execute(
                text(
                    "SELECT crc.tournament_id, "
                    "COALESCE(crc.tournament_name, mr.data->>'tournament_name', mr.data->>'name', "
                    "mr.data->'tournament'->>'name') as tournament_name, "
                    "crc.created_at as date, u.display_name as player_name, u.id as player_id, "
                    "crc.rank as placement, crc.season, "
                    "COALESCE(NULLIF((mr.data->>'participants_count')::int, 0), "
                    "NULLIF((mr.data->>'total_players')::int, 0), "
                    "jsonb_array_length(mr.data->'standings')) as total_participants "
                    "FROM challonge_reported_combos crc "
                    "JOIN users u ON crc.user_id = u.id "
                    "LEFT JOIN challonge_match_results mr ON crc.tournament_id = mr.tournament_id "
                    "WHERE crc.blade = :blade AND COALESCE(crc.assist_blade, 'None') = :assist "
                    "AND crc.ratchet = :ratchet AND crc.bit = :bit "
                    "AND COALESCE(crc.lock_chip, 'None') = :chip "
                    f"AND crc.rank <= 4{challonge_clause} "
                    "ORDER BY crc.created_at DESC LIMIT :limit"
                ),
                args,
            )
        ).all()

        for row in challonge_rows:
            tournaments.append(
                {
                    "tournamentId": str(row.tournament_id),
                    "tournamentName": str(row.tournament_name)
                    if row.tournament_name
                    else f"Tournament {row.tournament_id}",
                    "date": _day(row.date),
                    "playerName": row.player_name or "Unknown",
                    "playerId": row.player_id,
                    "placement": number(row.placement) if row.placement is not None else None,
                    "totalParticipants": number(row.total_participants or 0),
                    "points": calculate_challonge_points(row.placement, row.total_participants),
                    "platform": "challonge",
                    "season": row.season or "Unknown",
                }
            )

        tournaments.sort(key=_sort_key, reverse=True)
        return {"tournaments": tournaments[:limit]}
    except Exception as exc:
        log.error("Combo tournaments error: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch combo tournaments"}
        )


@router.get("/api/players/by-nickname/{nickname}/tournaments")
async def player_tournaments_by_nickname(
    nickname: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
):
    nickname = nickname.strip()
    if not nickname:
        return JSONResponse(status_code=400, content={"error": "Missing nickname"})

    season_raw = (request.query_params.get("season") or "").strip()
    season = "" if (not season_raw or _is_all_time(season_raw)) else season_raw

    try:
        tournaments: list[dict] = []

        cm_player_id = (
            await db.execute(
                text("SELECT id FROM cm_players WHERE nickname = :n LIMIT 1"), {"n": nickname}
            )
        ).scalar()

        if cm_player_id:
            args: dict = {"id": cm_player_id}
            season_clause = ""
            if season:
                season_clause = " AND season = :season"
                args["season"] = season

            rows = (
                await db.execute(
                    text(
                        "SELECT tournament_id, MAX(data_torneo) AS date, "
                        "MIN(piazzamento) AS best_placement, SUM(punti_guadagnati) AS total_points, "
                        "COUNT(*) AS combo_count FROM cm_match_results "
                        f"WHERE player_id = :id{season_clause} "
                        "GROUP BY tournament_id ORDER BY date DESC LIMIT 25"
                    ),
                    args,
                )
            ).all()

            for row in rows:
                detail = await _detail_or_none(db, str(row.tournament_id))
                tournaments.append(
                    {
                        "tournamentId": str(row.tournament_id),
                        "date": _day(row.date) or _started_at(detail),
                        "name": (detail or {}).get("name"),
                        "bestPlacement": number(row.best_placement)
                        if row.best_placement is not None
                        else None,
                        "totalPoints": number(row.total_points or 0),
                        "comboCount": number(row.combo_count or 0),
                        "platform": "challengermode",
                    }
                )

        challonge_user_id = (
            await db.execute(
                text("SELECT id FROM users WHERE challonge_username = :n LIMIT 1"),
                {"n": nickname},
            )
        ).scalar()

        if challonge_user_id:
            args = {"id": challonge_user_id}
            season_clause = ""
            if season:
                season_clause = " AND c.season = :season"
                args["season"] = season

            rows = (
                await db.execute(
                    text(
                        "SELECT c.tournament_id, MAX(c.tournament_name) AS tournament_name, "
                        "MIN(c.rank) AS best_placement, COUNT(DISTINCT c.id) AS combo_count, "
                        "MAX(c.created_at) AS date, "
                        "(SELECT COALESCE(NULLIF((m2.data->>'participants_count')::int, 0), "
                        "NULLIF((m2.data->>'total_players')::int, 0), "
                        "jsonb_array_length(m2.data->'standings')) "
                        "FROM challonge_match_results m2 WHERE m2.tournament_id = c.tournament_id LIMIT 1) "
                        "as total_participants "
                        "FROM challonge_reported_combos c "
                        f"WHERE c.user_id = :id{season_clause} "
                        "GROUP BY c.tournament_id ORDER BY date DESC LIMIT 25"
                    ),
                    args,
                )
            ).all()

            for row in rows:
                tournaments.append(
                    {
                        "tournamentId": str(row.tournament_id),
                        "date": _day(row.date),
                        "name": str(row.tournament_name) if row.tournament_name else None,
                        "bestPlacement": number(row.best_placement)
                        if row.best_placement is not None
                        else None,
                        "totalPoints": calculate_challonge_points(
                            row.best_placement, row.total_participants
                        ),
                        "comboCount": number(row.combo_count or 0),
                        "platform": "challonge",
                    }
                )
        else:
            # No linked account: fall back to standings scraped into the raw
            # Challonge payloads, where the player appears by name only.
            rows = (
                await db.execute(
                    text(
                        "SELECT c.tournament_id, c.data->>'tournament_name' as tournament_name, "
                        "c.data->>'start_date' as date, (s->>'rank')::int as rank, "
                        "COALESCE(NULLIF((c.data->>'participants_count')::int, 0), "
                        "NULLIF((c.data->>'total_players')::int, 0), "
                        "jsonb_array_length(c.data->'standings')) as total_participants "
                        "FROM challonge_match_results c, jsonb_array_elements(c.data->'standings') as s "
                        "WHERE COALESCE(s->'participant'->>'name', s->>'name', "
                        "s->'participant'->>'display_name') = :n "
                        "ORDER BY c.data->>'start_date' DESC LIMIT 50"
                    ),
                    {"n": nickname},
                )
            ).all()

            for row in rows:
                tournaments.append(
                    {
                        "tournamentId": str(row.tournament_id),
                        "date": _day(row.date),
                        "name": row.tournament_name or f"Torneo {row.tournament_id}",
                        "bestPlacement": row.rank,
                        "totalPoints": calculate_challonge_points(
                            row.rank, row.total_participants
                        ),
                        "comboCount": 0,
                        "platform": "challonge",
                    }
                )

        # One entry per tournament: prefer the record that has a name, and then
        # the better placement.
        deduped: dict[str, dict] = {}
        for item in tournaments:
            existing = deduped.get(item["tournamentId"])
            if existing is None:
                deduped[item["tournamentId"]] = item
                continue
            prefer_new = (not existing.get("name") and item.get("name")) or (
                existing.get("name")
                and item.get("name")
                and (item.get("bestPlacement") or 999) < (existing.get("bestPlacement") or 999)
            )
            if prefer_new:
                deduped[item["tournamentId"]] = item

        unique = sorted(deduped.values(), key=_sort_key, reverse=True)
        return {"tournaments": unique[:50]}
    except Exception as exc:
        log.error("Unified player tournaments error: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch player tournaments"}
        )


@router.get("/api/players/{player_id}/tournaments")
async def player_tournaments_by_id(
    player_id: str, db: Annotated[AsyncSession, Depends(get_session)]
):
    player_id = player_id.strip()
    if not player_id:
        return JSONResponse(status_code=400, content={"error": "Missing player id"})

    try:
        rows = (
            await db.execute(
                text(
                    "SELECT tournament_id, MAX(data_torneo) AS date, "
                    "MIN(piazzamento) AS best_placement, SUM(punti_guadagnati) AS total_points, "
                    "COUNT(*) AS combo_count FROM cm_match_results WHERE player_id = :id "
                    "GROUP BY tournament_id ORDER BY date DESC LIMIT 50"
                ),
                {"id": player_id},
            )
        ).all()

        out = []
        for row in rows:
            detail = await _detail_or_none(db, str(row.tournament_id))
            out.append(
                {
                    "tournamentId": str(row.tournament_id),
                    "date": _day(row.date) or _started_at(detail),
                    "bestPlacement": number(row.best_placement)
                    if row.best_placement is not None
                    else None,
                    "totalPoints": number(row.total_points or 0),
                    "comboCount": number(row.combo_count or 0),
                    "name": (detail or {}).get("name"),
                }
            )

        return {"tournaments": out}
    except Exception as exc:
        log.error("Error fetching player tournaments: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Internal Server Error"})
