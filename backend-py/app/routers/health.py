from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter()


@router.get("/api/health")
async def health(db: Annotated[AsyncSession, Depends(get_session)]) -> JSONResponse:
    """Mirrors the Express health check, including the 503 body the client's
    useServiceHealth hook keys off to show the ServiceUnavailable page."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "degraded", "db": "unavailable"})
    return JSONResponse(content={"status": "ok", "db": "ok"})
