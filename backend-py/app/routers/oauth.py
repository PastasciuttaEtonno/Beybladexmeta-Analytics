"""Linking a ChallengerMode or Challonge account, ported from
backend/src/auth-challenger.ts and backend/src/auth-challonge.ts.

These four routes are browser redirects, not API calls: every outcome, success
or failure, ends at `/profile`, with the reason in an `error` query parameter.
Nothing here returns JSON, so there is no response body to compare — what has
to match instead is the redirect target and the row the flow leaves behind.

Two things make them the most delicate routes in the migration:

  * They write to the session before the user is authenticated — the PKCE
    verifier and the CSRF state — which is why app/lib/sessions.py grew
    `patch_session`. express-session runs with saveUninitialized: false, so
    that first write is also what creates the session row and sets the cookie.

  * The callback can CREATE an account. A user who arrives without being logged
    in and whose ChallengerMode id is unknown gets a new row with a synthetic
    `<id>@challengermode.local` address and a random password, pre-verified.
    Getting that wrong would either duplicate accounts or hand one person's
    account to another, so the linking branch is a literal port.

The state check is what keeps a third party from completing the flow on
someone else's behalf; it is compared with a constant-time equality.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from typing import Annotated, Any
from urllib.parse import quote, urlencode

import bcrypt
import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SESSION_COOKIE_NAME, unsign
from app.config import Settings, get_settings
from app.db import get_session
from app.lib.challengermode import fetch_me_basic
from app.lib.sessions import load_session, patch_session

router = APIRouter()
log = logging.getLogger(__name__)

CM_AUTHORIZE_URL = "https://challengermode.com/oauth/authorize"
CM_TOKEN_URL = "https://challengermode.com/oauth/token"
CM_USERINFO_FALLBACK = "https://publicapi.challengermode.com/mk1/v1/me/userinfo"

CHALLONGE_AUTHORIZE_URL = "https://api.challonge.com/oauth/authorize"
CHALLONGE_TOKEN_URL = "https://api.challonge.com/oauth/token"
CHALLONGE_ME_URL = "https://api.challonge.com/v2.1/me.json"
CHALLONGE_SCOPE = "me tournaments:read tournaments:write matches:read matches:write"

# bcrypt cost used elsewhere in the application; OAuth accounts never log in
# with this password, but it still has to be a valid hash.
BCRYPT_ROUNDS = 10


def _to_profile(error: str | None = None) -> RedirectResponse:
    """Every exit from these flows lands on /profile, as the original does.

    302, not FastAPI's default 307: express `res.redirect` sends 302 and the
    two must be indistinguishable from the browser's point of view.
    """
    target = "/profile"
    if error:
        # encodeURIComponent leaves !'()* alone; quote(safe="") escapes them.
        # The set below matches JavaScript exactly.
        target += "?error=" + quote(error, safe="!'()*~-_.")
    return RedirectResponse(target, status_code=302)


def _redirect_with(response: RedirectResponse, error: str | None = None) -> RedirectResponse:
    """Re-point an existing redirect instead of building a new one.

    The response carries the Set-Cookie that patch_session wrote; returning a
    fresh RedirectResponse would drop it, and the caller would end up with a
    session row on the server that their browser knows nothing about. Express
    hands the cookie back on these paths too.
    """
    response.headers["location"] = _to_profile(error).headers["location"]
    return response


def _base64url(raw: bytes) -> str:
    return base64.b64encode(raw).decode().replace("+", "-").replace("/", "_").rstrip("=")


def _redirect_uri(request: Request, path: str, base_url: str | None = None) -> str:
    """Where the provider should send the browser back to.

    Behind nginx the request arrives on http with an internal host, so the
    X-Forwarded-* headers decide — otherwise the provider would be handed an
    unreachable address.
    """
    if base_url:
        return f"{base_url}{path}"
    forwarded_proto = request.headers.get("x-forwarded-proto")
    proto = (forwarded_proto.split(",")[0] if forwarded_proto else "") or request.url.scheme or "https"
    forwarded_host = request.headers.get("x-forwarded-host")
    host = (forwarded_host.split(",")[0] if forwarded_host else "") or request.headers.get("host") or ""
    return f"{proto}://{host}{path}"


async def _session_id(request: Request, settings: Settings) -> str | None:
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    return unsign(cookie, settings.session_secret) if cookie else None


async def _hash_random_password() -> str:
    import asyncio

    password = secrets.token_hex(24).encode()
    return await asyncio.to_thread(
        lambda: bcrypt.hashpw(password, bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()
    )


async def _user_by(db: AsyncSession, column: str, value: str) -> Any:
    return (
        await db.execute(
            text(
                "SELECT id, email, display_name, photo_url, challenger_id, "
                "challengermode_username, challonge_id, challonge_username "
                f"FROM users WHERE {column} = :value LIMIT 1"
            ),
            {"value": value},
        )
    ).first()


# ------------------------------------------------------ ChallengerMode ------


@router.get("/api/challenger/login")
async def challenger_login(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    client_id = settings.cm_client_id
    redirect_uri = _redirect_uri(request, "/api/challenger/callback")
    if not client_id or not redirect_uri:
        return _to_profile("OAuth misconfigured")

    state = secrets.token_bytes(16).hex()
    code_verifier = _base64url(secrets.token_bytes(32))
    code_challenge = _base64url(hashlib.sha256(code_verifier.encode()).digest())

    redirect = _to_profile()
    await patch_session(
        db,
        redirect,
        await _session_id(request, settings),
        {"cm_oauth_state": state, "cm_code_verifier": code_verifier},
        settings.session_secret,
    )

    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid offline_access",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    # Reuse the response so the Set-Cookie patch_session wrote survives.
    redirect.headers["location"] = f"{CM_AUTHORIZE_URL}?{query}"
    return redirect


@router.get("/api/challenger/callback")
async def challenger_callback(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        params = request.query_params
        code = params.get("code") or ""
        state = params.get("state") or ""
        oauth_error = params.get("error") or ""

        sid = await _session_id(request, settings)
        session = await load_session(db, sid)
        redirect = _to_profile()

        if not code or oauth_error:
            await patch_session(
                db, redirect, sid,
                {"cm_oauth_state": None, "cm_code_verifier": None},
                settings.session_secret,
            )
            return redirect

        expected = session.get("cm_oauth_state") or ""
        await patch_session(
            db, redirect, sid, {"cm_oauth_state": None}, settings.session_secret
        )
        if not state or not hmac.compare_digest(state, expected):
            return _redirect_with(redirect, "Invalid state")

        client_id = settings.cm_client_id
        client_secret = settings.cm_client_secret
        redirect_uri = _redirect_uri(request, "/api/challenger/callback")
        if not client_id or not client_secret or not redirect_uri:
            return _redirect_with(redirect, "OAuth misconfigured")

        code_verifier = session.get("cm_code_verifier") or ""
        await patch_session(
            db, redirect, sid, {"cm_code_verifier": None}, settings.session_secret
        )
        if not code_verifier:
            return _redirect_with(redirect, "Missing PKCE code_verifier")

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            token_response = await client.post(
                CM_TOKEN_URL,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                content=urlencode(
                    {
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "code_verifier": code_verifier,
                    }
                ),
            )
            if not token_response.is_success:
                return _redirect_with(redirect, "Token exchange failed")

            try:
                token_payload = token_response.json()
            except Exception:
                token_payload = {}

            access_token = token_payload.get("access_token") or token_payload.get("token") or ""
            if not access_token:
                return _redirect_with(redirect, "Missing access token")

            userinfo_response = await client.get(
                settings.cm_userinfo_url or CM_USERINFO_FALLBACK,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if not userinfo_response.is_success:
                return _redirect_with(redirect, "Failed to fetch userinfo")
            try:
                userinfo = userinfo_response.json()
            except Exception:
                userinfo = {}

        await patch_session(
            db, redirect, sid, {"cm_access_token": access_token}, settings.session_secret
        )

        challenger_id = str(userinfo.get("sub") or "")
        username = str(
            userinfo.get("preferred_username")
            or userinfo.get("username")
            or userinfo.get("name")
            or ""
        )
        avatar = str(userinfo["picture"]) if userinfo.get("picture") else None
        if not challenger_id:
            return _redirect_with(redirect, "Missing user id")

        if not username.strip():
            try:
                basic = await fetch_me_basic(access_token)
                if basic.get("username"):
                    username = basic["username"]
                if not avatar and basic.get("profilePictureUrl"):
                    avatar = basic["profilePictureUrl"]
            except Exception:
                pass

        existing = await _user_by(db, "challenger_id", challenger_id)
        current_user_id = (await load_session(db, sid)).get("userId")

        if current_user_id:
            current = await _user_by(db, "id", current_user_id)
            if current is None:
                return _redirect_with(redirect, "Sessione invalida")
            if existing is not None and existing.id != current.id:
                return _redirect_with(
                    redirect,
                    "Questo Challengermode ID è già collegato a un altro account",
                )

            updates = {
                "challenger_id": challenger_id,
                "challengermode_username": username,
            }
            if username and username != current.display_name:
                updates["display_name"] = username
            if avatar and avatar != (current.photo_url or None):
                updates["photo_url"] = avatar
            await _update_user(db, current.id, updates)
            user_id = current.id
        elif existing is None:
            user_id = await _create_oauth_user(
                db,
                email=f"{challenger_id}@challengermode.local",
                display_name=username or "",
                avatar=avatar,
                extra={
                    "challenger_id": challenger_id,
                    "challengermode_username": username,
                },
            )
        else:
            updates = {}
            if username and username != existing.display_name:
                updates["display_name"] = username
            if avatar and avatar != (existing.photo_url or None):
                updates["photo_url"] = avatar
            if username and username != existing.challengermode_username:
                updates["challengermode_username"] = username
            if updates:
                await _update_user(db, existing.id, updates)
            user_id = existing.id

        await db.execute(
            text(
                "INSERT INTO cm_players (id, nickname, avatar) "
                "VALUES (:id, :nickname, :avatar) "
                "ON CONFLICT (id) DO UPDATE SET nickname = excluded.nickname, "
                "avatar = excluded.avatar, updated_at = now()"
            ),
            {
                "id": challenger_id,
                "nickname": username or challenger_id,
                "avatar": avatar,
            },
        )
        await db.commit()

        await patch_session(
            db, redirect, sid, {"userId": user_id}, settings.session_secret
        )
        return redirect
    except Exception as exc:
        await db.rollback()
        log.error("ChallengerMode OAuth error: %s", exc)
        return _redirect_with(redirect, "OAuth error")


# ------------------------------------------------------------ Challonge ----


@router.get("/api/challonge/login")
async def challonge_login(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    client_id = settings.challonge_app_client_id
    if not client_id:
        return _to_profile("Challonge OAuth misconfigured (Missing Client ID)")

    redirect_uri = _redirect_uri(
        request, "/api/challonge/callback", settings.app_base_url or None
    )
    state = secrets.token_bytes(16).hex()

    redirect = _to_profile()
    try:
        await patch_session(
            db,
            redirect,
            await _session_id(request, settings),
            {"challonge_oauth_state": state},
            settings.session_secret,
        )
    except Exception as exc:
        log.error("Session save error: %s", exc)
        return _to_profile("Session error")

    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": CHALLONGE_SCOPE,
            "state": state,
        }
    )
    redirect.headers["location"] = f"{CHALLONGE_AUTHORIZE_URL}?{query}"
    return redirect


@router.get("/api/challonge/callback")
async def challonge_callback(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        params = request.query_params
        code = params.get("code") or ""
        state = params.get("state") or ""
        error = params.get("error")

        if error:
            return _to_profile(str(error))
        if not code:
            return _to_profile()

        sid = await _session_id(request, settings)
        session = await load_session(db, sid)
        redirect = _to_profile()

        expected = session.get("challonge_oauth_state")
        await patch_session(
            db, redirect, sid, {"challonge_oauth_state": None}, settings.session_secret
        )
        if not state or not expected or not hmac.compare_digest(state, str(expected)):
            return _redirect_with(redirect, "Invalid state parameter")

        client_id = settings.challonge_app_client_id
        client_secret = settings.challonge_app_client_secret
        redirect_uri = _redirect_uri(
            request, "/api/challonge/callback", settings.app_base_url or None
        )
        if not client_id or not client_secret:
            return _redirect_with(redirect, "Challonge OAuth misconfigured")

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            token_response = await client.post(
                CHALLONGE_TOKEN_URL,
                headers={"Content-Type": "application/json"},
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                },
            )
            if not token_response.is_success:
                log.error("Challonge Token Error: %s", token_response.text)
                return _redirect_with(redirect, "Failed to exchange token with Challonge")

            access_token = (token_response.json() or {}).get("access_token")
            if not access_token:
                return _redirect_with(redirect, "No access token received")

            user_response = await client.get(
                CHALLONGE_ME_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Authorization-Type": "v2",
                    "Content-Type": "application/vnd.api+json",
                    "Accept": "application/json",
                },
            )
            if not user_response.is_success:
                log.error("Challonge User Info Error: %s", user_response.text)
                return _redirect_with(redirect, "Failed to fetch user info from Challonge")
            user_payload = user_response.json() or {}

        user_object = user_payload.get("data") or {}
        challonge_id = str(user_object.get("id") or "")
        attributes = user_object.get("attributes") or {}
        username = attributes.get("username") or attributes.get("name") or "Unknown"
        avatar = (
            attributes.get("image_url")
            or attributes.get("avatar_url")
            or ((attributes.get("avatar") or {}).get("usage") or {}).get("url")
            or None
        )
        if not challonge_id:
            return _redirect_with(redirect, "Could not retrieve Challonge User ID")

        await db.execute(
            text(
                "INSERT INTO challonge_players (id, nickname, avatar) "
                "VALUES (:id, :nickname, :avatar) "
                "ON CONFLICT (id) DO UPDATE SET nickname = :nickname, "
                "avatar = :avatar, updated_at = :updated"
            ),
            {
                "id": challonge_id,
                "nickname": username,
                "avatar": avatar,
                "updated": datetime.now(timezone.utc).replace(tzinfo=None),
            },
        )

        existing = await _user_by(db, "challonge_id", challonge_id)
        current_user_id = session.get("userId")
        new_session_user: str | None = None

        if current_user_id:
            current = await _user_by(db, "id", current_user_id)
            if current is None:
                await db.commit()
                return Response("Current user not found", status_code=500)
            if existing is not None and existing.id != current_user_id:
                await db.commit()
                return _redirect_with(
                    redirect,
                    "This Challonge account is already linked to another user.",
                )
            # `photoURL: avatarUrl || sql`photo_url`` — keep the old picture
            # when the provider did not give one.
            await db.execute(
                text(
                    "UPDATE users SET challonge_id = :cid, challonge_username = :name, "
                    "photo_url = COALESCE(:avatar, photo_url) WHERE id = :id"
                ),
                {"cid": challonge_id, "name": username, "avatar": avatar,
                 "id": current_user_id},
            )
        elif existing is not None:
            new_session_user = existing.id
            await db.execute(
                text(
                    "UPDATE users SET challonge_username = :name, "
                    "photo_url = COALESCE(:avatar, photo_url) WHERE id = :id"
                ),
                {"name": username, "avatar": avatar, "id": existing.id},
            )
        else:
            new_session_user = await _create_oauth_user(
                db,
                email=f"{challonge_id}@challonge.local",
                display_name=username,
                avatar=avatar,
                extra={"challonge_id": challonge_id, "challonge_username": username},
                commit=False,
            )

        await db.commit()

        redirect = _to_profile()
        patch: dict[str, Any] = {"challonge_access_token": access_token}
        if new_session_user:
            patch["userId"] = new_session_user
        await patch_session(db, redirect, sid, patch, settings.session_secret)
        return redirect
    except Exception as exc:
        await db.rollback()
        log.error("Cb Error: %s", exc)
        return _redirect_with(redirect, "Internal Server Error during Challonge Auth")


# ----------------------------------------------------------------- shared ---


async def _update_user(db: AsyncSession, user_id: str, updates: dict) -> None:
    if not updates:
        return
    assignments = ", ".join(f"{column} = :{column}" for column in updates)
    await db.execute(
        text(f"UPDATE users SET {assignments} WHERE id = :id"),
        {**updates, "id": user_id},
    )
    await db.commit()


async def _create_oauth_user(
    db: AsyncSession,
    *,
    email: str,
    display_name: str,
    avatar: str | None,
    extra: dict,
    commit: bool = True,
) -> str:
    """A fresh account for someone who arrived through OAuth without one.

    Pre-verified — the provider already vouched for the address — with a random
    password nobody holds, so the only way in stays the OAuth flow.
    """
    columns = ["email", "password_hash", "display_name", "photo_url", "is_admin",
               "is_verified", "verification_token_expires_at", *extra]
    values = {
        "email": email,
        "password_hash": await _hash_random_password(),
        "display_name": display_name,
        "photo_url": avatar,
        "is_admin": False,
        "is_verified": True,
        "verification_token_expires_at": None,
        **extra,
    }
    placeholders = ", ".join(f":{c}" for c in columns)
    user_id = (
        await db.execute(
            text(
                f"INSERT INTO users ({', '.join(columns)}) "
                f"VALUES ({placeholders}) RETURNING id"
            ),
            values,
        )
    ).scalar()
    if commit:
        await db.commit()
    return user_id
