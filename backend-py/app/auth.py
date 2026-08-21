"""Reads the session created by the Express backend.

Both backends serve traffic during the migration, so FastAPI must recognise a
login performed by Express — and vice versa. Rather than inventing a second auth
scheme, this module speaks the existing one:

  * cookie `connect.sid`, value `s:<sid>.<signature>`, where the signature is
    base64(HMAC-SHA256(sid, SESSION_SECRET)) with trailing '=' stripped
    (the `cookie-signature` package used by express-session);
  * the session body lives in the `session` table written by connect-pg-simple
    (`sid`, `sess` jsonb, `expire`), with the user id under `sess->>'userId'`.

Writing sessions stays with Express for now: only /api/auth/* creates them, and
that route group is migrated last.
"""

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated, Any
from urllib.parse import unquote

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session

SESSION_COOKIE_NAME = "connect.sid"


def unsign(signed_value: str, secret: str) -> str | None:
    """Recover the session id from a signed cookie, or None if it does not verify."""
    # Express's `cookie` package percent-decodes cookie values; Starlette does
    # not. Without this the value still reads "s%3A<sid>..." and nothing matches.
    # unquote (not unquote_plus) leaves '+' alone, which base64 signatures need.
    signed_value = unquote(signed_value)

    # A value carrying an unusual character is sent wrapped in double quotes
    # (RFC 6265 quoted-string). Express's parser strips them, so this must too,
    # or a cookie issued before the encoding was fixed would look invalid.
    if len(signed_value) >= 2 and signed_value[0] == '"' and signed_value[-1] == '"':
        signed_value = signed_value[1:-1]

    if not signed_value.startswith("s:"):
        return None

    raw = signed_value[2:]
    separator = raw.rfind(".")
    if separator <= 0:
        return None

    sid, signature = raw[:separator], raw[separator + 1 :]
    digest = hmac.new(secret.encode("utf-8"), sid.encode("utf-8"), hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii").rstrip("=")

    if not hmac.compare_digest(signature, expected):
        return None
    return sid


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    display_name: str
    is_admin: bool
    is_verified: bool


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser | None:
    """Resolve the caller, or None when there is no valid session."""
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    if not cookie or not settings.session_secret:
        return None

    sid = unsign(cookie, settings.session_secret)
    if sid is None:
        return None

    row = (
        await db.execute(
            text("SELECT sess, expire FROM session WHERE sid = :sid"),
            {"sid": sid},
        )
    ).first()
    if row is None:
        return None

    sess_raw, expire = row
    # connect-pg-simple stores `expire` without a timezone; it is written in UTC.
    if expire is not None:
        if expire.tzinfo is None:
            expire = expire.replace(tzinfo=timezone.utc)
        if expire < datetime.now(timezone.utc):
            return None

    sess: dict[str, Any] = sess_raw if isinstance(sess_raw, dict) else json.loads(sess_raw)
    user_id = sess.get("userId")
    if not user_id:
        return None

    user_row = (
        await db.execute(
            text(
                "SELECT id, email, display_name, is_admin, is_verified "
                "FROM users WHERE id = :id"
            ),
            {"id": user_id},
        )
    ).first()
    if user_row is None:
        return None

    return CurrentUser(
        id=user_row.id,
        email=user_row.email,
        display_name=user_row.display_name,
        is_admin=bool(user_row.is_admin),
        is_verified=bool(user_row.is_verified),
    )


async def require_user(
    user: Annotated[CurrentUser | None, Depends(get_current_user)],
) -> CurrentUser:
    # Same status and body as the Express requireAuth middleware, so the
    # frontend cannot tell which backend answered.
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Not authenticated"},
        )
    return user


async def require_admin(
    user: Annotated[CurrentUser, Depends(require_user)],
) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "Admin access required"},
        )
    return user
