import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import dispose_engine, get_engine
from app.routers import (
    aliases,
    analytics,
    components,
    favorites,
    health,
    internal,
    players,
    seasons,
    stats,
    tournament_history,
    tournaments,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [fastapi] %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    get_engine()
    log.info("started")
    yield
    await dispose_engine()


app = FastAPI(
    title="Beybladexmeta API (FastAPI)",
    description=(
        "Takes over routes from the Express backend one group at a time. "
        "Anything not listed here is still served by Express — see "
        "strangler-routes.json for the routing table."
    ),
    lifespan=lifespan,
    # No docs in production; this service sits behind the same public origin.
    docs_url="/api/_py/docs",
    openapi_url="/api/_py/openapi.json",
)

settings = get_settings()
if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def tag_responses(request: Request, call_next):
    """Marks which backend answered.

    With two services behind one proxy, this is the difference between guessing
    and knowing when a route misbehaves after being switched over.
    """
    response = await call_next(request)
    response.headers["X-Served-By"] = "fastapi"
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    """Returns the Express error shape.

    FastAPI would wrap the detail as {"detail": ...}; the frontend expects the
    bare object Express sends, e.g. {"error": "Not authenticated"}.
    """
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


app.include_router(health.router)
app.include_router(components.router)
app.include_router(seasons.router)
app.include_router(internal.router)
app.include_router(stats.router)
app.include_router(analytics.router)
app.include_router(players.router)
app.include_router(favorites.router)
app.include_router(aliases.router)
app.include_router(tournament_history.router)
app.include_router(tournaments.router)
