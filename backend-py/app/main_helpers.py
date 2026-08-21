"""Small helpers shared by the app and its routers.

Kept out of main.py so routers can import them without a circular import.
"""

from fastapi import Request


def raw_path(request: Request) -> str:
    """The path as it arrived, still percent-encoded.

    Express reports `req.originalUrl` in its 404 body, which keeps the encoding.
    Starlette decodes `url.path`, so a combo key like `A%7CB` would come back as
    `A|B` and the two backends would disagree on the error they return.
    """
    raw = request.scope.get("raw_path")
    if raw:
        return raw.decode("latin-1").split("?", 1)[0]
    return request.url.path
