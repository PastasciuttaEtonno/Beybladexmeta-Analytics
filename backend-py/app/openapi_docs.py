"""Repairs the generated OpenAPI document.

FastAPI derives its schema from handler signatures, and this application's
handlers deliberately have almost none: bodies are read with
`await request.json()` and validated by hand, and every handler returns a plain
dict. That was the right call for the migration — `response_model` filters
fields, and a Pydantic body parameter answers a malformed request with FastAPI's
422 instead of the message Express sends — but it left the document describing
nothing: no request bodies, no response schemas, and a 422 declared on 27
operations that cannot produce one.

Everything here runs AFTER the schema is generated and only edits that
dictionary. No decorator changes, no signature changes, so request handling is
untouched and the parity harnesses stay green. What it adds:

  * the real error shape, `{"error": "..."}`, as a reusable component;
  * 401 and 403 on exactly the routes that require a session or an admin,
    derived by walking each route's dependency tree rather than from a
    hand-kept list that would rot;
  * request bodies for the write routes, reusing the Pydantic models the
    handlers already validate against;
  * removal of the unreachable 422.

Note the document is not published in production — nginx returns 404 for
/api/_py/ — so this serves whoever is reading or generating a client locally.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

ERROR_REF = {"$ref": "#/components/schemas/Error"}

DESCRIPTION = """\
The Beybladexmeta backend, ported from the original Express application.

**Errors** are always `{"error": "<message>"}` with an appropriate status. There
is no other error envelope; a 422 never occurs, because request bodies are
validated by hand so that the messages match the Express implementation exactly.

**Authentication** is the `connect.sid` cookie written by `express-session`,
shared with the legacy backend — a session minted by either is accepted by both.
"""


def _flatten_routes(routes: Any, seen: set[int] | None = None) -> list[Any]:
    """Every actual route, unwrapping included routers.

    `app.routes` does not hold the routes of an included router directly in this
    FastAPI version: it holds a wrapper, and the real ones live one or two hops
    inside. Walking only the top level silently finds no guards at all, which is
    exactly the sort of failure that produces a confidently wrong document.
    """
    seen = seen if seen is not None else set()
    found: list[Any] = []
    for route in routes or []:
        if id(route) in seen:
            continue
        seen.add(id(route))

        if getattr(route, "dependant", None) is not None and hasattr(route, "path"):
            found.append(route)
            continue

        nested = getattr(route, "routes", None)
        if nested is None:
            inner = getattr(route, "original_router", None)
            nested = getattr(inner, "routes", None) if inner is not None else None
        if nested:
            found.extend(_flatten_routes(nested, seen))
    return found


def _dependency_names(dependant: Any, seen: set[int] | None = None) -> set[str]:
    """Every dependency callable reachable from a route, by name."""
    seen = seen if seen is not None else set()
    if id(dependant) in seen:
        return set()
    seen.add(id(dependant))

    names: set[str] = set()
    call = getattr(dependant, "call", None)
    if call is not None and hasattr(call, "__name__"):
        names.add(call.__name__)
    for sub in getattr(dependant, "dependencies", []) or []:
        names |= _dependency_names(sub, seen)
    return names


def _auth_responses(names: set[str]) -> dict[str, dict]:
    """401/403 follow from the guards, so they are read off the route itself."""
    if "require_admin" in names:
        return {
            "401": {"description": "No valid session"},
            "403": {"description": "Signed in, but not an admin"},
        }
    if "require_user" in names:
        return {"401": {"description": "No valid session"}}
    return {}


def _model_schema(model: Any, components: dict[str, Any]) -> dict[str, Any]:
    """A model's JSON schema, with any nested definitions hoisted into
    components so the document stays self-referential."""
    schema = model.model_json_schema(ref_template="#/components/schemas/{model}")
    for name, definition in (schema.pop("$defs", None) or {}).items():
        components.setdefault(name, definition)
    return schema


def _combo_array(ref: dict, *, minimum: int, maximum: int) -> dict:
    return {"type": "array", "items": ref, "minItems": minimum, "maxItems": maximum}


def _request_bodies(components: dict[str, Any]) -> dict[tuple[str, str], dict]:
    """Body schema per write route, keyed by (method, path template)."""
    from app.routers import auth_routes, favorites, tournament_writes

    for model, name in (
        (auth_routes.RegisterInput, "RegisterInput"),
        (auth_routes.LoginInput, "LoginInput"),
        (auth_routes.ProfileInput, "ProfileInput"),
        (favorites.ComboInput, "FavoriteCombo"),
        (favorites.DeckInput, "FavoriteDeck"),
        (tournament_writes.ComboInput, "TournamentCombo"),
    ):
        components.setdefault(name, _model_schema(model, components))

    ref = lambda name: {"$ref": f"#/components/schemas/{name}"}  # noqa: E731
    combo = ref("TournamentCombo")

    string = {"type": "string"}
    return {
        ("post", "/api/auth/register"): ref("RegisterInput"),
        ("post", "/api/auth/login"): ref("LoginInput"),
        ("patch", "/api/auth/profile"): ref("ProfileInput"),
        ("post", "/api/favorites/combos"): ref("FavoriteCombo"),
        ("post", "/api/favorites/decks"): ref("FavoriteDeck"),
        ("post", "/api/user/aliases"): {
            "type": "object",
            "required": ["alias"],
            "properties": {"alias": string},
        },
        ("post", "/api/user/link-challonge"): {
            "type": "object",
            "properties": {"username": string},
        },
        ("post", "/api/user/link-challengermode"): {
            "type": "object",
            "properties": {"cmId": string},
        },
        ("post", "/api/tournaments/claim"): {
            "type": "object",
            "required": ["tournamentId", "combos"],
            "properties": {
                "tournamentId": string,
                "combos": _combo_array(combo, minimum=3, maximum=3),
                "rank": {"type": "integer"},
                "platform": {"type": "string", "default": "challengermode"},
            },
        },
        ("post", "/api/tournaments/{tournament_id}/claim"): {
            "type": "object",
            "properties": {"combos": _combo_array(combo, minimum=0, maximum=3)},
            "description": "Challonge only. Beyond the third, combos are ignored.",
        },
        ("put", "/api/tournaments/{tournament_id}/combos/{combo_number}"): combo,
        ("put", "/api/tournaments/{tournament_id}/players/{player_id}/combos"): {
            "type": "object",
            "required": ["combos"],
            "properties": {
                "combos": _combo_array(combo, minimum=1, maximum=3),
                "platform": {
                    "type": "string",
                    "enum": ["challengermode", "challonge"],
                    "default": "challengermode",
                },
            },
        },
        ("post", "/api/admin/tournament-results/external"): {
            "type": "object",
            "required": [
                "nomeTorneo", "dataTorneo", "participants", "regione", "tournamentId",
                "firstPlacePlayerId", "secondPlacePlayerId", "thirdPlacePlayerId",
            ],
            "properties": {
                "nomeTorneo": {"type": "string", "minLength": 1, "maxLength": 100},
                "dataTorneo": {"type": "string", "format": "date"},
                "descrizione": {"type": "string", "maxLength": 500},
                "participants": {"type": "integer", "minimum": 6, "maximum": 200},
                "regione": {"type": "string", "description": "An Italian region."},
                "tournamentId": {"type": "string", "maxLength": 64},
                "firstPlacePlayerId": string,
                "secondPlacePlayerId": string,
                "thirdPlacePlayerId": string,
                "fourthPlacePlayerId": string,
            },
            "description": (
                "Each named player must already have exactly three rows in "
                "external_player_combos for this tournament."
            ),
        },
        ("post", "/api/admin/import-tournament"): {
            "type": "object",
            "required": [
                "id", "tournament_name", "start_date", "total_players", "standings",
            ],
            "properties": {
                "id": string,
                "tournament_name": string,
                "start_date": string,
                "total_players": {"type": "integer"},
                "standings": {"type": "array", "items": {"type": "object"}},
            },
            "description": "A scraped Challonge payload, stored verbatim.",
        },
    }


def install(app: FastAPI) -> Callable[[], dict[str, Any]]:
    """Replace app.openapi with a version that post-processes the schema."""

    def custom_openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=DESCRIPTION,
            routes=app.routes,
        )

        components = schema.setdefault("components", {}).setdefault("schemas", {})
        components["Error"] = {
            "type": "object",
            "title": "Error",
            "required": ["error"],
            "properties": {"error": {"type": "string"}},
        }
        # Generated for a validation error that this application never raises.
        for dead in ("HTTPValidationError", "ValidationError"):
            components.pop(dead, None)

        guards: dict[tuple[str, str], set[str]] = {}
        for route in _flatten_routes(app.routes):
            dependant = getattr(route, "dependant", None)
            path = getattr(route, "path", None)
            if dependant is None or path is None:
                continue
            for method in getattr(route, "methods", set()) or set():
                guards[(method.lower(), path)] = _dependency_names(dependant)

        bodies = _request_bodies(components)
        error_content = {"application/json": {"schema": ERROR_REF}}

        for path, operations in schema.get("paths", {}).items():
            for method, operation in operations.items():
                responses = operation.setdefault("responses", {})
                responses.pop("422", None)

                for code, description in _auth_responses(
                    guards.get((method, path), set())
                ).items():
                    responses.setdefault(code, {**description, "content": error_content})

                responses.setdefault(
                    "default",
                    {"description": "Request failed", "content": error_content},
                )

                body = bodies.get((method, path))
                if body is not None and "requestBody" not in operation:
                    operation["requestBody"] = {
                        "required": True,
                        "content": {"application/json": {"schema": body}},
                    }

        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]
    return custom_openapi
