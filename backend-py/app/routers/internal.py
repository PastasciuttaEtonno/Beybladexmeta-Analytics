"""Diagnostics for the migration itself.

These live under /api/_py/ and are deliberately absent from
strangler-routes.json, so nginx never routes public traffic here — they are
reachable only on the service port, from inside the network.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/api/_py")


@router.get("/whoami")
async def whoami(
    user: Annotated[CurrentUser | None, Depends(get_current_user)],
) -> dict:
    """Who FastAPI thinks the caller is, given the Express session cookie.

    The two backends must agree on this for the whole migration, so it is worth
    being able to ask directly rather than inferring it from a 401 somewhere.
    """
    if user is None:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "id": user.id,
        "email": user.email,
        "displayName": user.display_name,
        "isAdmin": user.is_admin,
        "isVerified": user.is_verified,
    }
