"""Regional player standings, ported from backend/src/lib/regionalScoring.ts.

Rebuilds `player_regional_stats` from scratch: ChallengerMode results are read
out of the cached tournament details in `external_api_cache` (joined to
`tournaments_view` for the region), Challonge results out of the raw payloads in
`challonge_match_results`.

Two things about the original are preserved rather than corrected, because both
backends have to agree:

* `season_for_date` here is NOT `determine_season`. It only ever returns
  "Off Season 2025" or "Season 2026", and its boundary is 2026-02-01 exclusive.
  That makes three different season definitions in the codebase.
* `recalculate_for_tournament` ignores the tournament it is given and rebuilds
  everything, which is what the TypeScript does.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

_OFF_SEASON_START = datetime(2025, 10, 1, tzinfo=timezone.utc)
_OFF_SEASON_END = datetime(2026, 2, 1, tzinfo=timezone.utc)

# ChallengerMode awards a flat amount per placement, regardless of field size.
_CM_BANDS = [(1, 100), (2, 80), (3, 65), (4, 55), (8, 40), (16, 25), (32, 10), (64, 5)]
_CM_TAIL = 2

# Challonge scales with the size of the bracket.
_CHALLONGE_TABLES: list[tuple[int, list[tuple[int, int]]]] = [
    (49, [(1, 400), (2, 280), (3, 160), (4, 120), (8, 90), (12, 65), (16, 50), (24, 40), (32, 30), (48, 15), (10**9, 10)]),
    (33, [(1, 350), (2, 240), (3, 140), (4, 110), (8, 80), (12, 55), (16, 40), (24, 30), (32, 15), (10**9, 10)]),
    (25, [(1, 300), (2, 200), (3, 120), (4, 90), (8, 70), (12, 45), (16, 30), (24, 15), (10**9, 10)]),
    (17, [(1, 250), (2, 160), (3, 100), (4, 80), (8, 60), (12, 30), (16, 15), (10**9, 10)]),
    (13, [(1, 200), (2, 120), (3, 80), (4, 60), (8, 30), (12, 15), (10**9, 10)]),
    (8, [(1, 150), (2, 80), (3, 60), (4, 40), (8, 20), (10**9, 10)]),
    (6, [(1, 100), (2, 70), (3, 50), (4, 30), (10**9, 10)]),
]

_UNPLACED = 999999


def season_for_date(value: Any) -> str:
    """Season label used by the regional standings only. Defaults to Off Season."""
    if not value:
        return "Off Season 2025"

    if isinstance(value, datetime):
        moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    else:
        try:
            moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return "Off Season 2025"
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)

    moment = moment.astimezone(timezone.utc)
    if _OFF_SEASON_START <= moment < _OFF_SEASON_END:
        return "Off Season 2025"
    return "Season 2026"


def cm_points(placement: int) -> int:
    for limit, points in _CM_BANDS:
        if placement <= limit:
            return points
    return _CM_TAIL if placement >= 65 else 0


def challonge_points(placement: int, participants: int) -> int:
    for minimum, table in _CHALLONGE_TABLES:
        if participants >= minimum:
            for max_rank, points in table:
                if placement <= max_rank:
                    return points
            return 0
    return 0


@dataclass
class _Aggregate:
    player_id: str
    player_name: str
    region: str
    season: str
    platform: str
    points: int = 0
    tournaments_played: int = 0
    wins: int = 0
    top4: int = 0


def _parse_placement(display: Any) -> int:
    if not display:
        return _UNPLACED
    text_value = str(display)
    if text_value.isdigit():
        return int(text_value)
    match = re.search(r"(\d+)", text_value)
    return int(match.group(1)) if match else _UNPLACED


async def recalculate_all(db: AsyncSession) -> dict[str, int]:
    """Wipe and rebuild every regional standing."""
    await db.execute(text("DELETE FROM player_regional_stats"))

    totals: dict[tuple[str, str, str, str], _Aggregate] = {}

    def record(
        player_id: str, name: str, region: str, season: str, platform: str,
        points: int, placement: int,
    ) -> None:
        key = (player_id, region, season, platform)
        entry = totals.get(key)
        if entry is None:
            entry = _Aggregate(player_id, name, region, season, platform)
            totals[key] = entry
        entry.tournaments_played += 1
        entry.points += points
        if placement == 1:
            entry.wins += 1
        if placement <= 4:
            entry.top4 += 1

    # --- ChallengerMode, from the cached tournament details ---
    cm_rows = await db.execute(
        text(
            "SELECT c.data, tv.region FROM external_api_cache c "
            "JOIN tournaments_view tv ON tv.id = substring(c.cache_key from 'cm:tournamentDetail:(.*)') "
            "WHERE c.cache_key LIKE 'cm:tournamentDetail:%' AND tv.region IS NOT NULL"
        )
    )

    for row in cm_rows:
        data = row.data or {}
        region = str(row.region)
        season = season_for_date((data.get("schedule") or {}).get("startedAt"))

        # One entry per player per tournament, even if they appear twice.
        seen: set[str] = set()
        lineups = ((data.get("attendance") or {}).get("signups") or {}).get("lineups") or []

        for lineup in lineups:
            placement = _parse_placement((lineup.get("placement") or {}).get("displayPlacement"))
            for member in lineup.get("members") or []:
                user = member.get("user") or {}
                player_id = user.get("userId")
                if not player_id or player_id in seen:
                    continue
                seen.add(player_id)
                record(
                    player_id, user.get("username") or "Unknown", region, season,
                    "challengermode", cm_points(placement), placement,
                )

    # --- Challonge, from the raw imported payloads ---
    challonge_rows = await db.execute(
        text("SELECT c.data, c.fetched_at FROM challonge_match_results c")
    )

    for row in challonge_rows:
        data = row.data or {}
        season = season_for_date(
            data.get("start_date") or data.get("started_at") or row.fetched_at
        )
        standings = data.get("standings") or []
        participants = (
            data.get("participants_count") or data.get("total_players") or len(standings) or 0
        )

        seen = set()
        for entry in standings:
            try:
                rank = int(str(entry.get("rank")))
            except (TypeError, ValueError):
                rank = _UNPLACED

            participant = entry.get("participant") or entry
            player_id = str(participant.get("id"))
            name = (
                participant.get("name")
                or participant.get("username")
                or participant.get("display_name")
                or "Unknown"
            )
            if not player_id or player_id in seen:
                continue
            seen.add(player_id)
            record(
                player_id, name, "Global", season, "challonge",
                challonge_points(rank, participants), rank,
            )

    for entry in totals.values():
        await db.execute(
            text(
                "INSERT INTO player_regional_stats "
                "(player_id, player_name, region, season, platform, points, "
                "tournaments_played, wins, top4, updated_at) "
                "VALUES (:player_id, :player_name, :region, :season, :platform, :points, "
                ":tournaments_played, :wins, :top4, now()) "
                "ON CONFLICT (player_id, region, season, platform) DO UPDATE SET "
                "points = EXCLUDED.points, tournaments_played = EXCLUDED.tournaments_played, "
                "wins = EXCLUDED.wins, top4 = EXCLUDED.top4, "
                "player_name = EXCLUDED.player_name, updated_at = now()"
            ),
            {
                "player_id": entry.player_id,
                "player_name": entry.player_name,
                "region": entry.region,
                "season": entry.season,
                "platform": entry.platform,
                "points": entry.points,
                "tournaments_played": entry.tournaments_played,
                "wins": entry.wins,
                "top4": entry.top4,
            },
        )

    await db.commit()
    return {"inserted": len(totals)}


async def recalculate_for_tournament(db: AsyncSession, tournament_id: str) -> dict[str, int]:
    """Rebuilds EVERYTHING, ignoring the tournament id — as the original does."""
    return await recalculate_all(db)
