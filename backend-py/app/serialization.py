"""Helpers for producing byte-identical JSON to the Express backend.

Node and Python disagree about how a few database types reach JSON, and the
frontend was written against the Node answers, so the differences matter.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any


def js_datetime(value: datetime | date | None) -> str | None:
    """Format a timestamp the way `JSON.stringify(new Date(...))` does.

    Node emits ISO-8601 in UTC with exactly three fractional digits and a 'Z'
    suffix (`2026-01-14T13:25:19.053Z`), where Python's isoformat() would give
    six digits and '+00:00'.
    """
    if value is None:
        return None
    if not isinstance(value, datetime):
        # A bare DATE column: node-postgres stringifies it as YYYY-MM-DD.
        return value.isoformat()

    moment = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    moment = moment.astimezone(timezone.utc)
    milliseconds = moment.microsecond // 1000  # JS truncates, it does not round
    return f"{moment.strftime('%Y-%m-%dT%H:%M:%S')}.{milliseconds:03d}Z"


def pg_timestamptz(value: datetime | None) -> str | None:
    """Render a timestamptz the way Postgres prints it, e.g. `2026-01-14 13:25:19.053603+00`.

    Endpoints built on raw SQL (`db.execute`) get this form rather than an ISO
    date: node-postgres hands Drizzle the unparsed text for those queries, and it
    reaches the client untouched. Endpoints built with the query builder return a
    real Date instead — see js_datetime. Keeping both is what parity requires.
    """
    if value is None:
        return None

    moment = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    moment = moment.astimezone(timezone.utc)

    rendered = moment.strftime("%Y-%m-%d %H:%M:%S")
    if moment.microsecond:
        # Postgres drops trailing zeros from the fractional part.
        rendered += f".{moment.microsecond:06d}".rstrip("0")
    return rendered + "+00"


def big_number(value: Any) -> Any:
    """Render a bigint the way node-postgres does: as a string.

    COUNT(*) and SUM() over an integer column come back as bigint, which cannot
    always fit a JS number, so node-postgres refuses to guess and returns text.
    Drizzle only converts it where the query explicitly asks with mapWith(Number),
    so aggregated endpoints genuinely serve strings and the frontend parses them.
    """
    if value is None:
        return None
    return str(int(value))


def number(value: Any) -> Any:
    """Convert a database numeric into something json.dumps can emit.

    Postgres SUM() over a double precision column returns `numeric`, which
    asyncpg hands back as Decimal — not JSON-serialisable. Drizzle wraps the
    same values with `mapWith(Number)`, so a plain number is the faithful
    equivalent. Integral values become ints so the wire format matches Node's.
    """
    if value is None:
        return None
    if isinstance(value, Decimal):
        as_float = float(value)
        return int(as_float) if as_float.is_integer() else as_float
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value
