"""Login rate limiting, ported from backend/src/rateLimiter.ts.

Failed attempts are counted per IP and per email over a rolling window; five
within the window blocks further attempts for the same duration. Everything
lives in the `login_attempts` table, so both backends share one view of who is
blocked — a caller cannot dodge the limit by being routed to the other one.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
WINDOW_MINUTES = 5
BLOCK_MINUTES = 5


@dataclass(frozen=True)
class BlockStatus:
    blocked: bool
    remaining_time: int | None = None


def _window_start() -> datetime:
    """Naive UTC, because `login_attempts.attempted_at` is `timestamp without
    time zone` and its default is Postgres `now()`.

    Passing a tz-aware value here made asyncpg reject the query, the broad
    except below swallowed it, and every check answered "not blocked" — the
    limiter failed OPEN and silently stopped limiting anything.
    """
    return (datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MINUTES)).replace(tzinfo=None)


async def _recent_failures(db: AsyncSession, column: str, value: str) -> list[datetime]:
    rows = (
        await db.execute(
            text(
                f"SELECT attempted_at FROM login_attempts "
                f"WHERE {column} = :value AND success = false AND attempted_at >= :since "
                "ORDER BY attempted_at DESC"
            ),
            {"value": value, "since": _window_start()},
        )
    ).all()
    return [r.attempted_at for r in rows]


def _still_blocked(latest: datetime) -> BlockStatus:
    moment = latest if latest.tzinfo else latest.replace(tzinfo=timezone.utc)
    until = moment + timedelta(minutes=BLOCK_MINUTES)
    now = datetime.now(timezone.utc)
    if now < until:
        return BlockStatus(True, remaining_time=int((until - now).total_seconds() + 0.999))
    return BlockStatus(False)


async def is_blocked(db: AsyncSession, ip: str, email: str | None = None) -> BlockStatus:
    try:
        for column, value in (("ip_address", ip), ("email", (email or "").lower())):
            if not value:
                continue
            failures = await _recent_failures(db, column, value)
            if len(failures) >= MAX_ATTEMPTS:
                status = _still_blocked(failures[0])
                if status.blocked:
                    return status
        return BlockStatus(False)
    except Exception as exc:
        # A rate limiter that breaks must not lock everyone out.
        log.error("[RateLimiter] Failed to check block status: %s", exc)
        return BlockStatus(False)


async def record_failed_attempt(db: AsyncSession, ip: str, email: str) -> None:
    try:
        await db.execute(
            text(
                "INSERT INTO login_attempts (ip_address, email, success) "
                "VALUES (:ip, :email, false)"
            ),
            {"ip": ip, "email": email.lower()},
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        log.error("[RateLimiter] Failed to record failed attempt: %s", exc)


async def record_successful_login(db: AsyncSession, ip: str, email: str) -> None:
    """A success clears the failures that were counting against this caller."""
    normalised = email.lower()
    try:
        await db.execute(
            text(
                "INSERT INTO login_attempts (ip_address, email, success) "
                "VALUES (:ip, :email, true)"
            ),
            {"ip": ip, "email": normalised},
        )
        await db.execute(
            text(
                "DELETE FROM login_attempts WHERE success = false "
                "AND (ip_address = :ip OR email = :email) AND attempted_at >= :since"
            ),
            {"ip": ip, "email": normalised, "since": _window_start()},
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        log.error("[RateLimiter] Failed to record successful login: %s", exc)
