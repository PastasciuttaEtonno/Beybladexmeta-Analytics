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


def season_from_date_sql(column: str) -> str:
    """SQL deriving the season name from a date column, mirroring determine_season.

    `cm_match_results` has no `season` column — only `external_player_combos`
    does — so anything filtering ChallengerMode results by season has to compute
    it from `data_torneo`. Kept identical to the TypeScript seasonFromDateSql so
    both backends agree.
    """
    return f"""CASE
    WHEN {column} >= DATE '2025-10-01' AND {column} <= DATE '2026-01-31' THEN 'Off Season 2025'
    WHEN EXTRACT(YEAR FROM {column}) = 2026 AND EXTRACT(MONTH FROM {column}) >= 2 THEN 'Season 2026'
    WHEN EXTRACT(YEAR FROM {column}) = 2025 THEN 'Season 2025'
    ELSE 'Season ' || EXTRACT(YEAR FROM {column})::text
  END"""
