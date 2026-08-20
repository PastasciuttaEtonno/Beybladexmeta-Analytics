"""Registering and editing the combos a player used in a tournament.

Ported from the write handlers in backend/src/routes/tournaments.ts. These are
the only routes that feed the aggregate statistics, so they are also the ones
where a difference between the two backends corrupts data rather than a
response.

The gate that matters: a player may only register combos for a tournament they
actually placed top-four in, and only under an account linked to the
ChallengerMode profile that placed there. Without the link there is no way to
prove the participant is them, so anyone could file results in someone else's
name. Hence `check_tournament_placement`, which asks ChallengerMode directly.
"""

import logging
import re
from datetime import date, datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, require_user
from app.db import get_session
from app.lib.challengermode import (
    check_tournament_placement,
    fetch_tournament_detail,
    parse_placement,
)
from app.lib.regional_scoring import recalculate_for_tournament
from app.lib.scoring import (
    ComboResult,
    calculate_points,
    process_external_combo,
    revert_external_combo,
)
from app.lib.seasons import determine_season

router = APIRouter()
log = logging.getLogger(__name__)

# Combos may be edited for 48 hours after they were recorded. Admins are exempt.
EDIT_WINDOW_MS = 172_800_000


class ComboInput(BaseModel):
    """Mirrors tournamentComboSchema: trimmed strings, 1..100 characters."""

    blade: str = Field(min_length=1, max_length=100)
    assistBlade: str = Field(min_length=1, max_length=100)
    ratchet: str = Field(min_length=1, max_length=100)
    bit: str = Field(min_length=1, max_length=100)
    lockChip: str = Field(min_length=1, max_length=100)

    @field_validator("*")
    @classmethod
    def _trim(cls, value: str) -> str:
        return value.strip()


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _season_of(row_season: Any, row_date: Any) -> str:
    """The season a stored combo belongs to, preferring the value already saved."""
    if row_season:
        return str(row_season)
    moment = _as_datetime(row_date)
    return determine_season(moment or datetime.now(timezone.utc))


def _edit_window_expired(updated_at: Any) -> bool:
    moment = _as_datetime(updated_at)
    if moment is None:
        return False
    elapsed_ms = (datetime.now(timezone.utc) - moment).total_seconds() * 1000
    return elapsed_ms > EDIT_WINDOW_MS


async def _challenger_id(db: AsyncSession, user_id: str) -> str | None:
    return (
        await db.execute(text("SELECT challenger_id FROM users WHERE id = :id"), {"id": user_id})
    ).scalar()


async def _refresh_top_components(db: AsyncSession) -> None:
    try:
        await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot"))
        await db.commit()
    except Exception:
        await db.rollback()
        try:
            await db.execute(text("REFRESH MATERIALIZED VIEW top_component_snapshot"))
            await db.commit()
        except Exception:
            await db.rollback()


async def _upsert_cm_match_result(
    db: AsyncSession, *, tournament_id: str, player_id: str, combo_number: int,
    combo: ComboInput, placement: int, participants: int, tournament_date: Any,
) -> None:
    points = (
        calculate_points(placement, participants)
        if placement and participants and 1 <= placement <= 4 and participants > 0
        else 0
    )
    await db.execute(
        text(
            "INSERT INTO cm_match_results (tournament_id, player_id, combo_number, blade, "
            "assist_blade, ratchet, bit, lock_chip, piazzamento, numero_partecipanti, "
            "data_torneo, punti_guadagnati, updated_at) "
            "VALUES (:tid, :pid, :num, :blade, :assist, :ratchet, :bit, :chip, :placement, "
            ":participants, :tdate, :points, now()) "
            "ON CONFLICT (tournament_id, player_id, combo_number) DO UPDATE SET "
            "blade = EXCLUDED.blade, assist_blade = EXCLUDED.assist_blade, "
            "ratchet = EXCLUDED.ratchet, bit = EXCLUDED.bit, lock_chip = EXCLUDED.lock_chip, "
            "piazzamento = EXCLUDED.piazzamento, "
            "numero_partecipanti = EXCLUDED.numero_partecipanti, "
            "data_torneo = EXCLUDED.data_torneo, "
            "punti_guadagnati = EXCLUDED.punti_guadagnati, updated_at = now()"
        ),
        {
            "tid": tournament_id, "pid": player_id, "num": combo_number,
            "blade": combo.blade, "assist": combo.assistBlade, "ratchet": combo.ratchet,
            "bit": combo.bit, "chip": combo.lockChip, "placement": placement or 0,
            "participants": participants or 0, "tdate": tournament_date, "points": points,
        },
    )


async def _audit(
    db: AsyncSession, *, user: CurrentUser, action: str, tournament_id: str,
    player_id: str, payload: dict,
) -> None:
    """Best-effort audit trail; never allowed to fail the operation."""
    import json

    try:
        await db.execute(
            text(
                "INSERT INTO admin_audit_logs (admin_user_id, email, action, tournament_id, "
                "player_id, payload) VALUES (:uid, :email, :action, :tid, :pid, CAST(:payload AS jsonb))"
            ),
            {
                "uid": user.id, "email": user.email, "action": action,
                "tid": tournament_id, "pid": player_id, "payload": json.dumps(payload),
            },
        )
        await db.commit()
    except Exception:
        await db.rollback()


def _tournament_facts(detail: dict, challenger_id: str) -> tuple[int | None, int | None, date | None]:
    """Placement, participant count and date for this player, from the API detail."""
    signups = ((detail or {}).get("attendance") or {}).get("signups") or {}

    participants = signups.get("userCount")
    participants = participants if isinstance(participants, int) and participants > 0 else None

    placement = None
    for lineup in signups.get("lineups") or []:
        members = lineup.get("members") or []
        if any((m.get("user") or {}).get("userId") == challenger_id for m in members):
            placement = parse_placement((lineup.get("placement") or {}).get("displayPlacement"))
            break

    tournament_date = None
    started = ((detail or {}).get("schedule") or {}).get("startedAt")
    if started:
        day = str(started)[:10]
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            tournament_date = date.fromisoformat(day)

    return placement, participants, tournament_date


@router.post("/api/tournaments/claim")
async def claim_tournament(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid request"})

    try:
        tournament_id = str(body.get("tournamentId") or "").strip()
        raw_combos = body.get("combos")
        if not tournament_id or not isinstance(raw_combos, list) or len(raw_combos) != 3:
            raise ValueError("Invalid request")
        combos = [ComboInput.model_validate(c) for c in raw_combos]
        rank = body.get("rank")
        platform = body.get("platform") or "challengermode"
        if platform not in ("challengermode", "challonge"):
            raise ValueError("Invalid request")
    except Exception as exc:
        return JSONResponse(status_code=400, content={"error": str(exc) or "Invalid request"})

    if rank and int(rank) > 4:
        return JSONResponse(status_code=400, content={"error": "Only Top 4 ranks are allowed"})

    try:
        if platform == "challonge":
            return await _claim_challonge(db, user, tournament_id, combos, rank)

        challenger_id = await _challenger_id(db, user.id)
        if not challenger_id:
            return JSONResponse(
                status_code=400,
                content={"error": "Devi effettuare il login con Challengermode"},
            )

        # The identity check: ChallengerMode itself has to confirm this account
        # finished top four here.
        if not await check_tournament_placement(db, tournament_id, challenger_id):
            return JSONResponse(
                status_code=403, content={"error": "Non risulti nella Top 4 di questo torneo"}
            )

        photo = (
            await db.execute(text("SELECT photo_url FROM users WHERE id = :id"), {"id": user.id})
        ).scalar()
        await db.execute(
            text(
                "INSERT INTO cm_players (id, nickname, avatar) VALUES (:id, :nick, :avatar) "
                "ON CONFLICT (id) DO UPDATE SET avatar = EXCLUDED.avatar, updated_at = now()"
            ),
            {"id": challenger_id, "nick": user.display_name or challenger_id, "avatar": photo},
        )

        placement = participants = tournament_date = None
        try:
            detail = await fetch_tournament_detail(db, tournament_id)
            placement, participants, tournament_date = _tournament_facts(detail, challenger_id)
        except Exception:
            pass

        # Take back what a previous registration contributed before recording the
        # new one. Without this, registering the same deck twice counted it
        # twice: the rows below were replaced, but the points they had already
        # added to combo_stats and the five component tables stayed. Pressing
        # "register" repeatedly inflated a combo's standing. (PUT /combos/:num
        # has always reverted first; only this path did not.)
        previous = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, placement, "
                    "total_participants, tournament_date, season "
                    "FROM external_player_combos "
                    "WHERE tournament_id = :tid AND player_id = :pid"
                ),
                {"tid": tournament_id, "pid": challenger_id},
            )
        ).all()

        for prev in previous:
            prev_placement = int(prev.placement or 0)
            prev_participants = int(prev.total_participants or 0)
            if prev_placement > 0 and prev_participants > 0:
                await revert_external_combo(
                    db,
                    ComboResult(
                        blade=prev.blade, assist_blade=prev.assist_blade,
                        ratchet=prev.ratchet, bit=prev.bit, lock_chip=prev.lock_chip,
                        season=_season_of(prev.season, prev.tournament_date),
                        placement=prev_placement, total_participants=prev_participants,
                    ),
                )

        await db.execute(
            text(
                "DELETE FROM external_player_combos "
                "WHERE tournament_id = :tid AND player_id = :pid"
            ),
            {"tid": tournament_id, "pid": challenger_id},
        )

        season = determine_season(
            _as_datetime(tournament_date) or datetime.now(timezone.utc)
        )

        for index, combo in enumerate(combos, start=1):
            await db.execute(
                text(
                    "INSERT INTO external_player_combos (tournament_id, player_id, combo_number, "
                    "blade, assist_blade, ratchet, bit, lock_chip, placement, total_participants, "
                    "tournament_date, season) VALUES (:tid, :pid, :num, :blade, :assist, :ratchet, "
                    ":bit, :chip, :placement, :participants, :tdate, :season)"
                ),
                {
                    "tid": tournament_id, "pid": challenger_id, "num": index,
                    "blade": combo.blade, "assist": combo.assistBlade,
                    "ratchet": combo.ratchet, "bit": combo.bit, "chip": combo.lockChip,
                    "placement": placement, "participants": participants,
                    "tdate": tournament_date, "season": season,
                },
            )
        await db.commit()

        if tournament_date:
            for index, combo in enumerate(combos, start=1):
                # Seeds the combo so it exists even when it scored nothing.
                await db.execute(
                    text(
                        "INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season) "
                        "VALUES (:blade, :assist, :ratchet, :bit, :chip, :season) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {
                        "blade": combo.blade, "assist": combo.assistBlade,
                        "ratchet": combo.ratchet, "bit": combo.bit,
                        "chip": combo.lockChip, "season": season,
                    },
                )
                await _upsert_cm_match_result(
                    db, tournament_id=tournament_id, player_id=challenger_id,
                    combo_number=index, combo=combo, placement=placement or 0,
                    participants=participants or 0, tournament_date=tournament_date,
                )
            await db.commit()

        if placement and participants and 1 <= placement <= 4 and participants > 0:
            for combo in combos:
                await process_external_combo(
                    db,
                    ComboResult(
                        blade=combo.blade, assist_blade=combo.assistBlade,
                        ratchet=combo.ratchet, bit=combo.bit, lock_chip=combo.lockChip,
                        season=season, placement=placement, total_participants=participants,
                    ),
                )

        try:
            await recalculate_for_tournament(db, tournament_id)
        except Exception as exc:
            log.error("Regional recalculation failed: %s", exc)

        return {"success": True}
    except Exception as exc:
        await db.rollback()
        log.error("Claim failed: %s", exc)
        return JSONResponse(status_code=400, content={"error": str(exc) or "Invalid request"})


async def _claim_challonge(
    db: AsyncSession, user: CurrentUser, tournament_id: str,
    combos: list[ComboInput], rank: Any,
) -> Any:
    """Challonge results are curated by hand rather than fetched, so this branch
    trusts the imported payload instead of calling an API."""
    row = (
        await db.execute(
            text("SELECT data FROM challonge_match_results WHERE tournament_id = :tid"),
            {"tid": tournament_id},
        )
    ).first()
    if row is None:
        return JSONResponse(status_code=404, content={"error": "Torneo Challonge non trovato"})

    data = row.data or {}
    tournament_name = data.get("name") or (data.get("tournament") or {}).get("name")

    await db.execute(
        text(
            "DELETE FROM challonge_reported_combos "
            "WHERE tournament_id = :tid AND user_id = :uid"
        ),
        {"tid": tournament_id, "uid": user.id},
    )

    for index, combo in enumerate(combos, start=1):
        await db.execute(
            text(
                "INSERT INTO challonge_reported_combos (user_id, tournament_id, tournament_name, "
                "combo_number, blade, ratchet, bit, assist_blade, lock_chip, rank) "
                "VALUES (:uid, :tid, :tname, :num, :blade, :ratchet, :bit, :assist, :chip, :rank)"
            ),
            {
                "uid": user.id, "tid": tournament_id, "tname": tournament_name, "num": index,
                "blade": combo.blade, "ratchet": combo.ratchet, "bit": combo.bit,
                "assist": combo.assistBlade or None, "chip": combo.lockChip or None,
                "rank": int(rank) if rank else 0,
            },
        )

    linked = (
        await db.execute(
            text("SELECT challonge_id, challonge_username, photo_url FROM users WHERE id = :id"),
            {"id": user.id},
        )
    ).first()
    if linked is not None and linked.challonge_id:
        await db.execute(
            text(
                "INSERT INTO challonge_players (id, nickname, avatar, updated_at) "
                "VALUES (:id, :nick, :avatar, now()) "
                "ON CONFLICT (id) DO UPDATE SET avatar = EXCLUDED.avatar, updated_at = now()"
            ),
            {
                "id": linked.challonge_id,
                "nick": linked.challonge_username or user.display_name,
                "avatar": linked.photo_url,
            },
        )

    await db.commit()
    return {"success": True, "message": "Deck Challonge registrato"}


@router.put("/api/tournaments/{tournament_id}/combos/{combo_number}")
async def upsert_combo(
    tournament_id: str,
    combo_number: str,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    tournament_id = tournament_id.strip()
    match = re.match(r"^\s*[-+]?\d+", combo_number)
    number = int(match.group()) if match else 0
    if not tournament_id or number < 1 or number > 3:
        return JSONResponse(status_code=400, content={"error": "Parametri non validi"})

    try:
        body = await request.json()
        combo = ComboInput.model_validate(
            {
                "blade": str((body or {}).get("blade") or "").strip(),
                "assistBlade": str((body or {}).get("assistBlade") or "").strip(),
                "ratchet": str((body or {}).get("ratchet") or "").strip(),
                "bit": str((body or {}).get("bit") or "").strip(),
                "lockChip": str((body or {}).get("lockChip") or "").strip(),
            }
        )
    except Exception as exc:
        return JSONResponse(status_code=400, content={"error": str(exc) or "Richiesta non valida"})

    # Blades written in CamelCase are the composite ones, which occupy the
    # assist-blade and lock-chip slots themselves.
    if re.search(r"[A-Z].*[A-Z]", combo.blade) and (
        combo.assistBlade != "None" or combo.lockChip != "None"
    ):
        return JSONResponse(
            status_code=400,
            content={"error": "Assist Blade e Lock Chip devono essere None per questa Blade"},
        )

    try:
        if not await _components_exist(db, combo):
            return JSONResponse(status_code=400, content={"error": "Invalid combo components"})

        challenger_id = await _challenger_id(db, user.id)
        if not challenger_id:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Per registrare combo su tornei Challengermode devi collegare "
                    "il tuo account Challengermode."
                },
            )

        existing = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, placement, "
                    "total_participants, tournament_date, season, updated_at "
                    "FROM external_player_combos "
                    "WHERE tournament_id = :tid AND player_id = :pid AND combo_number = :num "
                    "LIMIT 1"
                ),
                {"tid": tournament_id, "pid": challenger_id, "num": number},
            )
        ).first()

        if existing is None:
            return await _insert_new_combo(
                db, user, tournament_id, number, combo, challenger_id
            )

        if not user.is_admin and _edit_window_expired(existing.updated_at):
            return JSONResponse(
                status_code=403, content={"error": "Tempo per le modifiche scaduto (48 ore)."}
            )

        placement = int(existing.placement or 0)
        participants = int(existing.total_participants or 0)
        if placement > 4:
            return JSONResponse(
                status_code=403,
                content={"error": "Solo i primi 4 classificati possono registrare le combo."},
            )

        scores = placement > 0 and participants > 0

        if scores:
            await revert_external_combo(
                db,
                ComboResult(
                    blade=existing.blade, assist_blade=existing.assist_blade,
                    ratchet=existing.ratchet, bit=existing.bit, lock_chip=existing.lock_chip,
                    season=_season_of(existing.season, existing.tournament_date),
                    placement=placement, total_participants=participants,
                ),
            )

        updated = (
            await db.execute(
                text(
                    "UPDATE external_player_combos SET blade = :blade, assist_blade = :assist, "
                    "ratchet = :ratchet, bit = :bit, lock_chip = :chip, updated_at = now() "
                    "WHERE tournament_id = :tid AND player_id = :pid AND combo_number = :num "
                    "RETURNING blade, assist_blade, ratchet, bit, lock_chip, season, tournament_date"
                ),
                {
                    "blade": combo.blade, "assist": combo.assistBlade, "ratchet": combo.ratchet,
                    "bit": combo.bit, "chip": combo.lockChip, "tid": tournament_id,
                    "pid": challenger_id, "num": number,
                },
            )
        ).first()
        await db.commit()

        if scores:
            await process_external_combo(
                db,
                ComboResult(
                    blade=updated.blade, assist_blade=updated.assist_blade,
                    ratchet=updated.ratchet, bit=updated.bit, lock_chip=updated.lock_chip,
                    season=_season_of(updated.season, updated.tournament_date),
                    placement=placement, total_participants=participants,
                ),
            )
            await _refresh_top_components(db)

        if updated.tournament_date:
            await _upsert_cm_match_result(
                db, tournament_id=tournament_id, player_id=challenger_id, combo_number=number,
                combo=combo, placement=placement, participants=participants,
                tournament_date=updated.tournament_date,
            )
            await db.commit()

        await _audit(
            db, user=user, action="user_update_combo", tournament_id=tournament_id,
            player_id=challenger_id,
            payload={
                "comboNumber": number,
                "before": {
                    "blade": existing.blade, "assistBlade": existing.assist_blade,
                    "ratchet": existing.ratchet, "bit": existing.bit,
                    "lockChip": existing.lock_chip,
                },
                "after": {
                    "blade": combo.blade, "assistBlade": combo.assistBlade,
                    "ratchet": combo.ratchet, "bit": combo.bit, "lockChip": combo.lockChip,
                },
            },
        )

        return {
            "success": True,
            "combo": {
                "tournamentId": tournament_id, "comboNumber": number,
                "blade": combo.blade, "assistBlade": combo.assistBlade,
                "ratchet": combo.ratchet, "bit": combo.bit, "lockChip": combo.lockChip,
            },
        }
    except Exception as exc:
        await db.rollback()
        log.error("Combo upsert failed: %s", exc)
        return JSONResponse(status_code=400, content={"error": str(exc) or "Richiesta non valida"})


async def _insert_new_combo(
    db: AsyncSession, user: CurrentUser, tournament_id: str, number: int,
    combo: ComboInput, challenger_id: str,
) -> Any:
    """First combo for this slot: the placement has to be established first."""
    try:
        detail = await fetch_tournament_detail(db, tournament_id)
    except Exception as exc:
        log.warning("Failed to fetch CM tournament detail for upsert: %s", exc)
        return JSONResponse(
            status_code=404, content={"error": "Impossibile verificare il piazzamento nel torneo."}
        )

    placement, participants, tournament_date = _tournament_facts(detail, challenger_id)

    if not placement or placement > 4:
        return JSONResponse(
            status_code=403,
            content={"error": "Solo i primi 4 classificati possono registrare le combo."},
        )

    season = determine_season(_as_datetime(tournament_date) or datetime.now(timezone.utc))

    await db.execute(
        text(
            "INSERT INTO cm_players (id, nickname, avatar) VALUES (:id, :nick, NULL) "
            "ON CONFLICT DO NOTHING"
        ),
        {"id": challenger_id, "nick": challenger_id},
    )
    await db.execute(
        text(
            "INSERT INTO external_player_combos (tournament_id, player_id, combo_number, blade, "
            "assist_blade, ratchet, bit, lock_chip, placement, total_participants, "
            "tournament_date, season, platform) "
            "VALUES (:tid, :pid, :num, :blade, :assist, :ratchet, :bit, :chip, :placement, "
            ":participants, :tdate, :season, 'challengermode')"
        ),
        {
            "tid": tournament_id, "pid": challenger_id, "num": number, "blade": combo.blade,
            "assist": combo.assistBlade, "ratchet": combo.ratchet, "bit": combo.bit,
            "chip": combo.lockChip, "placement": placement, "participants": participants,
            "tdate": tournament_date, "season": season,
        },
    )
    await db.commit()

    if placement > 0 and participants and participants > 0:
        await process_external_combo(
            db,
            ComboResult(
                blade=combo.blade, assist_blade=combo.assistBlade, ratchet=combo.ratchet,
                bit=combo.bit, lock_chip=combo.lockChip, season=season,
                placement=placement, total_participants=participants,
            ),
        )
        await _refresh_top_components(db)

    if tournament_date:
        await _upsert_cm_match_result(
            db, tournament_id=tournament_id, player_id=challenger_id, combo_number=number,
            combo=combo, placement=placement, participants=participants or 0,
            tournament_date=tournament_date,
        )
        await db.commit()

    await _audit(
        db, user=user, action="user_insert_combo", tournament_id=tournament_id,
        player_id=challenger_id,
        payload={
            "comboNumber": number,
            "combo": {
                "blade": combo.blade, "assistBlade": combo.assistBlade,
                "ratchet": combo.ratchet, "bit": combo.bit, "lockChip": combo.lockChip,
            },
        },
    )

    return {
        "success": True,
        "combo": {
            "tournamentId": tournament_id, "comboNumber": number, "blade": combo.blade,
            "assistBlade": combo.assistBlade, "ratchet": combo.ratchet, "bit": combo.bit,
            "lockChip": combo.lockChip,
        },
    }


async def _components_exist(db: AsyncSession, combo: ComboInput) -> bool:
    """Every part must be a component we actually know about.

    'None' is a valid choice for the assist blade and the lock chip. A ratchet of
    'None' is only allowed when the bit is ratchet-less.
    """
    checks = [
        ("blade_stats", "blade", combo.blade, False),
        ("assist_blade_stats", "assist_blade", combo.assistBlade, True),
        ("lock_chip_stats", "lock_chip", combo.lockChip, True),
    ]
    for table, column, value, none_allowed in checks:
        if none_allowed and value == "None":
            continue
        found = (
            await db.execute(
                text(f"SELECT count(*) FROM {table} WHERE {column} = :v"), {"v": value}
            )
        ).scalar()
        if not found:
            return False

    bit_row = (
        await db.execute(
            text('SELECT is_ratchet_less FROM bit_stats WHERE "bit" = :v LIMIT 1'),
            {"v": combo.bit},
        )
    ).first()
    if bit_row is None:
        return False

    if combo.ratchet == "None":
        return bool(bit_row.is_ratchet_less)

    ratchets = (
        await db.execute(
            text("SELECT count(*) FROM ratchet_stats WHERE ratchet = :v"), {"v": combo.ratchet}
        )
    ).scalar()
    return bool(ratchets)


@router.delete("/api/tournaments/{tournament_id}/combos/{combo_number}")
async def delete_combo(
    tournament_id: str,
    combo_number: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    tournament_id = tournament_id.strip()
    match = re.match(r"^\s*[-+]?\d+", combo_number)
    number = int(match.group()) if match else 0
    if not tournament_id or number < 1 or number > 3:
        return JSONResponse(status_code=400, content={"error": "Parametri non validi"})

    try:
        challenger_id = await _challenger_id(db, user.id)
        if not challenger_id:
            return JSONResponse(
                status_code=403,
                content={"error": "Operazione consentita solo agli utenti Challengermode"},
            )

        existing = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, placement, "
                    "total_participants, tournament_date, season, updated_at "
                    "FROM external_player_combos "
                    "WHERE tournament_id = :tid AND player_id = :pid AND combo_number = :num "
                    "LIMIT 1"
                ),
                {"tid": tournament_id, "pid": challenger_id, "num": number},
            )
        ).first()
        if existing is None:
            return JSONResponse(
                status_code=404, content={"error": "Combo non trovata o non di tua proprietà"}
            )

        if not user.is_admin and _edit_window_expired(existing.updated_at):
            return JSONResponse(
                status_code=403, content={"error": "Tempo per le modifiche scaduto (48 ore)."}
            )

        placement = int(existing.placement or 0)
        participants = int(existing.total_participants or 0)

        if placement > 0 and participants > 0:
            await revert_external_combo(
                db,
                ComboResult(
                    blade=existing.blade, assist_blade=existing.assist_blade,
                    ratchet=existing.ratchet, bit=existing.bit, lock_chip=existing.lock_chip,
                    season=_season_of(existing.season, existing.tournament_date),
                    placement=placement, total_participants=participants,
                ),
            )

        await db.execute(
            text(
                "DELETE FROM external_player_combos "
                "WHERE tournament_id = :tid AND player_id = :pid AND combo_number = :num"
            ),
            {"tid": tournament_id, "pid": challenger_id, "num": number},
        )
        await db.execute(
            text(
                "DELETE FROM cm_match_results "
                "WHERE tournament_id = :tid AND player_id = :pid AND combo_number = :num"
            ),
            {"tid": tournament_id, "pid": challenger_id, "num": number},
        )
        await db.commit()

        await _audit(
            db, user=user, action="user_delete_combo", tournament_id=tournament_id,
            player_id=challenger_id,
            payload={
                "comboNumber": number,
                "deleted": {
                    "blade": existing.blade, "assistBlade": existing.assist_blade,
                    "ratchet": existing.ratchet, "bit": existing.bit,
                    "lockChip": existing.lock_chip,
                },
            },
        )

        return {"success": True}
    except Exception as exc:
        await db.rollback()
        log.error("Combo delete failed: %s", exc)
        return JSONResponse(status_code=400, content={"error": str(exc) or "Richiesta non valida"})
