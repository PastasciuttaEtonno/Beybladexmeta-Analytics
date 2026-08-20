"""Tournament listing and detail.

Ported from backend/src/routes/tournaments.ts (read endpoints only; the claim
and combo-editing writes stay on Express for now).

Most of the content here is not ours: the tournament list and each tournament's
schedule and participants come from ChallengerMode, and are read through the
shared external_api_cache. Only region/city/organizer and which tournaments have
combos recorded come from our own tables.
"""

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, get_current_user
from app.db import get_session
from app.lib.challengermode import fetch_tournament_detail, fetch_tournaments_for_game
from app.lib.seasons import determine_season
from app.serialization import js_datetime, number

router = APIRouter()
log = logging.getLogger(__name__)

DEFAULT_AFTER = "2024-01-01T00:00:00Z"

# How many tournament details to resolve at once. Matches the Express worker
# pool; they are cache hits in the normal case, so this only matters on a cold
# cache.
DETAIL_CONCURRENCY = 6


async def _ids_with_combos(db: AsyncSession) -> set[str]:
    """Tournaments that have at least one combo recorded, on either platform."""
    rows = await db.execute(
        text(
            "SELECT DISTINCT tournament_id FROM cm_match_results "
            "UNION SELECT DISTINCT tournament_id FROM challonge_reported_combos "
            "UNION SELECT DISTINCT tournament_id FROM external_player_combos"
        )
    )
    return {str(r.tournament_id) for r in rows}


def _challonge_node(row: Any) -> dict:
    """A raw Challonge payload reshaped to look like a ChallengerMode node."""
    data = row.data or {}
    tournament = data.get("tournament") or {}

    name = (
        data.get("tournament_name")
        or data.get("name")
        or tournament.get("name")
        or "Unknown Tournament"
    )
    started = data.get("start_date") or data.get("started_at") or tournament.get("started_at")
    players = (
        data.get("total_players")
        or data.get("participants_count")
        or tournament.get("participants_count")
        or 0
    )
    url = data.get("full_challonge_url") or tournament.get("full_challonge_url")

    return {
        "id": row.tournament_id,
        "name": name,
        "description": data.get("description") or "",
        "state": data.get("state") or "ended",
        "contactUrl": url,
        "schedule": {"startedAt": started},
        "gameTitle": {"title": "Beyblade X"},
        "hasCombos": False,
        "region": None,
        "city": None,
        "organizerName": None,
        "platform": "challonge",
        "attendance": {"signups": {"uCount": players, "count": players}},
    }


def _started_at(node: dict) -> str:
    schedule = node.get("schedule") or {}
    return str(schedule.get("startedAt") or "")


@router.get("/api/tournaments")
async def list_tournaments(request: Request, db: Annotated[AsyncSession, Depends(get_session)]):
    params = request.query_params
    region = (params.get("region") or "").strip()
    platform = (params.get("platform") or "all").strip().lower()
    season = (params.get("season") or "").strip()
    after = params.get("after") or DEFAULT_AFTER

    try:
        cm_nodes: list[dict] = []
        if platform in ("all", "challengermode"):
            try:
                cm_nodes = await fetch_tournaments_for_game(db, after)
            except Exception as exc:
                # A ChallengerMode outage degrades the list rather than failing it.
                log.error("Error fetching CM tournaments: %s", exc)

        challonge_nodes: list[dict] = []
        if platform in ("all", "challonge"):
            rows = await db.execute(
                text("SELECT tournament_id, data, fetched_at FROM challonge_match_results")
            )
            challonge_nodes = [_challonge_node(r) for r in rows]

            if season:
                challonge_nodes = [
                    n
                    for n in challonge_nodes
                    if _started_at(n)
                    and determine_season_of(_started_at(n)) == season
                ]

        id_set = await _ids_with_combos(db)

        meta_rows = await db.execute(
            text(
                "SELECT id, region, city, organizer_name FROM tournaments_view"
                + (" WHERE region = :region" if region else "")
            ),
            {"region": region} if region else {},
        )
        meta_map = {str(r.id): r for r in meta_rows}

        out: list[dict] = []

        # Challonge entries carry no region, so a region filter drops them all.
        for node in challonge_nodes:
            node["hasCombos"] = str(node["id"]) in id_set
            if not region:
                out.append(node)

        async def resolve(node: dict) -> dict:
            tournament_id = str(node["id"])
            meta = meta_map.get(tournament_id)
            enriched = {
                **node,
                "hasCombos": tournament_id in id_set,
                "region": getattr(meta, "region", None),
                "city": getattr(meta, "city", None),
                "platform": "challengermode",
            }

            # `organizerName` is subtle: JSON.stringify DROPS a key whose value
            # is undefined but KEEPS one that is null, and the Express code
            # produces each in different situations. So the key is only set when
            # Express would have set it.
            try:
                detail = await fetch_tournament_detail(db, tournament_id)
                enriched["hosts"] = detail.get("hosts")
                enriched["schedule"] = detail.get("schedule")
                organizer = getattr(meta, "organizer_name", None) or _first_space_name(detail)
                if organizer is not None:
                    enriched["organizerName"] = organizer
            except Exception:
                # Here Express reads meta.organizer_name directly: absent when
                # there is no row at all, null when the row has no organiser.
                if meta is not None:
                    enriched["organizerName"] = meta.organizer_name
            return enriched

        if cm_nodes:
            semaphore = asyncio.Semaphore(DETAIL_CONCURRENCY)

            async def guarded(node: dict) -> dict:
                async with semaphore:
                    return await resolve(node)

            out.extend(await asyncio.gather(*(guarded(n) for n in cm_nodes)))

        out.sort(key=_started_at, reverse=True)

        if season:
            out = [
                t for t in out if _started_at(t) and determine_season_of(_started_at(t)) == season
            ]

        if region:
            out = [t for t in out if t.get("region") == region]

        return {"tournaments": out}
    except Exception as exc:
        log.error("Error fetching unified tournaments: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})


def _first_space_name(detail: dict | None) -> str | None:
    spaces = ((detail or {}).get("hosts") or {}).get("spaces") or []
    return spaces[0].get("name") if spaces and isinstance(spaces[0], dict) else None


def determine_season_of(started_at: str) -> str | None:
    """Season for an ISO timestamp string, or None when it cannot be parsed."""
    from datetime import datetime

    try:
        return determine_season(datetime.fromisoformat(started_at.replace("Z", "+00:00")))
    except ValueError:
        return None


@router.get("/api/challengermode/tournaments")
async def challengermode_tournaments(
    db: Annotated[AsyncSession, Depends(get_session)],
    after: Annotated[str, Query()] = DEFAULT_AFTER,
):
    try:
        nodes = await fetch_tournaments_for_game(db, after)
        rows = await db.execute(text("SELECT DISTINCT tournament_id FROM cm_match_results"))
        id_set = {str(r.tournament_id) for r in rows}
        return {
            "tournaments": [{**n, "hasCombos": str(n.get("id")) in id_set} for n in nodes]
        }
    except Exception as exc:
        log.error("Error fetching Challengermode tournaments: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})


def _normalise(value: Any) -> str:
    return str(value or "").strip().lower()


async def _challonge_detail(
    db: AsyncSession, tournament_id: str, row: Any, user: CurrentUser | None
) -> dict:
    """Detail for a tournament whose results were imported from Challonge."""
    data = row.data or {}

    reported = (
        await db.execute(
            text(
                "SELECT c.*, u.display_name, u.photo_url, 'challonge' as source_type "
                "FROM challonge_reported_combos c JOIN users u ON u.id = c.user_id "
                "WHERE c.tournament_id = :id ORDER BY c.rank ASC, c.combo_number ASC"
            ),
            {"id": tournament_id},
        )
    ).all()

    admin_entered = (
        await db.execute(
            text(
                "SELECT e.*, e.placement as rank, 'admin' as source_type "
                "FROM external_player_combos e "
                "WHERE e.tournament_id = :id AND e.platform = 'challonge' "
                "ORDER BY e.combo_number ASC"
            ),
            {"id": tournament_id},
        )
    ).all()

    combos: list[dict] = [_row_to_dict(r) for r in reported]
    for entry in admin_entered:
        as_dict = _row_to_dict(entry)
        as_dict["player_identifier"] = as_dict.get("player_id")
        combos.append(as_dict)

    # Names this viewer is allowed to be recognised as.
    own_names: list[str] = []
    if user is not None:
        aliases = (
            await db.execute(
                text("SELECT alias FROM user_aliases WHERE user_id = :id AND is_verified = TRUE"),
                {"id": user.id},
            )
        ).all()
        own_names = [a.alias for a in aliases]
        challonge_username = (
            await db.execute(
                text("SELECT challonge_username FROM users WHERE id = :id"), {"id": user.id}
            )
        ).scalar()
        if challonge_username:
            own_names.append(challonge_username)

    standings = data.get("standings") or []
    top = [p for p in standings if (p.get("rank") or 99) <= 4]

    ids: list[str] = []
    usernames: list[str] = []
    for participant in top:
        raw = participant.get("participant") or participant
        if raw.get("user_id"):
            ids.append(str(raw["user_id"]))
        for key in ("username", "challonge_username", "name", "display_name"):
            if raw.get(key):
                usernames.append(str(raw[key]).lower())

    # Prefer the avatar from a linked account over whatever Challonge stored.
    avatars: dict[str, str] = {}
    if ids or usernames:
        try:
            clauses, args = [], {}
            if ids:
                clauses.append("challonge_id = ANY(:ids)")
                args["ids"] = ids
            if usernames:
                clauses.append("LOWER(challonge_username) = ANY(:names)")
                clauses.append("LOWER(display_name) = ANY(:names)")
                args["names"] = usernames
            found = (
                await db.execute(
                    text(
                        "SELECT challonge_id, challonge_username, display_name, photo_url "
                        f"FROM users WHERE {' OR '.join(clauses)}"
                    ),
                    args,
                )
            ).all()
            for candidate in found:
                if not candidate.photo_url:
                    continue
                if candidate.challonge_id:
                    avatars[f"id:{candidate.challonge_id}"] = candidate.photo_url
                if candidate.challonge_username:
                    avatars[f"name:{candidate.challonge_username.lower()}"] = candidate.photo_url
                if candidate.display_name:
                    avatars[f"name:{candidate.display_name.lower()}"] = candidate.photo_url
        except Exception as exc:
            log.error("Failed to fetch users for avatars: %s", exc)

    participants = []
    for participant in sorted(top, key=lambda p: p.get("rank") or 99):
        raw = participant.get("participant") or participant
        name = participant.get("name") or participant.get("username") or ""
        normalised = _normalise(name)

        is_viewer = any(_normalise(v) == normalised for v in own_names)
        if not is_viewer:
            display = _normalise(participant.get("display_name") or participant.get("display_user"))
            if display and display != normalised:
                is_viewer = any(_normalise(v) == display for v in own_names)

        avatar = (
            raw.get("avatar_url")
            or raw.get("attached_participatable_portrait_url")
            or raw.get("portrait_url")
        )
        raw_id = str(raw["user_id"]) if raw.get("user_id") else None
        raw_name = _normalise(
            raw.get("username")
            or raw.get("challonge_username")
            or raw.get("name")
            or raw.get("display_name")
        )
        if raw_id and f"id:{raw_id}" in avatars:
            avatar = avatars[f"id:{raw_id}"]
        elif raw_name and f"name:{raw_name}" in avatars:
            avatar = avatars[f"name:{raw_name}"]

        participants.append(
            {
                "id": participant.get("name") or participant.get("id"),
                "username": name,
                "placement": participant.get("rank"),
                "isCurrentUser": is_viewer,
                "deck": [],
                "profilePicture": {"url": avatar},
            }
        )

    return {
        "id": row.tournament_id,
        "name": data.get("tournament_name") or "Unknown Tournament",
        "date": data.get("start_date"),
        "schedule": {"startedAt": data.get("start_date")},
        "platform": "challonge",
        "state": "COMPLETED",
        "participants": participants,
        "fetchedCombos": combos,
        "hasCombos": len(combos) > 0,
        "attendance": {"signups": {"uCount": data.get("total_players") or 0, "lineups": []}},
    }


def _row_to_dict(row: Any) -> dict:
    """A raw row as Express would serialise it: snake_case, JS-style dates."""
    out = {}
    for key, value in row._mapping.items():
        if hasattr(value, "isoformat"):
            out[key] = js_datetime(value) if hasattr(value, "hour") else value.isoformat()
        else:
            out[key] = number(value) if isinstance(value, (int, float)) else value
    return out


@router.get("/api/tournaments/{tournament_id}")
async def tournament_detail(
    tournament_id: str,
    db: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[CurrentUser | None, Depends(get_current_user)],
):
    if not tournament_id:
        return JSONResponse(status_code=400, content={"error": "Missing tournament id"})

    try:
        challonge = (
            await db.execute(
                text("SELECT * FROM challonge_match_results WHERE tournament_id = :id LIMIT 1"),
                {"id": tournament_id},
            )
        ).first()

        if challonge is not None:
            return {"detail": await _challonge_detail(db, tournament_id, challonge, user)}

        try:
            detail = await fetch_tournament_detail(db, tournament_id)
        except Exception:
            return JSONResponse(status_code=404, content={"error": "Tournament not found"})

        meta = (
            await db.execute(
                text("SELECT region, city, organizer_name FROM tournaments_view WHERE id = :id"),
                {"id": tournament_id},
            )
        ).first()

        enriched = {
            **detail,
            "region": getattr(meta, "region", None),
            "city": getattr(meta, "city", None),
            "platform": "challengermode",
        }
        organizer = getattr(meta, "organizer_name", None) or _first_space_name(detail)
        if organizer is not None:
            enriched["organizerName"] = organizer

        return {"detail": enriched}
    except Exception as exc:
        log.error("Error fetching tournament detail: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch tournament detail"}
        )


@router.get("/api/tournaments/{tournament_id}/players/{player_id}/combos")
async def player_combos(
    tournament_id: str, player_id: str, db: Annotated[AsyncSession, Depends(get_session)]
):
    tournament_id, player_id = tournament_id.strip(), player_id.strip()
    if not tournament_id or not player_id:
        return JSONResponse(
            status_code=400, content={"error": "Missing tournament or player id"}
        )

    try:
        # Combos the player reported themselves win over the admin-entered ones.
        rows = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, season, "
                    "created_at AS lock_time FROM challonge_reported_combos "
                    "WHERE tournament_id = :tid AND user_id = :pid ORDER BY combo_number ASC"
                ),
                {"tid": tournament_id, "pid": player_id},
            )
        ).all()

        if not rows:
            rows = (
                await db.execute(
                    text(
                        "SELECT blade, assist_blade, ratchet, bit, lock_chip, season, "
                        "updated_at AS lock_time FROM external_player_combos "
                        "WHERE tournament_id = :tid AND player_id = :pid ORDER BY combo_number ASC"
                    ),
                    {"tid": tournament_id, "pid": player_id},
                )
            ).all()

        return {
            "combos": [
                {
                    "blade": r.blade,
                    "assistBlade": r.assist_blade or "None",
                    "ratchet": r.ratchet,
                    "bit": r.bit,
                    "lockChip": r.lock_chip or "None",
                    "season": r.season,
                    "lockTime": js_datetime(r.lock_time),
                }
                for r in rows
            ]
        }
    except Exception as exc:
        log.error("Failed to fetch player combos: %s", exc)
        return JSONResponse(status_code=500, content={"error": str(exc)})
