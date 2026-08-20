"""ChallengerMode API client.

Ported from backend/src/challengermode.ts. Tournament names and schedules are
not in our database — they come from ChallengerMode's GraphQL API — so several
endpoints cannot be served without this.

Responses are cached in the `external_api_cache` table, shared with the Express
backend: the same cache_key format, the same rows. Whichever service fetches
first fills the cache for both.

Set CHALLENGERMODE_CACHE_TTL_MINUTES very high to guarantee both backends read
the same cached rows and neither reaches the network — which is what makes the
parity checks deterministic.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

log = logging.getLogger(__name__)

DEFAULT_AUTH_URL = "https://publicapi.challengermode.com/mk1/v1/auth/access_keys"
DEFAULT_GRAPHQL_URL = "https://publicapi.challengermode.com/graphql"

_TOKEN_SAFETY_BUFFER_SECONDS = 30
_DEFAULT_TOKEN_TTL_SECONDS = 600


def _auth_url() -> str:
    configured = get_settings().challengermode_auth_url
    return configured if configured.startswith("http") else DEFAULT_AUTH_URL


def _graphql_url() -> str:
    return get_settings().challengermode_graphql_url or DEFAULT_GRAPHQL_URL


def _cache_ttl_minutes() -> float:
    return get_settings().challengermode_cache_ttl_minutes


def _token_cache_path() -> Path:
    configured = get_settings().challengermode_token_cache_path
    if configured:
        return Path(configured)
    return Path(tempfile.gettempdir()) / "beybladexmeta-challengermode-token.json"


@dataclass
class AccessToken:
    token: str
    expires_at: float  # epoch seconds


_cached_token: AccessToken | None = None
_token_lock = asyncio.Lock()


def _is_valid(record: AccessToken | None) -> bool:
    return record is not None and record.expires_at - _TOKEN_SAFETY_BUFFER_SECONDS > time.time()


def _load_persisted_token() -> AccessToken | None:
    try:
        data = json.loads(_token_cache_path().read_text(encoding="utf-8"))
        # The TypeScript client stores expiresAt in MILLIseconds; keep reading
        # and writing that format so the two can share the file.
        record = AccessToken(token=str(data["token"]), expires_at=float(data["expiresAt"]) / 1000)
        return record if _is_valid(record) else None
    except Exception:
        return None


def _persist_token(record: AccessToken) -> None:
    try:
        path = _token_cache_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"token": record.token, "expiresAt": int(record.expires_at * 1000)}),
            encoding="utf-8",
        )
    except Exception as exc:  # persistence is a nicety, never fatal
        log.warning("[Challengermode] Failed to persist token cache: %s", exc)


def _extract_expiry(payload: Any) -> float:
    candidate = None
    if isinstance(payload, dict):
        candidate = payload.get("expiresAt") or payload.get("expires_at") or payload.get("expiry")

    if isinstance(candidate, str):
        try:
            return datetime.fromisoformat(candidate.replace("Z", "+00:00")).timestamp()
        except ValueError:
            pass
    if isinstance(candidate, (int, float)):
        # Small numbers are seconds, large ones milliseconds.
        return float(candidate) if candidate < 10_000_000_000 else float(candidate) / 1000

    return time.time() + _DEFAULT_TOKEN_TTL_SECONDS


def _extract_token(payload: Any) -> str | None:
    if isinstance(payload, str):
        return payload
    if not isinstance(payload, dict):
        return None
    for key in ("accessKey", "access_token", "token", "accessToken", "value"):
        if payload.get(key):
            return str(payload[key])
    keys = payload.get("accessKeys")
    if isinstance(keys, list) and keys and isinstance(keys[0], dict):
        return keys[0].get("accessKey")
    return None


async def get_access_token() -> str:
    """A short-lived API token, reused from memory or the on-disk cache."""
    global _cached_token

    if _is_valid(_cached_token):
        return _cached_token.token  # type: ignore[union-attr]

    async with _token_lock:
        if _is_valid(_cached_token):
            return _cached_token.token  # type: ignore[union-attr]

        persisted = _load_persisted_token()
        if persisted is not None:
            _cached_token = persisted
            return persisted.token

        settings = get_settings()
        refresh_key = settings.challengermode_refresh_key or settings.challengermode_api_key
        if not refresh_key:
            raise RuntimeError(
                "Server misconfiguration: CHALLENGERMODE_REFRESH_KEY is missing"
            )

        log.info("[Challengermode] Auth POST %s (refreshKey provided)", _auth_url())
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(_auth_url(), json={"refreshKey": refresh_key})

        if response.status_code >= 400:
            log.info("[Challengermode] Auth response %s", response.status_code)
            raise RuntimeError(f"Challengermode auth failed: {response.status_code}")

        try:
            payload = response.json()
        except ValueError:
            payload = response.text

        token = _extract_token(payload)
        if not token:
            raise RuntimeError("Challengermode auth responded without a usable token")

        _cached_token = AccessToken(token=token, expires_at=_extract_expiry(payload))
        _persist_token(_cached_token)
        return _cached_token.token


# --- Shared response cache -------------------------------------------------


async def get_cached(db: AsyncSession, key: str) -> Any | None:
    """A cached response, or None when it is missing or too old."""
    try:
        row = (
            await db.execute(
                text("SELECT data, created_at FROM external_api_cache WHERE cache_key = :key"),
                {"key": key},
            )
        ).first()
        if row is None:
            return None

        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)

        age_seconds = (datetime.now(timezone.utc) - created).total_seconds()
        if age_seconds < _cache_ttl_minutes() * 60:
            return row.data
        return None
    except Exception as exc:
        log.warning("[Cache] get_cached error: %s", exc)
        return None


async def put_cached(db: AsyncSession, key: str, payload: Any) -> None:
    try:
        await db.execute(
            text(
                "INSERT INTO external_api_cache (cache_key, data) VALUES (:key, CAST(:data AS jsonb)) "
                "ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, created_at = now()"
            ),
            {"key": key, "data": json.dumps(payload)},
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        log.warning("[Cache] put_cached error: %s", exc)


async def _graphql(query: str, variables: dict | None = None) -> dict:
    token = await get_access_token()
    body: dict[str, Any] = {"query": query}
    if variables is not None:
        body["variables"] = variables

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            _graphql_url(),
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Challengermode GraphQL failed: {response.status_code} {response.text}"
        )
    return response.json()


_TOURNAMENTS_QUERY = """query TournamentsForGame {
  tournamentsForGame(
    input: {
      gameSlug: "beybladex"
      tournamentFilter: {
        completedTournamentSelector: { tournamentsAfter: "%s" }
      }
    }
  ) {
    description
    id
    name
    state
    contactUrl
    idSuffix
    gameTitle { id slug title }
    hosts { spaces { name description slug id logo(size: MEDIUM) { url width height } } }
  }
}"""

_DETAIL_QUERY = """query Tournament($tournamentId: UUID!) {
  tournament(tournamentId: $tournamentId) {
    id
    name
    state
    contactUrl
    schedule { startedAt }
    hosts {
      spaces {
        name
        description
        slug
        id
        logo(size: MEDIUM) { url width height }
      }
    }
    stages { format lineupCount }
    attendance {
      availableSlotCount
      confirmedLineupCount
      signups {
        userCount
        lineupCount
        lineups {
          placement { displayPlacement }
          members { user { username userId profilePicture(size: SMALL) { url width height } } }
        }
      }
    }
  }
}"""


async def fetch_tournaments_for_game(db: AsyncSession, after_iso: str) -> list[dict]:
    key = f"cm:tournamentsForGame:after={after_iso}"
    cached = await get_cached(db, key)
    if cached:
        return cached

    payload = await _graphql(_TOURNAMENTS_QUERY % after_iso)
    errors = payload.get("errors")
    if errors:
        raise RuntimeError(f"GraphQL error: {errors[0].get('message', 'unknown')}")

    tournaments = (payload.get("data") or {}).get("tournamentsForGame") or []
    await put_cached(db, key, tournaments)
    return tournaments


async def fetch_tournament_detail(db: AsyncSession, tournament_id: str) -> dict:
    key = f"cm:tournamentDetail:{tournament_id}"
    cached = await get_cached(db, key)
    if cached:
        return cached

    payload = await _graphql(_DETAIL_QUERY, {"tournamentId": tournament_id})
    node = (payload.get("data") or {}).get("tournament")
    if not node:
        raise RuntimeError("Challengermode tournament detail missing")

    await put_cached(db, key, node)
    return node


# --- Placement verification -------------------------------------------------
#
# The gate that stops one player registering combos in another player's name.
#
# This used to request its own token from challengermode.com/oauth/token with
# the client_credentials grant. That endpoint answers
#
#     {"error": "unsupported_grant_type"}
#
# so it never produced a token and every claim failed with "OAuth token error
# 400" — the gate rejected everyone, legitimate winners included. It now reuses
# fetch_tournament_detail, which authenticates with the refresh key that does
# work, already returns the lineups and their placements, and caches its answers
# in external_api_cache (so this is deterministic and offline-testable too).

_PLACEMENT_WORDS = {"1st": 1, "2nd": 2, "3rd": 3, "4th": 4}


def parse_placement(display: str | None) -> int | None:
    """'2nd', '2', '3 - 4' -> 2, 2, 3. None when there is no number to find.

    Shared placements are written as ranges; the first number is the best
    position that lineup reached.
    """
    if not display:
        return None
    match = re.search(r"\d+", str(display))
    if match:
        return int(match.group())
    return _PLACEMENT_WORDS.get(str(display))


async def check_tournament_placement(
    db: AsyncSession, tournament_id: str, user_id: str
) -> bool:
    """True when this ChallengerMode user really finished in the top four."""
    detail = await fetch_tournament_detail(db, tournament_id)
    lineups = ((detail or {}).get("attendance") or {}).get("signups", {}).get("lineups") or []

    for lineup in lineups:
        placement = parse_placement((lineup.get("placement") or {}).get("displayPlacement"))
        if not placement or not (1 <= placement <= 4):
            continue
        for member in lineup.get("members") or []:
            if ((member.get("user") or {}).get("userId") or "") == user_id:
                return True

    return False
