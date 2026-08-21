"""What the signed-in user has entered, across both platforms.

Ported from the two per-user endpoints in backend/src/routes/tournaments.ts.

`/api/me/tournaments` reads what has already been recorded in this database.
`/api/challenger/participations` asks ChallengerMode directly, using the OAuth
token stashed in the session when the user linked their account — so it needs
that link, not just a login, and says so in Italian when it is missing.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, SESSION_COOKIE_NAME, require_user, unsign
from app.config import Settings, get_settings
from app.db import get_session
from app.lib.challengermode import fetch_tournament_detail, fetch_user_participations
from app.lib.sessions import load_session
from app.serialization import number

router = APIRouter()
log = logging.getLogger(__name__)


def _date_key(value: Any) -> float:
    """`new Date(x).getTime()`, with an unparseable date sorting last.

    The original sorts on the parsed date and treats a missing one as epoch 0,
    which puts it at the bottom of a descending sort.
    """
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(str(value)[:10]).timestamp()
    except ValueError:
        return 0.0


@router.get("/api/me/tournaments")
async def my_tournaments(
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        challenger_id = (
            await db.execute(
                text("SELECT challenger_id FROM users WHERE id = :id"), {"id": user.id}
            )
        ).scalar()

        tournaments: list[dict] = []

        if challenger_id:
            rows = (
                await db.execute(
                    text(
                        "SELECT tournament_id, MAX(data_torneo) AS date, "
                        "MIN(piazzamento) AS best_placement, "
                        "SUM(punti_guadagnati) AS total_points, COUNT(*) AS combo_count "
                        "FROM cm_match_results WHERE player_id = :player "
                        "GROUP BY tournament_id"
                    ),
                    {"player": challenger_id},
                )
            ).all()

            async def enrich(row: Any) -> dict:
                name = None
                day = str(row.date) if row.date else None
                try:
                    detail = await fetch_tournament_detail(db, str(row.tournament_id))
                    name = detail.get("name") or None
                    if not day:
                        started = (detail.get("schedule") or {}).get("startedAt")
                        if started:
                            day = str(started)[:10]
                except Exception:
                    pass
                return {
                    "tournamentId": str(row.tournament_id),
                    "date": day,
                    "name": name,
                    "bestPlacement": (
                        int(row.best_placement) if row.best_placement is not None else None
                    ),
                    # SUM over a double precision column: node-postgres hands
                    # back a JS number, so 360.0 must serialise as 360.
                    "totalPoints": number(row.total_points or 0),
                    "comboCount": int(row.combo_count or 0),
                    "platform": "challengermode",
                }

            tournaments.extend(await asyncio.gather(*(enrich(r) for r in rows)))

        challonge = (
            await db.execute(
                text(
                    "SELECT tournament_id, MAX(tournament_name) AS tournament_name, "
                    "MIN(rank) AS best_placement, COUNT(*) AS combo_count, "
                    "MAX(created_at) AS date FROM challonge_reported_combos "
                    "WHERE user_id = :user GROUP BY tournament_id"
                ),
                {"user": user.id},
            )
        ).all()

        for row in challonge:
            tournaments.append(
                {
                    "tournamentId": str(row.tournament_id),
                    "date": str(row.date)[:10] if row.date else None,
                    "name": str(row.tournament_name) if row.tournament_name else None,
                    "bestPlacement": (
                        int(row.best_placement) if row.best_placement is not None else None
                    ),
                    "totalPoints": 0,
                    "comboCount": int(row.combo_count or 0),
                    "platform": "challonge",
                }
            )

        # One entry per tournament. A named entry beats a nameless one, and
        # between two named ones the better placement wins.
        deduped: dict[str, dict] = {}
        for entry in tournaments:
            existing = deduped.get(entry["tournamentId"])
            if existing is None:
                deduped[entry["tournamentId"]] = entry
                continue
            prefer_new = (not existing["name"] and entry["name"]) or (
                existing["name"]
                and entry["name"]
                and (entry["bestPlacement"] or 999) < (existing["bestPlacement"] or 999)
            )
            if prefer_new:
                deduped[entry["tournamentId"]] = entry

        unique = sorted(deduped.values(), key=lambda t: _date_key(t["date"]), reverse=True)
        return {"tournaments": unique[:50]}
    except Exception as exc:
        log.error("Error fetching my tournaments: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": str(exc) or "Failed to fetch tournaments"}
        )


@router.get("/api/challenger/participations")
async def challenger_participations(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        challenger_id = (
            await db.execute(
                text("SELECT challenger_id FROM users WHERE id = :id"), {"id": user.id}
            )
        ).scalar()
        if not challenger_id:
            return JSONResponse(
                status_code=400,
                content={"error": "Devi effettuare il login con Challengermode"},
            )

        # The OAuth token lives in the express-session row, put there by the
        # ChallengerMode callback. It is per-user and short-lived, so there is
        # nothing to cache and no service key that could stand in for it.
        cookie = request.cookies.get(SESSION_COOKIE_NAME)
        sid = unsign(cookie, settings.session_secret) if cookie else None
        access_token = (await load_session(db, sid)).get("cm_access_token")
        if not access_token:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Sessione Challengermode non disponibile. Effettua "
                    "nuovamente il login con Challengermode."
                },
            )

        participations = await fetch_user_participations(access_token)

        # dict.fromkeys keeps first-seen order, which is what Array.from(new Set)
        # does — and the response order is part of the contract.
        ids = list(dict.fromkeys(p["tournamentId"] for p in participations if p["tournamentId"]))

        existing = {
            str(r.tournament_id)
            for r in (
                await db.execute(text("SELECT DISTINCT tournament_id FROM cm_match_results"))
            ).all()
        }

        async def enrich(tournament_id: str) -> dict:
            try:
                detail = await fetch_tournament_detail(db, tournament_id)
                started = (detail.get("schedule") or {}).get("startedAt")
                return {
                    "tournamentId": tournament_id,
                    "name": detail.get("name") or None,
                    "state": detail.get("state") or None,
                    "date": str(started)[:10] if started else None,
                    "hasCombos": tournament_id in existing,
                }
            except Exception:
                return {
                    "tournamentId": tournament_id,
                    "name": None,
                    "state": None,
                    "date": None,
                    "hasCombos": tournament_id in existing,
                }

        return {"participations": await asyncio.gather(*(enrich(t) for t in ids))}
    except Exception as exc:
        log.error("Error fetching user participations: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": str(exc) or "Failed to fetch participations"}
        )
