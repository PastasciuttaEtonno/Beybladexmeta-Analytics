"""Administrative endpoints, ported from backend/src/routes/admin.ts.

Everything here is behind requireAdmin except the two read-only tournament
lookups the admin UI uses while composing a submission, which the original
guards with requireAuth only — reproduced as-is rather than tightened, so the
two backends agree.

These are the highest-blast-radius routes in the application: they rewrite the
aggregate statistics, refresh materialised views and can wipe a tournament's
recorded combos. Each one is therefore a literal port, including the quirks:

  * `recalculateRegionalStatsForTournament` ignores its argument and rebuilds
    every region;
  * `GET /api/admin/tournament-results` returns the *caller*, not any results;
  * `POST /api/admin/tournament-results` is a 410 tombstone.

One deliberate divergence, and it is a bug fix rather than a port: the external
submission seeds `combo_stats` with the combos it is about to score, and the
original omits `season` from that INSERT. `combo_stats.season` is NOT NULL with
no default, so the statement always failed and the whole endpoint answered 400.
Both backends now pass the season.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from datetime import date, datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, require_admin, require_user
from app.db import get_session
from app.lib.challengermode import (
    fetch_tournament_detail,
    fetch_tournaments_for_game,
    map_to_torneo_cards,
)
from app.lib.challonge_sync import sync_challonge_tournaments
from app.lib.regional_scoring import recalculate_all, recalculate_for_tournament
from app.lib.scoring import (
    ComboResult,
    calculate_points,
    process_external_combo,
    revert_external_combo,
)
from app.lib.seasons import determine_season
from app.serialization import js_datetime, number

router = APIRouter()
log = logging.getLogger(__name__)

DEFAULT_TOURNAMENTS_AFTER = "2025-10-11T00:00:00Z"

_ITALIAN_REGIONS = {
    "Piemonte", "Valle d'Aosta", "Lombardia", "Trentino-Alto Adige", "Veneto",
    "Friuli-Venezia Giulia", "Liguria", "Emilia-Romagna", "Toscana", "Umbria",
    "Marche", "Lazio", "Abruzzo", "Molise", "Campania", "Puglia", "Basilicata",
    "Calabria", "Sicilia", "Sardegna",
}

_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ---------------------------------------------------------------- helpers ---


async def _body(request: Request) -> Any:
    """The parsed JSON body, or {} when there is none.

    express.json() leaves `req.body` as an empty object for a request with no
    body, and the handlers below branch on its fields; raising here instead
    would turn a 400 into a 500.
    """
    try:
        return await request.json()
    except Exception:
        return {}


async def _refresh(db: AsyncSession, view: str) -> None:
    """CONCURRENTLY first, plain refresh as the fallback — as the original."""
    try:
        await db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view}"))
        await db.commit()
    except Exception:
        await db.rollback()
        try:
            await db.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
            await db.commit()
        except Exception as exc:
            await db.rollback()
            log.error("Failed to refresh materialized view %s: %s", view, exc)


async def _recalculate_quietly(db: AsyncSession, tournament_id: str) -> None:
    """The original wraps this in an empty catch; a failure must not 500."""
    try:
        await recalculate_for_tournament(db, tournament_id)
    except Exception as exc:
        log.error("[Admin] Failed to recalculate regional stats: %s", exc)


async def _audit(
    db: AsyncSession,
    user: CurrentUser,
    *,
    action: str,
    tournament_id: str | None = None,
    player_id: str | None = None,
    payload: Any,
) -> None:
    try:
        email = (
            await db.execute(
                text("SELECT email FROM users WHERE id = :id"), {"id": user.id}
            )
        ).scalar() or ""
        await db.execute(
            text(
                "INSERT INTO admin_audit_logs "
                "(admin_user_id, email, action, tournament_id, player_id, payload) "
                "VALUES (:admin, :email, :action, :tournament, :player, CAST(:payload AS jsonb))"
            ),
            {
                "admin": user.id,
                "email": email,
                "action": action,
                "tournament": tournament_id,
                "player": player_id,
                "payload": json.dumps(payload),
            },
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        log.error("Failed to write admin audit log: %s", exc)


async def _sync_ghost_players_from_data(db: AsyncSession, data: Any) -> int:
    """Upsert the participants of an imported Challonge tournament.

    Counts every attempted upsert, including ones that only refresh an existing
    row — the original increments unconditionally too.
    """
    count = 0

    async def upsert(pid: str, name: str, avatar: str | None) -> None:
        nonlocal count
        if not pid or not name or pid == "undefined":
            return
        await db.execute(
            text(
                "INSERT INTO challonge_players (id, nickname, avatar, updated_at) "
                "VALUES (:id, :nickname, :avatar, :updated) "
                "ON CONFLICT (id) DO UPDATE SET "
                "nickname = excluded.nickname, "
                "avatar = COALESCE(excluded.avatar, challonge_players.avatar), "
                "updated_at = :updated"
            ),
            {
                "id": pid,
                "nickname": name,
                "avatar": avatar,
                "updated": datetime.now(timezone.utc).replace(tzinfo=None),
            },
        )
        count += 1

    data = data if isinstance(data, dict) else {}
    standings = data.get("standings")
    participants = data.get("participants")

    if isinstance(standings, list):
        log.info(
            "[Admin] Syncing ghost players from data: %d standings found", len(standings)
        )
        entries, avatar_keys = standings, ("avatar_url", "icon")
    elif isinstance(participants, list):
        log.info(
            "[Admin] Syncing ghost players from data: %d participants found",
            len(participants),
        )
        entries, avatar_keys = participants, ("avatar_url",)
    else:
        entries, avatar_keys = [], ()

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        part = entry.get("participant") or entry
        name = (
            part.get("name") or part.get("username") or part.get("display_name") or "Unknown"
        )
        pid = str(part.get("id")) if part.get("id") else name
        avatar = next((part.get(k) for k in avatar_keys if part.get(k)), None)
        await upsert(pid, name, avatar)

    await db.commit()
    await _refresh(db, "player_platform_stats")
    await _recalculate_quietly(db, "ALL")
    return count


# ------------------------------------------------------------ submissions ---


@router.post("/api/admin/tournament-results")
async def deprecated_tournament_results(
    _user: Annotated[CurrentUser, Depends(require_admin)],
):
    return JSONResponse(
        status_code=410,
        content={
            "error": "Endpoint deprecato. Usa /api/admin/tournament-results/external "
            "con playerId e tournamentId da Challengermode."
        },
    )


def _validate_external(body: Any) -> dict[str, Any]:
    """externalTournamentResultSchema, by hand.

    A failure raises, and the caller turns every raise into the same generic
    400 the original produces — so the message never has to match Zod's.
    """
    if not isinstance(body, dict):
        raise ValueError("body must be an object")

    def string_field(key: str, minimum: int, maximum: int, optional: bool = False):
        value = body.get(key)
        if value is None and optional:
            return None
        if not isinstance(value, str) or not (minimum <= len(value) <= maximum):
            raise ValueError(f"invalid {key}")
        return value.strip()

    participants = body.get("participants")
    if not isinstance(participants, int) or isinstance(participants, bool):
        raise ValueError("invalid participants")
    if not 6 <= participants <= 200:
        raise ValueError("participants out of range")

    data_torneo = body.get("dataTorneo")
    if not isinstance(data_torneo, str) or not _DATE_ONLY.match(data_torneo):
        raise ValueError("invalid dataTorneo")

    regione = body.get("regione")
    if regione not in _ITALIAN_REGIONS:
        raise ValueError("invalid regione")

    return {
        "nomeTorneo": string_field("nomeTorneo", 1, 100),
        "dataTorneo": data_torneo,
        "descrizione": string_field("descrizione", 0, 500, optional=True),
        "participants": participants,
        "regione": regione,
        "tournamentId": string_field("tournamentId", 1, 64),
        "firstPlacePlayerId": string_field("firstPlacePlayerId", 1, 128),
        "secondPlacePlayerId": string_field("secondPlacePlayerId", 1, 128),
        "thirdPlacePlayerId": string_field("thirdPlacePlayerId", 1, 128),
        "fourthPlacePlayerId": string_field("fourthPlacePlayerId", 1, 128, optional=True),
    }


def _external_points(participants: int, position: int) -> int:
    """The admin submission scores differently from scoreExternalCombo: 4th
    place gets floor(participants / 2) rather than a multiplier."""
    if position == 1:
        return participants * 3
    if position == 2:
        return participants * 2
    if position == 3:
        return participants * 1
    if position == 4:
        return math.floor(participants * 0.5)
    return 0


@router.post("/api/admin/tournament-results/external")
async def submit_external_results(
    request: Request,
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    body = await _body(request)

    if isinstance(body, dict) and "isAdmin" in body:
        return JSONResponse(
            status_code=400,
            content={"error": "Client cannot set isAdmin; admin is verified server-side."},
        )

    try:
        data = _validate_external(body)

        first_points = _external_points(data["participants"], 1)
        second_points = _external_points(data["participants"], 2)
        third_points = _external_points(data["participants"], 3)
        fourth_points = _external_points(data["participants"], 4)

        async def combos_for(player_id: str) -> list[dict[str, str]]:
            rows = (
                await db.execute(
                    text(
                        "SELECT blade, assist_blade, ratchet, bit, lock_chip "
                        "FROM external_player_combos "
                        "WHERE tournament_id = :tournament AND player_id = :player "
                        "ORDER BY combo_number ASC"
                    ),
                    {"tournament": data["tournamentId"], "player": player_id},
                )
            ).all()
            return [
                {
                    "blade": r.blade, "assistBlade": r.assist_blade,
                    "ratchet": r.ratchet, "bit": r.bit, "lockChip": r.lock_chip,
                }
                for r in rows
            ]

        first = await combos_for(data["firstPlacePlayerId"])
        second = await combos_for(data["secondPlacePlayerId"])
        third = await combos_for(data["thirdPlacePlayerId"])
        fourth = (
            await combos_for(data["fourthPlacePlayerId"])
            if data["fourthPlacePlayerId"]
            else []
        )

        if len(first) != 3 or len(second) != 3 or len(third) != 3:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Each winner must have exactly 3 combos in external_player_combos"
                },
            )
        if data["fourthPlacePlayerId"] and len(fourth) != 3:
            return JSONResponse(
                status_code=400,
                content={"error": "4th place player must have exactly 3 combos"},
            )

        existing = {
            f"{r.player_id}|{r.combo_number}"
            for r in (
                await db.execute(
                    text(
                        "SELECT player_id, combo_number FROM cm_match_results "
                        "WHERE tournament_id = :tournament"
                    ),
                    {"tournament": data["tournamentId"]},
                )
            ).all()
        }

        player_ids = [
            data["firstPlacePlayerId"],
            data["secondPlacePlayerId"],
            data["thirdPlacePlayerId"],
        ]
        if data["fourthPlacePlayerId"]:
            player_ids.append(data["fourthPlacePlayerId"])

        for player_id in player_ids:
            await db.execute(
                text(
                    "INSERT INTO cm_players (id, nickname, avatar) "
                    "VALUES (:id, :nickname, NULL) "
                    "ON CONFLICT (id) DO UPDATE SET nickname = excluded.nickname, "
                    "avatar = excluded.avatar, updated_at = now()"
                ),
                {"id": player_id, "nickname": player_id},
            )

        # asyncpg binds this against a `date` column and will not accept a
        # string for it, CAST in the SQL or not.
        torneo_date = date.fromisoformat(data["dataTorneo"])
        season = determine_season(torneo_date)

        groups = [
            (first, data["firstPlacePlayerId"], 1, first_points),
            (second, data["secondPlacePlayerId"], 2, second_points),
            (third, data["thirdPlacePlayerId"], 3, third_points),
        ]
        if data["fourthPlacePlayerId"]:
            groups.append((fourth, data["fourthPlacePlayerId"], 4, fourth_points))

        # Seeding combo_stats. The original omits `season` here, which is NOT
        # NULL without a default — the statement always failed and took the
        # whole request down with it. Passing the season is the fix.
        for combos, _player, _placement, _points in groups:
            for combo in combos:
                await db.execute(
                    text(
                        "INSERT INTO combo_stats "
                        "(blade, assist_blade, ratchet, bit, lock_chip, season) "
                        "VALUES (:blade, :assistBlade, :ratchet, :bit, :lockChip, :season) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {**combo, "season": season},
                )

        for combos, player_id, placement, points in groups:
            for index, combo in enumerate(combos):
                await db.execute(
                    text(
                        "INSERT INTO cm_match_results (tournament_id, player_id, combo_number, "
                        "blade, assist_blade, ratchet, bit, lock_chip, piazzamento, "
                        "numero_partecipanti, data_torneo, punti_guadagnati) "
                        "VALUES (:tournament, :player, :combo_number, :blade, :assistBlade, "
                        ":ratchet, :bit, :lockChip, :piazzamento, :participants, "
                        ":data_torneo, :points) "
                        "ON CONFLICT (tournament_id, player_id, combo_number) DO UPDATE SET "
                        "blade = excluded.blade, assist_blade = excluded.assist_blade, "
                        "ratchet = excluded.ratchet, bit = excluded.bit, "
                        "lock_chip = excluded.lock_chip, piazzamento = excluded.piazzamento, "
                        "numero_partecipanti = excluded.numero_partecipanti, "
                        "data_torneo = excluded.data_torneo, "
                        "punti_guadagnati = excluded.punti_guadagnati, updated_at = now()"
                    ),
                    {
                        **combo,
                        "tournament": data["tournamentId"],
                        "player": player_id,
                        "combo_number": index + 1,
                        "piazzamento": placement,
                        "participants": data["participants"],
                        "data_torneo": torneo_date,
                        "points": points,
                    },
                )

        await db.commit()

        # Only combos that were not already recorded are scored, so resubmitting
        # the same tournament does not double anyone's points.
        for combos, player_id, placement, _points in groups:
            for index, combo in enumerate(combos):
                if f"{player_id}|{index + 1}" in existing:
                    continue
                await process_external_combo(
                    db,
                    ComboResult(
                        blade=combo["blade"], assist_blade=combo["assistBlade"],
                        ratchet=combo["ratchet"], bit=combo["bit"],
                        lock_chip=combo["lockChip"], season=season,
                        placement=placement, total_participants=data["participants"],
                    ),
                )

        await _refresh(db, "top_component_snapshot")
        await _recalculate_quietly(db, data["tournamentId"])

        return {
            "success": True,
            "message": "External tournament results submitted successfully",
            "tournamentId": data["tournamentId"],
        }
    except Exception as exc:
        await db.rollback()
        log.error("External tournament submission error: %s", exc)
        return JSONResponse(
            status_code=400,
            content={"error": "Failed to submit external tournament results"},
        )


# ------------------------------------------------------------------ reads ---


@router.get("/api/admin/tournaments")
async def admin_tournaments(
    request: Request,
    _user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        after = request.query_params.get("after") or DEFAULT_TOURNAMENTS_AFTER
        nodes = await fetch_tournaments_for_game(db, after)
        return {"tournaments": map_to_torneo_cards(nodes)}
    except Exception as exc:
        log.error("Failed to fetch Challengermode tournaments: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to fetch tournaments from Challengermode"},
        )


@router.get("/api/admin/tournaments/{tournament_id}/results")
async def admin_tournament_results(
    tournament_id: str,
    _user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        if not tournament_id:
            return JSONResponse(
                status_code=400, content={"error": "Missing tournament id"}
            )

        rows = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, piazzamento, "
                    "punti_guadagnati FROM cm_match_results WHERE tournament_id = :id "
                    "ORDER BY piazzamento ASC, combo_number ASC"
                ),
                {"id": tournament_id},
            )
        ).all()

        def at(placement: int) -> list[dict]:
            return [
                {
                    "blade": r.blade, "assistBlade": r.assist_blade,
                    "ratchet": r.ratchet, "bit": r.bit, "lockChip": r.lock_chip,
                    "puntiGuadagnati": number(r.punti_guadagnati),
                }
                for r in rows
                if r.piazzamento == placement
            ]

        return {
            "firstPlaceCombos": at(1),
            "secondPlaceCombos": at(2),
            "thirdPlaceCombos": at(3),
            "fourthPlaceCombos": at(4),
        }
    except Exception as exc:
        log.error("Failed to fetch tournament results: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch tournament results"}
        )


@router.get("/api/admin/tournament-results")
async def admin_current_user(
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    """Returns the caller, not any results. The name is a leftover; the admin
    UI calls it to confirm its own privileges."""
    try:
        row = (
            await db.execute(
                text(
                    "SELECT id, email, display_name, photo_url, is_admin, is_verified, "
                    "verification_token, verification_token_expires_at, challenger_id, "
                    "challengermode_username, challonge_id, challonge_username "
                    "FROM users WHERE id = :id"
                ),
                {"id": user.id},
            )
        ).first()
        if row is None:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        return {
            "user": {
                "id": row.id,
                "email": row.email,
                "displayName": row.display_name,
                "photoURL": row.photo_url,
                "isAdmin": row.is_admin,
                "is_verified": row.is_verified,
                "verification_token": row.verification_token,
                "verification_token_expires_at": js_datetime(
                    row.verification_token_expires_at
                ),
                "challengerId": row.challenger_id,
                "challengermodeUsername": row.challengermode_username,
                "challongeId": row.challonge_id,
                "challongeUsername": row.challonge_username,
            }
        }
    except Exception as exc:
        log.error("Failed to get user: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to get user"})


# ------------------------------------------------------------ maintenance ---


@router.post("/api/admin/refresh-all-tournaments")
async def refresh_all_tournaments(
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        ids = [
            str(r.id)
            for r in (await db.execute(text("SELECT id FROM tournaments_view"))).all()
        ]
        log.info("[Admin] Refreshing %d tournaments...", len(ids))

        refreshed = 0
        errors = 0
        for tournament_id in ids:
            try:
                await fetch_tournament_detail(db, tournament_id)
                refreshed += 1
                # The original paces itself to stay inside ChallengerMode's
                # rate limit; without the pause a large refresh gets throttled.
                await asyncio.sleep(0.2)
            except Exception as exc:
                log.error("[Admin] Failed to refresh tournament %s: %s", tournament_id, exc)
                errors += 1

        await _refresh(db, "player_platform_stats")
        return {"success": True, "total": len(ids), "refreshed": refreshed, "errors": errors}
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"error": str(exc) or "Failed to refresh tournaments"},
        )


@router.post("/api/admin/sync-challonge")
async def sync_challonge(
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        result = await sync_challonge_tournaments(db)
        await _refresh(db, "player_platform_stats")
        return {"success": True, **result}
    except Exception as exc:
        log.error("Challonge sync failed: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": str(exc) or "Failed to sync Challonge tournaments"},
        )


@router.post("/api/admin/recalc-stats")
async def recalc_stats(
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        log.info("[Admin] Starting regional stats recalculation...")
        result = await recalculate_all(db)
        log.info(
            "[Admin] Stats recalculation complete. Inserted/Updated: %s",
            result["inserted"],
        )
        return {"success": True, "result": result}
    except Exception as exc:
        log.error("[Admin] Stats recalculation failed: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": str(exc) or "Failed to recalculate stats"}
        )


@router.post("/api/admin/import-tournament")
async def import_tournament(
    request: Request,
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        body = await _body(request)
        if not isinstance(body, dict) or not all(
            body.get(field)
            for field in ("id", "tournament_name", "start_date", "total_players", "standings")
        ):
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Invalid JSON format. Missing required fields: id, "
                    "tournament_name, start_date, total_players, standings"
                },
            )

        await db.execute(
            text(
                "INSERT INTO challonge_match_results (tournament_id, data, fetched_at) "
                "VALUES (:id, CAST(:data AS jsonb), :fetched) "
                "ON CONFLICT (tournament_id) DO UPDATE SET "
                "data = excluded.data, fetched_at = excluded.fetched_at"
            ),
            {
                "id": body["id"],
                "data": json.dumps(body),
                "fetched": datetime.now(timezone.utc).replace(tzinfo=None),
            },
        )
        await db.commit()

        await _sync_ghost_players_from_data(db, body)
        await _refresh(db, "player_platform_stats")
        await _recalculate_quietly(db, "ALL")

        log.info(
            "[Admin] Imported tournament: %s (%s)", body["tournament_name"], body["id"]
        )
        return {"success": True, "id": body["id"]}
    except Exception as exc:
        await db.rollback()
        log.error("[Admin] Import failed: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Import failed"})


@router.post("/api/admin/tournaments/{tournament_id}/sync-ghost-players")
async def sync_ghost_players(
    tournament_id: str,
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        row = (
            await db.execute(
                text(
                    "SELECT data FROM challonge_match_results "
                    "WHERE tournament_id = :id LIMIT 1"
                ),
                {"id": tournament_id},
            )
        ).first()
        if row is None:
            return JSONResponse(status_code=404, content={"error": "Tournament not found"})

        count = await _sync_ghost_players_from_data(db, row.data)
        return {"success": True, "count": count}
    except Exception as exc:
        await db.rollback()
        log.error("[Admin] Sync ghost players failed: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": str(exc) or "Failed to sync players"}
        )


@router.post("/api/admin/tournaments/{tournament_id}/combos/reset")
async def reset_tournament_combos(
    tournament_id: str,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    """Un-scores every combo recorded for a tournament and removes them.

    The reverts and the deletes share one transaction: a partial run would
    leave the aggregates decremented while the rows that justify them still
    exist, and a retry would then decrement a second time.
    """
    try:
        tournament_id = tournament_id.strip()
        if not tournament_id:
            return JSONResponse(
                status_code=400, content={"error": "Missing tournament id"}
            )

        rows = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, data_torneo, "
                    "piazzamento, numero_partecipanti FROM cm_match_results "
                    "WHERE tournament_id = :id"
                ),
                {"id": tournament_id},
            )
        ).all()

        affected = 0
        for row in rows:
            placement = int(row.piazzamento or 0)
            participants = int(row.numero_partecipanti or 0)
            if not (1 <= placement <= 3 and participants > 0):
                continue
            season = determine_season(row.data_torneo or datetime.now())
            await revert_external_combo(
                db,
                ComboResult(
                    blade=row.blade, assist_blade=row.assist_blade,
                    ratchet=row.ratchet, bit=row.bit, lock_chip=row.lock_chip,
                    season=season, placement=placement,
                    total_participants=participants,
                ),
                commit=False,
            )
            affected += 1

        await db.execute(
            text("DELETE FROM cm_match_results WHERE tournament_id = :id"),
            {"id": tournament_id},
        )
        await db.execute(
            text("DELETE FROM external_player_combos WHERE tournament_id = :id"),
            {"id": tournament_id},
        )
        await db.commit()

        await _refresh(db, "top_component_snapshot")
        await _audit(
            db, user, action="reset_tournament_combos",
            tournament_id=tournament_id, payload={"affected": affected},
        )
        return {"success": True, "affected": affected}
    except Exception as exc:
        await db.rollback()
        log.error("Failed to reset tournament combos: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": str(exc) or "Failed to reset tournament combos"},
        )


# ------------------------------------------------- admin combo management ---


def _validate_upsert(tournament_id: str, player_id: str, body: Any) -> dict[str, Any]:
    """upsertTournamentPlayerCombosSchema, by hand."""
    body = body if isinstance(body, dict) else {}

    tournament_id = str(tournament_id or "").strip()
    player_id = str(player_id or "").strip()
    if not 1 <= len(tournament_id) <= 64:
        raise ValueError("invalid tournamentId")
    if not 1 <= len(player_id) <= 128:
        raise ValueError("invalid playerId")

    raw = body.get("combos")
    raw = raw if isinstance(raw, list) else []
    if not 1 <= len(raw) <= 3:
        raise ValueError("combos must contain between 1 and 3 entries")

    combos = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError("invalid combo")
        combo = {}
        for key in ("blade", "assistBlade", "ratchet", "bit", "lockChip"):
            value = entry.get(key)
            if not isinstance(value, str) or not 1 <= len(value) <= 100:
                raise ValueError(f"invalid {key}")
            combo[key] = value.strip()
        combos.append(combo)

    platform = body.get("platform") or "challengermode"
    platform = str(platform).strip() or "challengermode"

    return {
        "tournamentId": tournament_id,
        "playerId": player_id,
        "combos": combos,
        "platform": platform,
    }


async def _components_exist(db: AsyncSession, combo: dict[str, str]) -> bool:
    """Every part must be a name the stats tables already know.

    'None' is accepted for the optional parts, and for the ratchet only when
    the bit is ratchet-less — the same asymmetry the original encodes.
    """
    blade = (
        await db.execute(
            text("SELECT count(*) FROM blade_stats WHERE blade = :v"),
            {"v": combo["blade"]},
        )
    ).scalar() or 0

    assist = (
        1
        if combo["assistBlade"] == "None"
        else (
            await db.execute(
                text("SELECT count(*) FROM assist_blade_stats WHERE assist_blade = :v"),
                {"v": combo["assistBlade"]},
            )
        ).scalar()
        or 0
    )

    bit_row = (
        await db.execute(
            text('SELECT is_ratchet_less FROM bit_stats WHERE "bit" = :v LIMIT 1'),
            {"v": combo["bit"]},
        )
    ).first()
    bit = 1 if bit_row is not None else 0
    ratchet_less = bool(bit_row.is_ratchet_less) if bit_row is not None else False

    ratchet = (
        (1 if ratchet_less else 0)
        if combo["ratchet"] == "None"
        else (
            await db.execute(
                text("SELECT count(*) FROM ratchet_stats WHERE ratchet = :v"),
                {"v": combo["ratchet"]},
            )
        ).scalar()
        or 0
    )

    lock_chip = (
        1
        if combo["lockChip"] == "None"
        else (
            await db.execute(
                text("SELECT count(*) FROM lock_chip_stats WHERE lock_chip = :v"),
                {"v": combo["lockChip"]},
            )
        ).scalar()
        or 0
    )

    return all((blade, assist, ratchet, bit, lock_chip))


def _to_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except Exception:
        return None


async def _enrich_from_challonge(
    db: AsyncSession, tournament_id: str, player_id: str
) -> tuple[int | None, int | None, date | None]:
    try:
        row = (
            await db.execute(
                text(
                    "SELECT data FROM challonge_match_results "
                    "WHERE tournament_id = :id LIMIT 1"
                ),
                {"id": tournament_id},
            )
        ).first()
        if row is None:
            return None, None, None

        data = row.data if isinstance(row.data, dict) else json.loads(row.data or "{}")
        tournament = data.get("tournament") or {}
        raw_date = (
            data.get("start_date") or data.get("started_at") or tournament.get("started_at")
        )
        tournament_date = _to_date(raw_date) if raw_date else None
        participants = int(
            data.get("total_players")
            or data.get("participants_count")
            or tournament.get("participants_count")
            or 0
        )

        normalised = str(player_id or "").strip().lower()
        placement = None
        for entry in data.get("standings") or []:
            name = str(entry.get("name") or entry.get("username") or "").strip().lower()
            if name == normalised or str(entry.get("id")) == normalised:
                if entry.get("rank"):
                    try:
                        placement = int(str(entry["rank"]))
                    except ValueError:
                        placement = None
                break

        return placement, participants, tournament_date
    except Exception as exc:
        log.warning("Failed to fetch Challonge tournament data for enrichment: %s", exc)
        return None, None, None


async def _enrich_from_challengermode(
    db: AsyncSession, tournament_id: str, player_id: str
) -> tuple[int | None, int | None, date | None]:
    try:
        detail = await fetch_tournament_detail(db, tournament_id)
        tournament_date = None
        started = ((detail or {}).get("schedule") or {}).get("startedAt")
        if started:
            day = str(started)[:10]
            if _DATE_ONLY.match(day):
                tournament_date = date.fromisoformat(day)

        signups = ((detail or {}).get("attendance") or {}).get("signups") or {}
        user_count = signups.get("userCount")
        participants = user_count if isinstance(user_count, int) and user_count > 0 else None

        placement = None
        for lineup in signups.get("lineups") or []:
            members = lineup.get("members")
            if not isinstance(members, list):
                continue
            if any(((m or {}).get("user") or {}).get("userId") == player_id for m in members):
                display = (lineup.get("placement") or {}).get("displayPlacement")
                if display:
                    try:
                        placement = int(str(display))
                    except ValueError:
                        placement = None
                break

        return placement, participants, tournament_date
    except Exception as exc:
        log.warning("Failed to fetch tournament detail for enrichment: %s", exc)
        return None, None, None


_COMBO_KEYS = ("blade", "assistBlade", "ratchet", "bit", "lockChip")


@router.put("/api/tournaments/{tournament_id}/players/{player_id}/combos")
async def admin_upsert_player_combos(
    tournament_id: str,
    player_id: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    """Replace a player's deck for one tournament, on their behalf.

    Distinct from the self-service route in tournament_writes: there the caller
    must own the ChallengerMode account that placed, here an admin files for
    anyone. The scoring bookkeeping is the same — the previous deck is reverted
    combo by combo before the new one is applied, so an edit moves points
    rather than adding them.
    """
    try:
        parsed = _validate_upsert(tournament_id, player_id, await _body(request))

        for combo in parsed["combos"]:
            if not await _components_exist(db, combo):
                return JSONResponse(
                    status_code=400, content={"error": "Invalid combo components"}
                )

        seen: set[tuple[str, ...]] = set()
        for combo in parsed["combos"]:
            key = tuple(combo[k] for k in _COMBO_KEYS)
            if key in seen:
                return JSONResponse(
                    status_code=400, content={"error": "Duplicate combos in the deck"}
                )
            seen.add(key)

        await db.execute(
            text(
                "DELETE FROM external_player_combos "
                "WHERE tournament_id = :tournament AND player_id = :player"
            ),
            {"tournament": parsed["tournamentId"], "player": parsed["playerId"]},
        )

        if parsed["platform"] == "challonge":
            # A Challonge player may have already self-reported this deck under
            # their own account; drop that copy so the tournament is not counted
            # twice once the admin files it.
            try:
                uid = (
                    await db.execute(
                        text(
                            "SELECT u.id FROM users u "
                            "LEFT JOIN user_aliases ua ON ua.user_id = u.id "
                            "WHERE LOWER(TRIM(u.challonge_username)) = LOWER(TRIM(:player)) "
                            "OR LOWER(TRIM(ua.alias)) = LOWER(TRIM(:player)) LIMIT 1"
                        ),
                        {"player": parsed["playerId"]},
                    )
                ).scalar()
                if uid:
                    await db.execute(
                        text(
                            "DELETE FROM challonge_reported_combos "
                            "WHERE tournament_id = :tournament AND user_id = :uid"
                        ),
                        {"tournament": parsed["tournamentId"], "uid": uid},
                    )
            except Exception as exc:
                log.warning(
                    "Failed to clean up potential duplicate Challonge reported combos: %s",
                    exc,
                )

        await db.execute(
            text(
                "INSERT INTO cm_players (id, nickname, avatar) VALUES (:id, :nickname, NULL) "
                "ON CONFLICT DO NOTHING"
            ),
            {"id": parsed["playerId"], "nickname": parsed["playerId"]},
        )

        if parsed["platform"] == "challonge":
            placement, participants, tournament_date = await _enrich_from_challonge(
                db, parsed["tournamentId"], parsed["playerId"]
            )
        else:
            placement, participants, tournament_date = await _enrich_from_challengermode(
                db, parsed["tournamentId"], parsed["playerId"]
            )

        season = determine_season(tournament_date or datetime.now())

        inserted = []
        for index, combo in enumerate(parsed["combos"]):
            await db.execute(
                text(
                    "INSERT INTO external_player_combos (tournament_id, player_id, "
                    "combo_number, blade, assist_blade, ratchet, bit, lock_chip, "
                    "placement, total_participants, tournament_date, season, platform) "
                    "VALUES (:tournament, :player, :combo_number, :blade, :assistBlade, "
                    ":ratchet, :bit, :lockChip, :placement, :participants, :date, "
                    ":season, :platform)"
                ),
                {
                    **combo,
                    "tournament": parsed["tournamentId"],
                    "player": parsed["playerId"],
                    "combo_number": index + 1,
                    "placement": placement,
                    "participants": participants,
                    "date": tournament_date,
                    "season": season,
                    "platform": parsed["platform"],
                },
            )
            inserted.append({**combo, "comboNumber": index + 1})

        previous = {
            int(r.combo_number): r
            for r in (
                await db.execute(
                    text(
                        "SELECT combo_number, blade, assist_blade, ratchet, bit, lock_chip, "
                        "piazzamento, numero_partecipanti FROM cm_match_results "
                        "WHERE tournament_id = :tournament AND player_id = :player"
                    ),
                    {"tournament": parsed["tournamentId"], "player": parsed["playerId"]},
                )
            ).all()
        }

        scored = bool(
            placement and participants and 1 <= placement <= 4 and participants > 0
        )
        points = calculate_points(placement, participants) if scored else 0

        if tournament_date:
            for combo in inserted:
                values = {k: combo[k] for k in _COMBO_KEYS}
                await db.execute(
                    text(
                        "INSERT INTO combo_stats "
                        "(blade, assist_blade, ratchet, bit, lock_chip, season) "
                        "VALUES (:blade, :assistBlade, :ratchet, :bit, :lockChip, :season) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {**values, "season": season},
                )
                await db.execute(
                    text(
                        "INSERT INTO cm_match_results (tournament_id, player_id, combo_number, "
                        "blade, assist_blade, ratchet, bit, lock_chip, piazzamento, "
                        "numero_partecipanti, data_torneo, punti_guadagnati) "
                        "VALUES (:tournament, :player, :combo_number, :blade, :assistBlade, "
                        ":ratchet, :bit, :lockChip, :piazzamento, :participants, :date, :points) "
                        "ON CONFLICT (tournament_id, player_id, combo_number) DO UPDATE SET "
                        "blade = excluded.blade, assist_blade = excluded.assist_blade, "
                        "ratchet = excluded.ratchet, bit = excluded.bit, "
                        "lock_chip = excluded.lock_chip, piazzamento = excluded.piazzamento, "
                        "numero_partecipanti = excluded.numero_partecipanti, "
                        "data_torneo = excluded.data_torneo, "
                        "punti_guadagnati = excluded.punti_guadagnati, updated_at = now()"
                    ),
                    {
                        **values,
                        "tournament": parsed["tournamentId"],
                        "player": parsed["playerId"],
                        "combo_number": combo["comboNumber"],
                        "piazzamento": placement or 0,
                        "participants": participants or 0,
                        "date": tournament_date,
                        "points": points,
                    },
                )

        await db.commit()

        if scored:
            for combo in inserted:
                prev = previous.get(combo["comboNumber"])
                changed = prev is not None and (
                    prev.blade != combo["blade"]
                    or prev.assist_blade != combo["assistBlade"]
                    or prev.ratchet != combo["ratchet"]
                    or prev.bit != combo["bit"]
                    or prev.lock_chip != combo["lockChip"]
                    or int(prev.piazzamento) != int(placement)
                    or int(prev.numero_partecipanti) != int(participants)
                )

                if changed:
                    await revert_external_combo(
                        db,
                        ComboResult(
                            blade=prev.blade, assist_blade=prev.assist_blade,
                            ratchet=prev.ratchet, bit=prev.bit,
                            lock_chip=prev.lock_chip, season=season,
                            placement=int(prev.piazzamento or 0),
                            total_participants=int(prev.numero_partecipanti or 0),
                        ),
                    )
                if changed or prev is None:
                    await process_external_combo(
                        db,
                        ComboResult(
                            blade=combo["blade"], assist_blade=combo["assistBlade"],
                            ratchet=combo["ratchet"], bit=combo["bit"],
                            lock_chip=combo["lockChip"], season=season,
                            placement=placement, total_participants=participants,
                        ),
                    )

            await _refresh(db, "top_component_snapshot")

        await _recalculate_quietly(db, parsed["tournamentId"])
        await _audit(
            db, user, action="upsert_player_combos",
            tournament_id=parsed["tournamentId"], player_id=parsed["playerId"],
            payload={"combos": parsed["combos"]},
        )

        return {
            "success": True,
            "combos": [{k: combo[k] for k in _COMBO_KEYS} for combo in inserted],
        }
    except Exception as exc:
        await db.rollback()
        log.error("Failed to upsert player combos: %s", exc)
        return JSONResponse(
            status_code=400, content={"error": str(exc) or "Failed to upsert player combos"}
        )


@router.get("/api/admin/chat-errors")
async def admin_chat_errors(
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
    reference: str | None = None,
):
    """I guasti della chat col loro dettaglio completo.

    E' l'altra meta' di app/lib/rag/errors.py: all'utente arriva un messaggio
    fisso e un codice breve, qui c'e' tutto il resto. Quando qualcuno segnala
    "l'assistente non funziona, codice a5d0d6ba", questo endpoint interrogato
    con ?reference=a5d0d6ba porta alla riga esatta, traceback compreso.

    Protetto da require_admin come il resto del router: il dettaglio contiene
    nomi di fornitori, stati dei piani e tracce di esecuzione, cioe' esattamente
    cio' che si e' smesso di mostrare all'utente.
    """
    rows = (
        await db.execute(
            text(
                "SELECT reference, kind, detail, traceback, endpoint, session_id, "
                "       host(client_ip) AS client_ip, created_at "
                "FROM chat_error "
                # CAST esplicito: senza, asyncpg manda `$1 IS NULL` e Postgres non
                # riesce a dedurre il tipo del parametro - "could not determine
                # data type of parameter $1". L'endpoint falliva con 500
                # ESATTAMENTE nel caso senza reference, cioe' quando lo si usa
                # per guardare cosa e' successo; con ?reference=... funzionava,
                # ed e' l'unico modo in cui era stato provato.
                "WHERE (CAST(:ref AS text) IS NULL OR reference = CAST(:ref AS text)) "
                "ORDER BY created_at DESC LIMIT :limit"
            ),
            {"ref": reference, "limit": max(1, min(limit, 200))},
        )
    ).mappings().all()
    return {"errors": [dict(r) for r in rows]}


@router.get("/api/admin/chat-activity")
async def admin_chat_activity(
    _user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
    problemi: bool = False,
):
    """Le conversazioni con accanto la diagnostica che le spiega.

    L'altra meta' di /api/admin/chat-errors: li' ci sono i GUASTI, qui le
    risposte che sono state date. Servono insieme, perche' i modi in cui un
    assistente delude sono tre e solo uno lancia un'eccezione:

      * si rompe          -> chat_error, con traceback
      * non risponde      -> abstained, e allora la domanda dice cosa manca
                             al corpus, oppure il recupero e' troppo severo
      * risponde male     -> pollice giu', o una citazione inventata

    `retrieval` porta i conteggi per ramo e il motivo dell'astensione: e' cio'
    che distingue "ha cercato male" da "ha trovato bene e ha scritto male", che
    sono due problemi con due cure opposte.

    Con problemi=true restano solo le righe che meritano di essere guardate,
    che e' come si usa davvero: le risposte riuscite non insegnano niente.
    """
    rows = (
        await db.execute(
            text(
                "SELECT a.id, a.session_id, a.created_at, a.abstained, a.feedback, "
                "       a.model, a.latency_ms, a.input_tokens, a.output_tokens, "
                "       a.phantom_citations, a.tool_calls, a.retrieval, "
                "       left(a.content, 600) AS answer, "
                "       (SELECT u.content FROM chat_message u "
                "         WHERE u.session_id = a.session_id AND u.role = 'user' "
                "           AND u.id < a.id ORDER BY u.id DESC LIMIT 1) AS question "
                "FROM chat_message a "
                "WHERE a.role = 'assistant' "
                "  AND (NOT :problemi OR a.feedback < 0 OR a.abstained "
                "       OR jsonb_array_length(a.phantom_citations) > 0) "
                "ORDER BY a.created_at DESC LIMIT :limit"
            ),
            {"problemi": problemi, "limit": max(1, min(limit, 200))},
        )
    ).mappings().all()
    return {"activity": [dict(r) for r in rows]}
