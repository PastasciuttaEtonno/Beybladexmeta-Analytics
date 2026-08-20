"""Registration, login, verification and profile.

Ported from backend/src/routes/auth.ts. Logging in here produces a session
Express accepts, and vice versa — see app/lib/sessions.py.
"""

import html
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from urllib.parse import quote

import bcrypt
import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SESSION_COOKIE_NAME, CurrentUser, require_user, unsign
from app.config import Settings, get_settings
from app.db import get_session
from app.lib import rate_limit
from app.lib.sessions import end_session, start_session
from app.serialization import js_datetime

router = APIRouter()
log = logging.getLogger(__name__)

BCRYPT_ROUNDS = 10
VERIFICATION_TTL = timedelta(hours=1)

# The shape /api/auth/me and friends return: the full user row minus the secret.
_USER_COLUMNS = (
    'id, email, display_name AS "displayName", photo_url AS "photoURL", '
    'is_admin AS "isAdmin", is_verified, verification_token, '
    'verification_token_expires_at, challenger_id AS "challengerId", '
    'challengermode_username AS "challengermodeUsername", '
    'challonge_id AS "challongeId", challonge_username AS "challongeUsername"'
)


def _user_payload(row: Any) -> dict:
    data = dict(row._mapping)
    data["verification_token_expires_at"] = js_datetime(data["verification_token_expires_at"])
    return data


async def _fetch_user(db: AsyncSession, where: str, args: dict) -> Any:
    return (
        await db.execute(text(f"SELECT {_USER_COLUMNS} FROM users WHERE {where} LIMIT 1"), args)
    ).first()


def _client_ip(request: Request) -> str:
    # Matches getClientIp: the socket address, not a forwarded header.
    return request.client.host if request.client else "unknown"


class LoginInput(BaseModel):
    email: EmailStr = Field(max_length=320)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _normalise_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def _trim(cls, value: str) -> str:
        return value.strip()


class RegisterInput(LoginInput):
    displayName: str = Field(min_length=1, max_length=100)
    captchaToken: str

    @field_validator("password")
    @classmethod
    def _complexity(cls, value: str) -> str:
        value = value.strip()
        if not re.search(r"[a-z]", value):
            raise ValueError("Include at least one lowercase letter")
        return value


async def _verify_captcha(settings: Settings, token: str, ip: str) -> bool:
    """Falls back to the classic siteverify endpoint, as the Express code does
    when the Enterprise client is not configured."""
    secret = settings.recaptcha_secret_key
    if not secret:
        return False

    url = (
        "https://www.google.com/recaptcha/api/siteverify"
        f"?secret={quote(secret)}&response={quote(token)}&remoteip={quote(ip)}"
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            payload = (await client.post(url)).json()
    except Exception as exc:
        log.error("reCAPTCHA verification failed: %s", exc)
        return False

    if not payload.get("success"):
        return False
    score = payload.get("score")
    return not (isinstance(score, (int, float)) and score < 0.5)


@router.post("/api/auth/register")
async def register(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        data = RegisterInput.model_validate(await request.json())
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid request"})

    if not settings.recaptcha_secret_key:
        return JSONResponse(
            status_code=500,
            content={"error": "Server misconfiguration: missing reCAPTCHA secret"},
        )

    if not await _verify_captcha(settings, data.captchaToken, _client_ip(request)):
        return JSONResponse(status_code=400, content={"error": "Verifica anti-bot fallita."})

    try:
        if await _fetch_user(db, "email = :email", {"email": data.email}) is not None:
            return JSONResponse(status_code=409, content={"error": "User already exists"})

        hashed = bcrypt.hashpw(
            data.password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        ).decode()
        token = secrets.token_hex(32)
        expires = datetime.now(timezone.utc) + VERIFICATION_TTL

        row = (
            await db.execute(
                text(
                    "INSERT INTO users (email, password_hash, display_name, photo_url, "
                    "is_verified, verification_token, verification_token_expires_at) "
                    "VALUES (:email, :hash, :name, NULL, false, :token, :expires) "
                    f"RETURNING {_USER_COLUMNS}"
                ),
                {
                    "email": data.email, "hash": hashed, "name": data.displayName,
                    "token": token, "expires": expires,
                },
            )
        ).first()
        await db.commit()

        await _send_verification_email(settings, data.email, data.displayName, token)

        return JSONResponse(
            status_code=201,
            content={
                "user": _user_payload(row),
                "message": "Registrazione completata. Controlla la tua email "
                "per verificare il tuo account.",
            },
        )
    except Exception as exc:
        await db.rollback()
        log.error("Registration failed: %s", exc)
        return JSONResponse(status_code=400, content={"error": "Invalid request"})


async def _send_verification_email(
    settings: Settings, email: str, display_name: str, token: str
) -> None:
    """Best effort: a mail failure must not undo a completed registration."""
    if not settings.resend_api_key:
        log.warning("RESEND_API_KEY non configurata: email di verifica non inviata")
        return

    base = settings.app_base_url or f"http://localhost:{settings.port}"
    verify_url = f"{base}/api/auth/verify?token={token}"
    safe_name = html.escape(display_name or "", quote=True).replace("'", "&#39;")

    body = (
        f"<p>Ciao {safe_name},</p>"
        "<p>Per completare la registrazione, verifica la tua email cliccando il link seguente:</p>"
        f'<p><a href="{verify_url}">Verifica il tuo account</a></p>'
        "<p>Se non hai richiesto questa registrazione, ignora questa email.</p>"
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": "no-reply@v2.beybladexmeta.com",
                    "to": email,
                    "subject": "Verifica il tuo account",
                    "html": body,
                },
            )
        if response.status_code >= 400:
            log.error("Invio email di verifica fallito: %s", response.text[:300])
    except Exception as exc:
        log.error("Invio email di verifica fallito: %s", exc)


@router.post("/api/auth/login")
async def login(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    ip = _client_ip(request)
    try:
        data = LoginInput.model_validate(await request.json())
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid request"})

    try:
        blocked = await rate_limit.is_blocked(db, ip, data.email)
        if blocked.blocked:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too many login attempts",
                    "retryAfter": blocked.remaining_time,
                    "message": "Too many failed login attempts. Please try again in "
                    f"{blocked.remaining_time} seconds.",
                },
            )

        row = (
            await db.execute(
                text(f"SELECT {_USER_COLUMNS}, password_hash FROM users WHERE email = :email LIMIT 1"),
                {"email": data.email},
            )
        ).first()

        if row is None:
            await rate_limit.record_failed_attempt(db, ip, data.email)
            return JSONResponse(status_code=401, content={"error": "Invalid credentials"})

        if not row.is_verified:
            return JSONResponse(
                status_code=403,
                content={"error": "Email non verificata. Controlla la tua casella di posta."},
            )

        if not bcrypt.checkpw(data.password.encode("utf-8"), row.password_hash.encode("utf-8")):
            await rate_limit.record_failed_attempt(db, ip, data.email)
            return JSONResponse(status_code=401, content={"error": "Invalid credentials"})

        await rate_limit.record_successful_login(db, ip, data.email)

        payload = _user_payload(row)
        payload.pop("password_hash", None)

        result = JSONResponse(content={"user": payload})
        await start_session(db, result, row.id, settings.session_secret)
        return result
    except Exception as exc:
        await db.rollback()
        log.error("Login failed: %s", exc)
        return JSONResponse(status_code=400, content={"error": "Invalid request"})


@router.get("/api/auth/verify")
async def verify(request: Request, db: Annotated[AsyncSession, Depends(get_session)]):
    token = (request.query_params.get("token") or "").strip()
    if not token:
        return PlainTextResponse("Token di verifica mancante", status_code=400)

    try:
        row = (
            await db.execute(
                text(
                    "SELECT id, verification_token_expires_at FROM users "
                    "WHERE verification_token = :token LIMIT 1"
                ),
                {"token": token},
            )
        ).first()

        if row is None:
            return PlainTextResponse("Token di verifica non valido", status_code=400)

        expires = row.verification_token_expires_at
        if expires is not None:
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                return PlainTextResponse("Token di verifica scaduto", status_code=400)

        await db.execute(
            text(
                "UPDATE users SET is_verified = true, verification_token = NULL, "
                "verification_token_expires_at = NULL WHERE id = :id"
            ),
            {"id": row.id},
        )
        await db.commit()

        # 302, as Express's res.redirect defaults to.
        return RedirectResponse("/login?verified=true", status_code=302)
    except Exception as exc:
        await db.rollback()
        log.error("Verification failed: %s", exc)
        return PlainTextResponse("Errore durante la verifica", status_code=500)


@router.post("/api/auth/logout")
async def logout(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    sid = unsign(cookie, settings.session_secret) if cookie else None

    result = JSONResponse(content={"success": True})
    try:
        await end_session(db, result, sid)
    except Exception as exc:
        log.error("Logout failed: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to logout"})
    return result


@router.get("/api/auth/me")
async def me(
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        row = await _fetch_user(db, "id = :id", {"id": user.id})
        if row is None:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        return {"user": _user_payload(row)}
    except Exception as exc:
        log.error("Failed to get user: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to get user"})


class ProfileInput(BaseModel):
    displayName: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("displayName")
    @classmethod
    def _collapse_whitespace(cls, value: str | None) -> str | None:
        return re.sub(r"\s+", " ", value).strip() if value is not None else None


@router.patch("/api/auth/profile")
async def update_profile(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        updates = ProfileInput.model_validate(await request.json())
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid request"})

    try:
        if updates.displayName is not None:
            row = (
                await db.execute(
                    text(
                        "UPDATE users SET display_name = :name WHERE id = :id "
                        f"RETURNING {_USER_COLUMNS}"
                    ),
                    {"name": updates.displayName, "id": user.id},
                )
            ).first()
            await db.commit()
        else:
            row = await _fetch_user(db, "id = :id", {"id": user.id})

        if row is None:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        return {"user": _user_payload(row)}
    except Exception as exc:
        await db.rollback()
        log.error("Profile update failed: %s", exc)
        return JSONResponse(status_code=400, content={"error": "Invalid request"})


@router.post("/api/user/link-challonge")
async def link_challonge(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        body = await request.json()
        username = str((body or {}).get("username") or "")
        if not username:
            raise ValueError("Failed to link Challonge account")
    except Exception as exc:
        return JSONResponse(
            status_code=400, content={"error": str(exc) or "Failed to link Challonge account"}
        )

    try:
        row = (
            await db.execute(
                text(
                    "UPDATE users SET challonge_username = :username WHERE id = :id "
                    f"RETURNING {_USER_COLUMNS}"
                ),
                {"username": username, "id": user.id},
            )
        ).first()
        await db.commit()
        return {
            "user": _user_payload(row),
            "message": "Account Challonge collegato con successo",
        }
    except Exception as exc:
        await db.rollback()
        return JSONResponse(status_code=400, content={"error": str(exc)})


@router.post("/api/user/link-challengermode")
async def link_challengermode(
    request: Request,
    user: Annotated[CurrentUser, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
):
    try:
        body = await request.json()
        cm_id = str((body or {}).get("cmId") or "")
        cm_username = str((body or {}).get("cmUsername") or "")
        if not cm_id or not cm_username:
            raise ValueError("Failed to link Challengermode account")
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content={"error": str(exc) or "Failed to link Challengermode account"},
        )

    try:
        # One ChallengerMode profile belongs to one account: otherwise two people
        # could both claim the same tournament results.
        taken = (
            await db.execute(
                text("SELECT id FROM users WHERE challenger_id = :cm LIMIT 1"), {"cm": cm_id}
            )
        ).first()
        if taken is not None and taken.id != user.id:
            return JSONResponse(
                status_code=409,
                content={
                    "error": "Questo account Challengermode è già collegato a un altro utente"
                },
            )

        row = (
            await db.execute(
                text(
                    "UPDATE users SET challenger_id = :cm, challengermode_username = :name "
                    f"WHERE id = :id RETURNING {_USER_COLUMNS}"
                ),
                {"cm": cm_id, "name": cm_username, "id": user.id},
            )
        ).first()
        await db.commit()
        return {
            "user": _user_payload(row),
            "message": "Account Challengermode collegato con successo",
        }
    except Exception as exc:
        await db.rollback()
        return JSONResponse(status_code=400, content={"error": str(exc)})
