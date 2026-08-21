"""Creating and destroying sessions the way express-session does.

app/auth.py already reads these; this is the other half. Logging in through
FastAPI has to produce a session Express would accept and vice versa, which
means matching three things exactly: the id format, the row written by
connect-pg-simple, and the signed cookie.

  * id: 24 random bytes, base64url, unpadded — 32 characters, like `uid-safe`.
  * row: `session(sid, sess jsonb, expire)`, where `sess` carries the cookie
    settings alongside `userId`, because express-session stores both.
  * cookie: `connect.sid = s:<sid>.<signature>`, URL-encoded, with the same
    attributes Express sets (path, httpOnly, sameSite, maxAge).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SESSION_COOKIE_NAME

# One week, matching the Express session configuration.
MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7


def _new_sid() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(24)).decode().rstrip("=")


def _sign(sid: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), sid.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii").rstrip("=")


def _cookie_value(sid: str, secret: str) -> str:
    """`s:<sid>.<signature>`, percent-encoded exactly as Express writes it.

    This encoding is not cosmetic. The signature is standard base64, so it
    contains `/` about half the time, and Starlette's SimpleCookie answers an
    unusual character by wrapping the whole value in double quotes:

        connect.sid="s:abc.d/ef"

    Express's cookie parser strips those quotes, so it kept working; app/auth.py
    did not, so a session minted by FastAPI was rejected by FastAPI itself on
    roughly every other login. encodeURIComponent leaves only
    A-Za-z0-9 and -_.!~*'() alone, which is exactly the set below, and none of
    those need quoting.
    """
    digest = _sign(sid, secret)
    return quote(f"s:{sid}.{digest}", safe="!'()*-._~")


async def start_session(
    db: AsyncSession, response: Response, user_id: str, secret: str, secure: bool = False
) -> str:
    """Write a session row and set the cookie. Returns the session id."""
    sid = _new_sid()
    expires = datetime.now(timezone.utc) + timedelta(milliseconds=MAX_AGE_MS)

    payload = {
        "cookie": {
            "originalMaxAge": MAX_AGE_MS,
            "expires": expires.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "secure": secure,
            "httpOnly": True,
            "path": "/",
            "sameSite": "lax",
        },
        "userId": user_id,
    }

    await db.execute(
        text(
            "INSERT INTO session (sid, sess, expire) "
            "VALUES (:sid, CAST(:sess AS jsonb), :expire) "
            "ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire"
        ),
        {"sid": sid, "sess": json.dumps(payload), "expire": expires.replace(tzinfo=None)},
    )
    await db.commit()

    # Starlette URL-encodes the value itself, which is what Express's cookie
    # parser expects to decode.
    response.set_cookie(
        SESSION_COOKIE_NAME,
        _cookie_value(sid, secret),
        max_age=MAX_AGE_MS // 1000,
        path="/",
        httponly=True,
        samesite="lax",
        secure=secure,
    )
    return sid


async def end_session(db: AsyncSession, response: Response, sid: str | None) -> None:
    """Delete the session row and clear the cookie."""
    if sid:
        await db.execute(text("DELETE FROM session WHERE sid = :sid"), {"sid": sid})
        await db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")


async def load_session(db: AsyncSession, sid: str | None) -> dict:
    """The `sess` payload for a session id, or {} when there is none."""
    if not sid:
        return {}
    row = (
        await db.execute(text("SELECT sess FROM session WHERE sid = :sid"), {"sid": sid})
    ).first()
    if row is None:
        return {}
    payload = row.sess
    return payload if isinstance(payload, dict) else json.loads(payload)


def _cookie_payload(expires: datetime, secure: bool) -> dict:
    return {
        "originalMaxAge": MAX_AGE_MS,
        "expires": expires.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "secure": secure,
        "httpOnly": True,
        "path": "/",
        "sameSite": "lax",
    }


async def patch_session(
    db: AsyncSession,
    response: Response,
    sid: str | None,
    patch: dict,
    secret: str,
    secure: bool = False,
) -> str:
    """Merge keys into a session, creating one if the caller has none.

    express-session runs with saveUninitialized: false, so a session row only
    appears once something is written to it — which is exactly what the OAuth
    handlers do when they stash the PKCE verifier. Keys set to None are removed,
    matching `req.session.x = null` followed by a read that treats null as
    absent.
    """
    expires = datetime.now(timezone.utc) + timedelta(milliseconds=MAX_AGE_MS)

    existing = await load_session(db, sid)
    if not existing:
        sid = _new_sid()
        existing = {"cookie": _cookie_payload(expires, secure)}
        response.set_cookie(
            SESSION_COOKIE_NAME,
            _cookie_value(sid, secret),
            max_age=MAX_AGE_MS // 1000,
            path="/",
            httponly=True,
            samesite="lax",
            secure=secure,
        )

    existing.update(patch)

    await db.execute(
        text(
            "INSERT INTO session (sid, sess, expire) "
            "VALUES (:sid, CAST(:sess AS jsonb), :expire) "
            "ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire"
        ),
        {"sid": sid, "sess": json.dumps(existing), "expire": expires.replace(tzinfo=None)},
    )
    await db.commit()
    return sid
