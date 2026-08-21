"""Challonge aliases claimed by a user.

Ported from the alias handlers in backend/src/routes/auth.ts. Aliases let a
registered account claim the names it played under on Challonge, so its results
are attributed correctly.
"""

import logging
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, require_user
from app.db import get_session
from app.serialization import js_datetime

router = APIRouter()
log = logging.getLogger(__name__)

MAX_ALIASES = 3

_COLUMNS = (
    'id, user_id AS "userId", alias, platform, '
    'is_verified AS "isVerified", created_at AS "createdAt"'
)


def _alias_row(row: Any) -> dict:
    data = dict(row._mapping)
    data["createdAt"] = js_datetime(data["createdAt"])
    return data


@router.get("/api/user/aliases")
async def list_aliases(
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        rows = await db.execute(
            text(f"SELECT {_COLUMNS} FROM user_aliases WHERE user_id = :uid"),
            {"uid": user.id},
        )
        return [_alias_row(r) for r in rows]
    except Exception as exc:
        log.error("Error fetching aliases: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch aliases"})


@router.post("/api/user/aliases")
async def create_alias(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    # Claiming a Challonge name requires having proved you own a Challonge
    # account, otherwise anyone could claim anyone's results.
    linked = (
        await db.execute(
            text("SELECT challonge_id FROM users WHERE id = :uid"), {"uid": user.id}
        )
    ).scalar()
    if not linked:
        return JSONResponse(
            status_code=403,
            content={"error": "Devi autenticarti con Challonge per richiedere alias."},
        )

    try:
        body = await request.json()
    except Exception:
        body = {}

    alias = str((body or {}).get("alias") or "").strip()
    if not alias:
        return JSONResponse(status_code=400, content={"error": "Alias is required"})

    try:
        owned = (
            await db.execute(
                text("SELECT count(*) FROM user_aliases WHERE user_id = :uid"),
                {"uid": user.id},
            )
        ).scalar() or 0
        if owned >= MAX_ALIASES:
            return JSONResponse(
                status_code=400, content={"error": f"Limite di {MAX_ALIASES} alias raggiunto."}
            )

        # Aliases are globally unique: two accounts cannot claim the same name.
        taken = (
            await db.execute(
                text("SELECT 1 FROM user_aliases WHERE alias = :alias LIMIT 1"),
                {"alias": alias},
            )
        ).first()
        if taken is not None:
            return JSONResponse(status_code=409, content={"error": "Alias già reclamato"})

        row = (
            await db.execute(
                text(
                    "INSERT INTO user_aliases (user_id, alias, platform, is_verified) "
                    "VALUES (:uid, :alias, 'challonge', false) "
                    f"RETURNING {_COLUMNS}"
                ),
                {"uid": user.id, "alias": alias},
            )
        ).first()
        await db.commit()

        return JSONResponse(status_code=201, content=_alias_row(row))
    except Exception as exc:
        await db.rollback()
        log.error("Error creating alias: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to create alias"})


@router.delete("/api/user/aliases/{alias_id}")
async def delete_alias(
    alias_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    # parseInt semantics: leading digits win, anything else is NaN.
    match = re.match(r"^\s*[-+]?\d+", alias_id)
    if not match:
        return JSONResponse(status_code=400, content={"error": "Invalid ID"})
    numeric_id = int(match.group())

    try:
        owned = (
            await db.execute(
                text("SELECT 1 FROM user_aliases WHERE id = :id AND user_id = :uid LIMIT 1"),
                {"id": numeric_id, "uid": user.id},
            )
        ).first()
        if owned is None:
            return JSONResponse(
                status_code=404, content={"error": "Alias not found or unauthorized"}
            )

        await db.execute(text("DELETE FROM user_aliases WHERE id = :id"), {"id": numeric_id})
        await db.commit()
        return {"success": True}
    except Exception as exc:
        await db.rollback()
        log.error("Error deleting alias: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to delete alias"})
