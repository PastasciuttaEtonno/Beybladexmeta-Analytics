"""Makes a failure say where it happened.

The handlers in this application follow the Express original's habit of
catching broadly and logging the exception's message:

    except Exception as exc:
        log.error("Something failed: %s", exc)

There are ninety-three of those and not one carried a traceback, so a
production failure arrived as a single line with no stack and no request
context. That is how the OAuth token exchange stayed a mystery: the log said
"Missing access token", which was true and three steps downstream of the 307
that actually caused it.

Rewriting ninety-three call sites would be churn. Instead the traceback is
attached at the logging layer, which reaches all of them at once, and nothing
about how requests are handled changes — this module only affects what gets
written to stdout.
"""

from __future__ import annotations

import logging
import sys
import time
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

FORMAT = "%(asctime)s %(levelname)-7s [%(name)s] %(message)s"

# Set per request so a line can be tied back to the call that produced it.
request_id: ContextVar[str] = ContextVar("request_id", default="-")


class AttachTraceback(logging.Filter):
    """Give an ERROR record the exception being handled, if it has none.

    `log.error("...: %s", exc)` inside an `except` block reaches here while
    that exception is still current, so the stack can be recovered without the
    call site asking for it. A record that already carries exc_info — from
    log.exception() — is left alone.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno >= logging.ERROR and not record.exc_info:
            current = sys.exc_info()
            if current[0] is not None:
                record.exc_info = current
        return True


class AddRequestId(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.name = f"{record.name} {request_id.get()}"
        return True


class RequestContextMiddleware:
    """Tags each request, and reports the ones that fail or crawl.

    Written as raw ASGI rather than BaseHTTPMiddleware: that wrapper buffers
    responses, which would interfere with the streamed OG images.
    """

    def __init__(self, app: ASGIApp, slow_seconds: float = 5.0) -> None:
        self.app = app
        self.slow_seconds = slow_seconds
        self.log = logging.getLogger("request")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        token = request_id.set(uuid.uuid4().hex[:8])
        started = time.perf_counter()
        status = 500

        async def capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, capture)
        except Exception:
            # Anything that escapes a handler. Logged with its stack here and
            # re-raised untouched, so the response the client gets is whatever
            # it was before this middleware existed.
            self.log.exception(
                "unhandled error on %s %s",
                scope.get("method", "?"),
                scope.get("path", "?"),
            )
            raise
        else:
            elapsed = time.perf_counter() - started
            if status >= 500:
                self.log.error(
                    "%s %s -> %s in %.2fs",
                    scope.get("method", "?"), scope.get("path", "?"), status, elapsed,
                )
            elif elapsed >= self.slow_seconds:
                self.log.warning(
                    "slow: %s %s -> %s in %.2fs",
                    scope.get("method", "?"), scope.get("path", "?"), status, elapsed,
                )
        finally:
            request_id.reset(token)


def configure(level: int = logging.INFO) -> None:
    """Install the format and the filters. Safe to call once, at import."""
    logging.basicConfig(level=level, format=FORMAT, force=True)

    traceback_filter = AttachTraceback()
    request_filter = AddRequestId()
    for handler in logging.getLogger().handlers:
        handler.addFilter(traceback_filter)
        handler.addFilter(request_filter)

    # uvicorn installs its own handlers; without this its records bypass the
    # root handlers and lose both filters.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True
