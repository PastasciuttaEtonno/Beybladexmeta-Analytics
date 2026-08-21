"""Pulling ended IBNA tournaments from the Challonge v1 REST API.

Ported from backend/src/lib/challonge.ts.

Challonge is a dead end for this project — the real dataset was scraped by hand
and loaded from CSV — but the endpoint exists, so it is reproduced rather than
left behind on the old backend. Without CHALLONGE_API_KEY it raises, exactly as
the original does, and the caller turns that into a 500.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

log = logging.getLogger(__name__)

BASE_URL = "https://api.challonge.com/v1"


async def sync_challonge_tournaments(db: AsyncSession) -> dict[str, int]:
    api_key = get_settings().challonge_api_key
    if not api_key:
        raise RuntimeError("Missing CHALLONGE_API_KEY")

    log.info("[Challonge] Starting sync...")

    params = {
        "api_key": api_key,
        "state": "ended",
        "created_after": "2026-02-01",
        "subdomain": "ibna",
    }

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        try:
            response = await client.get(f"{BASE_URL}/tournaments.json", params=params)
            response.raise_for_status()
            tournaments = response.json()
        except Exception as exc:
            log.error("[Challonge] Failed to fetch tournaments: %s", exc)
            raise

        log.info("[Challonge] Found %d tournaments.", len(tournaments))
        synced = 0

        for entry in tournaments:
            tournament = entry.get("tournament") or {}
            tournament_id = str(tournament.get("id"))
            log.info(
                "[Challonge] Processing tournament: %s (%s)",
                tournament.get("name"),
                tournament_id,
            )

            try:
                participants_response = await client.get(
                    f"{BASE_URL}/tournaments/{tournament_id}/participants.json",
                    params={"api_key": api_key},
                )
                participants_response.raise_for_status()
                participants = participants_response.json()
            except Exception as exc:
                # A tournament without its participants is useless for scoring,
                # so it is skipped rather than stored half-complete.
                log.error(
                    "[Challonge] Failed to fetch participants for %s: %s",
                    tournament_id,
                    exc,
                )
                continue

            payload = {
                "tournament": tournament,
                "participants": [p.get("participant") for p in participants],
            }

            try:
                await db.execute(
                    text(
                        "INSERT INTO challonge_match_results (tournament_id, data, fetched_at) "
                        "VALUES (:id, CAST(:data AS jsonb), :fetched) "
                        "ON CONFLICT (tournament_id) DO UPDATE SET "
                        "data = excluded.data, fetched_at = now()"
                    ),
                    {
                        "id": tournament_id,
                        "data": _json(payload),
                        "fetched": datetime.now(timezone.utc).replace(tzinfo=None),
                    },
                )
                await db.commit()
                synced += 1
            except Exception as exc:
                await db.rollback()
                log.error(
                    "[Challonge] Failed to upsert tournament %s: %s", tournament_id, exc
                )

    log.info("[Challonge] Sync complete. Synced %d tournaments.", synced)
    return {"synced": synced, "totalFound": len(tournaments)}


def _json(value: object) -> str:
    import json

    return json.dumps(value)
