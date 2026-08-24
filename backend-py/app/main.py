import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.main_helpers import raw_path
from app.db import dispose_engine, get_engine
# Prima dei router: le chiavi del RAG si leggono con os.environ, e senza
# questo il .env resterebbe invisibile all'applicazione - come avverte il
# commento in config.py. In Docker non fa nulla: vincono le variabili del
# container.
from app.lib.rag.env import load_env

load_env()

from app.routers import (
    admin,
    me,
    oauth,
    aliases,
    auth_routes,
    analytics,
    chat,
    components,
    favorites,
    health,
    internal,
    og,
    players,
    seasons,
    stats,
    tournament_history,
    tournament_writes,
    tournaments,
)

from app import logging_setup

logging_setup.configure()
log = logging.getLogger("app")


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


@app.exception_handler(404)
@app.exception_handler(405)
async def not_found_handler(request: Request, _exc):
    """Answers unknown paths AND wrong methods the way Express does.

    Express has no notion of 405: a POST-only route reached with GET simply
    falls through to the catch-all, which returns this shape. FastAPI would
    reply 405 {"detail": "Method Not Allowed"} instead, so a client using the
    wrong method would get a different answer depending on which backend the
    proxy happened to route it to.
    """
    return JSONResponse(
        status_code=404, content={"error": "not_found", "path": raw_path(request)}
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    """Returns the Express error shape.

    FastAPI would wrap the detail as {"detail": ...}; the frontend expects the
    bare object Express sends, e.g. {"error": "Not authenticated"}.
    """
    # exc.headers va propagato: ricostruendo la risposta senza, ogni header
    # passato a una HTTPException sparisce in silenzio. Il caso che l'ha
    # rivelato e' Retry-After su un 429 - senza, un client riprova subito, che
    # e' esattamente il comportamento che il limite esiste per scoraggiare -
    # ma vale per qualunque header, WWW-Authenticate compreso.
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail,
                            headers=exc.headers)
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail},
                        headers=exc.headers)


app.include_router(health.router)
app.include_router(components.router)
app.include_router(chat.router)
app.include_router(seasons.router)
app.include_router(internal.router)
app.include_router(stats.router)
app.include_router(analytics.router)
app.include_router(players.router)
app.include_router(favorites.router)
app.include_router(aliases.router)
app.include_router(auth_routes.router)
app.include_router(og.router)
app.include_router(tournament_history.router)
app.include_router(tournaments.router)
app.include_router(tournament_writes.router)
app.include_router(admin.router)
app.include_router(me.router)
app.include_router(oauth.router)

# Must come after every include_router: it reads the finished route table.
from app import openapi_docs  # noqa: E402

openapi_docs.install(app)

# Outermost: it must see failures from every other layer.
app.add_middleware(logging_setup.RequestContextMiddleware)
