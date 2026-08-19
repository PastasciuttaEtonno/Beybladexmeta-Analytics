"""Season boundaries, ported from backend/src/lib/seasons.ts."""

from datetime import date, datetime, timezone

_OFF_SEASON_START = datetime(2025, 10, 1, 0, 0, 0, tzinfo=timezone.utc)
_OFF_SEASON_END = datetime(2026, 1, 31, 23, 59, 59, tzinfo=timezone.utc)


def determine_season(value: datetime | date) -> str:
    """Name the season a tournament date falls in.

    Naive timestamps are read as UTC, matching the getUTC* calls the TypeScript
    version uses.
    """
    if not isinstance(value, datetime):
        moment = datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    else:
        moment = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
        moment = moment.astimezone(timezone.utc)

    if _OFF_SEASON_START <= moment <= _OFF_SEASON_END:
        return "Off Season 2025"

    year, month = moment.year, moment.month
    if year == 2026 and month >= 2:
        return "Season 2026"
    if year == 2025:
        return "Season 2025"
    return f"Season {year}"
