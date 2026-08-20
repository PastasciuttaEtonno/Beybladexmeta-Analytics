"""Saved combos and decks.

Ported from backend/src/routes/favorites.ts. This is the first group behind
`requireAuth`, so it is also the first real exercise of the shared Express
session (see app/auth.py).

Every handler answers exactly what Express answers, including its broad
`{"error": "Invalid request"}` 400 for anything that fails validation.
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, require_user
from app.db import get_session

router = APIRouter()
log = logging.getLogger(__name__)

MAX_COMBOS = 20
MAX_DECKS = 20

# 'None' is a real, valid selection for these two slots, so it is accepted
# without being looked up in the component tables.
_OPTIONAL_SLOTS = {"assistBlade": "assist_blade_stats", "lockChip": "lock_chip_stats"}

_COMPONENT_TABLES = {
    "blade": ("blade_stats", "blade"),
    "assistBlade": ("assist_blade_stats", "assist_blade"),
    "ratchet": ("ratchet_stats", "ratchet"),
    "bit": ("bit_stats", '"bit"'),
    "lockChip": ("lock_chip_stats", "lock_chip"),
}

_INVALID_REQUEST = JSONResponse(status_code=400, content={"error": "Invalid request"})


class ComboInput(BaseModel):
    """Mirrors addFavoriteComboSchema: trimmed strings, 1..100 characters."""

    blade: str = Field(min_length=1, max_length=100)
    assistBlade: str = Field(min_length=1, max_length=100)
    ratchet: str = Field(min_length=1, max_length=100)
    bit: str = Field(min_length=1, max_length=100)
    lockChip: str = Field(min_length=1, max_length=100)

    @field_validator("*")
    @classmethod
    def _trim(cls, value: str) -> str:
        return value.strip()


class DeckInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    combos: list[ComboInput]

    @field_validator("name")
    @classmethod
    def _trim(cls, value: str) -> str:
        return value.strip()


async def _components_exist(db: AsyncSession, combo: ComboInput) -> bool:
    for field, (table, column) in _COMPONENT_TABLES.items():
        value = getattr(combo, field)
        if field in _OPTIONAL_SLOTS and value == "None":
            continue
        found = (
            await db.execute(
                text(f"SELECT count(*) FROM {table} WHERE {column} = :value"),
                {"value": value},
            )
        ).scalar()
        if not found:
            return False
    return True


def _combo_row(row: Any) -> dict:
    return {
        "id": row.id,
        "userId": row.user_id,
        "blade": row.blade,
        "assistBlade": row.assist_blade,
        "ratchet": row.ratchet,
        "bit": row.bit,
        "lockChip": row.lock_chip,
    }


def _deck_combo_row(row: Any) -> dict:
    return {
        "id": row.id,
        "deckId": row.deck_id,
        "comboNumber": row.combo_number,
        "blade": row.blade,
        "assistBlade": row.assist_blade,
        "ratchet": row.ratchet,
        "bit": row.bit,
        "lockChip": row.lock_chip,
    }


@router.get("/api/favorites/combos")
async def list_combos(
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        rows = await db.execute(
            text(
                "SELECT id, user_id, blade, assist_blade, ratchet, bit, lock_chip "
                "FROM favorite_combos WHERE user_id = :uid"
            ),
            {"uid": user.id},
        )
        return {"combos": [_combo_row(r) for r in rows]}
    except Exception as exc:
        log.error("Failed to fetch favorite combos: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch favorite combos"}
        )


@router.post("/api/favorites/combos")
async def add_combo(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        combo = ComboInput.model_validate(await request.json())
    except Exception:
        return _INVALID_REQUEST

    try:
        saved = (
            await db.execute(
                text("SELECT count(*) FROM favorite_combos WHERE user_id = :uid"),
                {"uid": user.id},
            )
        ).scalar() or 0

        if saved >= MAX_COMBOS:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"You can only save up to {MAX_COMBOS} combos. "
                    "Delete a combo to add a new one."
                },
            )

        if not await _components_exist(db, combo):
            return JSONResponse(status_code=400, content={"error": "Invalid combo components"})

        row = (
            await db.execute(
                text(
                    "INSERT INTO favorite_combos (user_id, blade, assist_blade, ratchet, bit, lock_chip) "
                    "VALUES (:uid, :blade, :assist, :ratchet, :bit, :chip) "
                    "RETURNING id, user_id, blade, assist_blade, ratchet, bit, lock_chip"
                ),
                {
                    "uid": user.id,
                    "blade": combo.blade,
                    "assist": combo.assistBlade,
                    "ratchet": combo.ratchet,
                    "bit": combo.bit,
                    "chip": combo.lockChip,
                },
            )
        ).first()
        await db.commit()

        return {"combo": _combo_row(row)}
    except Exception as exc:
        await db.rollback()
        log.error("Failed to add favorite combo: %s", exc)
        return _INVALID_REQUEST


@router.delete("/api/favorites/combos/{combo_id}")
async def delete_combo(
    combo_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        # Scoped to the owner, so deleting someone else's id is a silent no-op
        # that still reports success — same as Express.
        await db.execute(
            text("DELETE FROM favorite_combos WHERE id = :id AND user_id = :uid"),
            {"id": combo_id, "uid": user.id},
        )
        await db.commit()
        return {"success": True}
    except Exception as exc:
        await db.rollback()
        log.error("Failed to delete favorite combo: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to delete favorite combo"}
        )


@router.get("/api/favorites/decks")
async def list_decks(
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        decks = (
            await db.execute(
                text("SELECT id, user_id, name FROM favorite_decks WHERE user_id = :uid"),
                {"uid": user.id},
            )
        ).all()

        out = []
        for deck in decks:
            combos = await db.execute(
                text(
                    "SELECT id, deck_id, combo_number, blade, assist_blade, ratchet, bit, lock_chip "
                    "FROM favorite_deck_combos WHERE deck_id = :did ORDER BY combo_number ASC"
                ),
                {"did": deck.id},
            )
            out.append(
                {
                    "id": deck.id,
                    "userId": deck.user_id,
                    "name": deck.name,
                    "combos": [_deck_combo_row(c) for c in combos],
                }
            )

        return {"decks": out}
    except Exception as exc:
        log.error("Failed to fetch favorite decks: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to fetch favorite decks"}
        )


@router.post("/api/favorites/decks")
async def add_deck(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        body = await request.json()
    except Exception:
        return _INVALID_REQUEST

    # Checked before parsing, because Express reports this specific message for
    # a missing name or the wrong number of combos.
    if not isinstance(body, dict) or not body.get("name") or len(body.get("combos") or []) != 3:
        return JSONResponse(
            status_code=400, content={"error": "Deck must have a name and exactly 3 combos"}
        )

    raw_combos = body["combos"]
    for combo in raw_combos:
        if not isinstance(combo, dict) or not all(
            combo.get(field) for field in _COMPONENT_TABLES
        ):
            return JSONResponse(
                status_code=400, content={"error": "All combo components must be filled"}
            )

    # Every part must be distinct across the whole deck; the two optional slots
    # are exempt when left as 'None'.
    parts: list[str] = []
    for combo in raw_combos:
        parts.extend([combo["blade"], combo["ratchet"], combo["bit"]])
        if combo["assistBlade"] != "None":
            parts.append(combo["assistBlade"])
        if combo["lockChip"] != "None":
            parts.append(combo["lockChip"])

    if len(set(parts)) != len(parts):
        return JSONResponse(
            status_code=400,
            content={
                "error": "All parts must be different across all combos in the deck "
                "(except None for Assist Blade and Lock Chip)"
            },
        )

    try:
        deck = DeckInput.model_validate(body)
    except Exception:
        return _INVALID_REQUEST

    try:
        saved = (
            await db.execute(
                text("SELECT count(*) FROM favorite_decks WHERE user_id = :uid"),
                {"uid": user.id},
            )
        ).scalar() or 0

        if saved >= MAX_DECKS:
            return JSONResponse(
                status_code=400,
                content={
                    "error": f"You can only save up to {MAX_DECKS} decks. "
                    "Delete a deck to add a new one."
                },
            )

        for combo in deck.combos:
            if not await _components_exist(db, combo):
                return JSONResponse(
                    status_code=400, content={"error": "Invalid deck combo components"}
                )

        new_deck = (
            await db.execute(
                text(
                    "INSERT INTO favorite_decks (user_id, name) VALUES (:uid, :name) "
                    "RETURNING id, user_id, name"
                ),
                {"uid": user.id, "name": deck.name},
            )
        ).first()

        inserted = []
        for index, combo in enumerate(deck.combos, start=1):
            row = (
                await db.execute(
                    text(
                        "INSERT INTO favorite_deck_combos "
                        "(deck_id, combo_number, blade, assist_blade, ratchet, bit, lock_chip) "
                        "VALUES (:did, :num, :blade, :assist, :ratchet, :bit, :chip) "
                        "RETURNING id, deck_id, combo_number, blade, assist_blade, ratchet, bit, lock_chip"
                    ),
                    {
                        "did": new_deck.id,
                        "num": index,
                        "blade": combo.blade,
                        "assist": combo.assistBlade,
                        "ratchet": combo.ratchet,
                        "bit": combo.bit,
                        "chip": combo.lockChip,
                    },
                )
            ).first()
            inserted.append(_deck_combo_row(row))

        await db.commit()

        return {
            "deck": {
                "id": new_deck.id,
                "userId": new_deck.user_id,
                "name": new_deck.name,
                "combos": inserted,
            }
        }
    except Exception as exc:
        await db.rollback()
        log.error("Failed to add favorite deck: %s", exc)
        return _INVALID_REQUEST


@router.delete("/api/favorites/decks/{deck_id}")
async def delete_deck(
    deck_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        # favorite_deck_combos cascades on the foreign key.
        await db.execute(
            text("DELETE FROM favorite_decks WHERE id = :id AND user_id = :uid"),
            {"id": deck_id, "uid": user.id},
        )
        await db.commit()
        return {"success": True}
    except Exception as exc:
        await db.rollback()
        log.error("Failed to delete favorite deck: %s", exc)
        return JSONResponse(
            status_code=500, content={"error": "Failed to delete favorite deck"}
        )
