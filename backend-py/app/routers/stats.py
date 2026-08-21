"""Combo and component statistics.

Ported from backend/src/routes/stats.ts. The SQL keeps grouping, ordering and
pagination server-side so results match the Express implementation row for row.
"""

import logging
import math
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.serialization import big_number, js_datetime, number, pg_timestamptz

router = APIRouter()
log = logging.getLogger(__name__)

_ALL_TIME = {"all", "all time", "all-time"}
_SORT_FIELDS = {
    "score": "punteggio_totale",
    "first": "primi_posti",
    "second": "secondi_posti",
    "third": "terzi_posti",
    "fourth": "quarti_posti",
}


def _is_all_time(season: str) -> bool:
    return season.lower() in _ALL_TIME


def _clamp(raw: str | None, default: int, low: int, high: int) -> int:
    """Mirror `parseInt` + Math.max/min, including its tolerance for junk."""
    if raw is None or raw == "":
        return default
    match = re.match(r"^\s*[-+]?\d+", raw)
    if not match:
        return default  # parseInt -> NaN -> Number.isFinite(NaN) is false
    return max(low, min(int(match.group()), high))


@router.get("/api/stats/combos")
async def combos(request: Request, db: Annotated[AsyncSession, Depends(get_session)]):
    params = request.query_params
    page = _clamp(params.get("page"), 1, 1, 2**31)
    limit = _clamp(params.get("limit"), 20, 1, 100)
    offset = (page - 1) * limit

    search = (params.get("search") or "").strip()
    sort_by = params.get("sortBy") or "score"
    if sort_by not in _SORT_FIELDS:
        sort_by = "score"
    direction = "ASC" if params.get("sortOrder") == "asc" else "DESC"
    season = (params.get("season") or "").strip()

    try:
        if _is_all_time(season) or not season:
            where, args = "", {}
            if search:
                where = (
                    "WHERE blade ILIKE :term OR assist_blade ILIKE :term "
                    "OR ratchet ILIKE :term OR bit ILIKE :term OR lock_chip ILIKE :term"
                )
                args = {"term": f"%{search}%"}

            column = _SORT_FIELDS[sort_by]
            rows = await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, "
                    "sum(punteggio_totale) AS punteggio_totale, sum(primi_posti) AS primi_posti, "
                    "sum(secondi_posti) AS secondi_posti, sum(terzi_posti) AS terzi_posti, "
                    "sum(quarti_posti) AS quarti_posti "
                    f"FROM combo_stats {where} "
                    "GROUP BY blade, assist_blade, ratchet, bit, lock_chip "
                    f"ORDER BY sum({column}) {direction} "
                    "LIMIT :limit OFFSET :offset"
                ),
                {**args, "limit": limit, "offset": offset},
            )

            total = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) AS c FROM (SELECT 1 FROM combo_stats "
                        f"{where} GROUP BY blade, assist_blade, ratchet, bit, lock_chip) t"
                    ),
                    args,
                )
            ).scalar() or 0

            combos_out = [
                {
                    "blade": r.blade,
                    "assistBlade": r.assist_blade,
                    "ratchet": r.ratchet,
                    "bit": r.bit,
                    "lockChip": r.lock_chip,
                    "punteggioTotale": number(r.punteggio_totale),
                    "primiPosti": number(r.primi_posti),
                    "secondiPosti": number(r.secondi_posti),
                    "terziPosti": number(r.terzi_posti),
                    "quartiPosti": number(r.quarti_posti),
                }
                for r in rows
            ]
        else:
            # NOTE: `search` is deliberately NOT applied here.
            #
            # The Express version calls .where() twice on the same builder — once
            # for the search, once for the season — and Drizzle keeps only the
            # last one, so picking a season silently discards the search filter.
            # Verified against the running service. Reproduced for parity; fix it
            # in both backends at once if it is ever meant to work.
            column = _SORT_FIELDS[sort_by]
            rows = await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, season, "
                    "primi_posti, secondi_posti, terzi_posti, quarti_posti, "
                    "punteggio_totale, data_creazione "
                    "FROM combo_stats WHERE season = :season "
                    f"ORDER BY {column} {direction}, data_creazione DESC "
                    "LIMIT :limit OFFSET :offset"
                ),
                {"season": season, "limit": limit, "offset": offset},
            )
            total = (
                await db.execute(
                    text("SELECT count(*) FROM combo_stats WHERE season = :season"),
                    {"season": season},
                )
            ).scalar() or 0

            combos_out = [
                {
                    "blade": r.blade,
                    "assistBlade": r.assist_blade,
                    "ratchet": r.ratchet,
                    "bit": r.bit,
                    "lockChip": r.lock_chip,
                    "season": r.season,
                    "primiPosti": number(r.primi_posti),
                    "secondiPosti": number(r.secondi_posti),
                    "terziPosti": number(r.terzi_posti),
                    "quartiPosti": number(r.quarti_posti),
                    "punteggioTotale": number(r.punteggio_totale),
                    "dataCreazione": js_datetime(r.data_creazione),
                }
                for r in rows
            ]

        total = int(total)
        return {
            "combos": combos_out,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": math.ceil(total / limit),
            },
        }
    except Exception as exc:
        log.error("Error fetching combo stats: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch combo stats"})


def _combo_payload(row: Any) -> dict:
    return {
        "blade": row.blade,
        "assistBlade": row.assistBlade,
        "ratchet": row.ratchet,
        "bit": row.bit,
        "lockChip": row.lockChip,
        "primiPosti": number(row.primiPosti),
        "secondiPosti": number(row.secondiPosti),
        "terziPosti": number(row.terziPosti),
        "quartiPosti": number(row.quartiPosti),
        "punteggioTotale": number(row.punteggioTotale),
        "dataCreazione": pg_timestamptz(row.dataCreazione),
    }


_RANKED_COMBOS = """
    WITH ranked AS (
        SELECT blade, assist_blade, ratchet, bit, lock_chip,
               primi_posti, secondi_posti, terzi_posti, quarti_posti,
               punteggio_totale, data_creazione,
               ROW_NUMBER() OVER (ORDER BY punteggio_totale DESC, data_creazione DESC) AS rank
        FROM combo_stats
    )
    SELECT blade, assist_blade AS "assistBlade", ratchet, bit, lock_chip AS "lockChip",
           primi_posti AS "primiPosti", secondi_posti AS "secondiPosti",
           terzi_posti AS "terziPosti", quarti_posti AS "quartiPosti",
           punteggio_totale AS "punteggioTotale", data_creazione AS "dataCreazione", rank
    FROM ranked
"""


def _slugify(value: Any) -> str:
    return re.sub(r"[^a-z0-9\-]", "", re.sub(r"\s+", "-", str(value).strip().lower()))


@router.get("/api/stats/combos/by-key")
async def combo_by_key(
    db: Annotated[AsyncSession, Depends(get_session)],
    key: Annotated[str, Query()] = "",
):
    key = key.strip()
    if not key:
        return JSONResponse(status_code=400, content={"error": "Missing key"})

    try:
        row, rank = None, 0

        if "|" in key:
            parts = key.split("|")
            if len(parts) == 5:
                row = (
                    await db.execute(
                        text(
                            _RANKED_COMBOS
                            + " WHERE blade = :blade AND assist_blade = :assist"
                            " AND ratchet = :ratchet AND bit = :bit AND lock_chip = :chip"
                            " LIMIT 1"
                        ),
                        dict(zip(("blade", "assist", "ratchet", "bit", "chip"), parts)),
                    )
                ).first()
                if row is not None:
                    rank = int(row.rank)

        if row is None:
            # Fall back to the slug form used by sitemap/SEO links. Express scans
            # the whole ranked list in JS; the position in that list IS the rank,
            # so the scan has to stay ordered.
            everything = (
                await db.execute(
                    text(
                        'SELECT blade, assist_blade AS "assistBlade", ratchet, bit, '
                        'lock_chip AS "lockChip", primi_posti AS "primiPosti", '
                        'secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti", '
                        'quarti_posti AS "quartiPosti", punteggio_totale AS "punteggioTotale", '
                        "data_creazione AS \"dataCreazione\" "
                        "FROM combo_stats ORDER BY punteggio_totale DESC, data_creazione DESC"
                    )
                )
            ).all()

            for index, candidate in enumerate(everything):
                pieces = [
                    candidate.lockChip if (candidate.lockChip or "").lower() != "none" else "",
                    candidate.blade,
                    candidate.assistBlade if (candidate.assistBlade or "").lower() != "none" else "",
                    candidate.ratchet if (candidate.ratchet or "").lower() != "none" else "",
                    candidate.bit,
                ]
                if "-".join(_slugify(p) for p in pieces if p) == key:
                    row, rank = candidate, index + 1
                    break

        if row is None:
            return JSONResponse(status_code=404, content={"error": "Combo not found"})

        return {"combo": _combo_payload(row), "rank": rank}
    except Exception as exc:
        log.error("Error fetching combo by key: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch combo by key"})


# Builds the same slug as the JS helper, but in SQL so the match happens in the
# database: lowercased, whitespace to dashes, anything else dropped, with the
# 'None' placeholders omitted entirely.
_SLUG_EXPRESSION = """
    concat_ws('-',
      CASE WHEN lower(lock_chip) <> 'none' THEN lower(regexp_replace(regexp_replace(trim(lock_chip), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')) END,
      lower(regexp_replace(regexp_replace(trim(blade), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')),
      CASE WHEN lower(assist_blade) <> 'none' THEN lower(regexp_replace(regexp_replace(trim(assist_blade), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')) END,
      CASE WHEN lower(ratchet) <> 'none' THEN lower(regexp_replace(regexp_replace(trim(ratchet), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')) END,
      lower(regexp_replace(regexp_replace(trim(bit), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g'))
    )
"""


@router.get("/api/stats/combos/by-slug")
async def combo_by_slug(
    db: Annotated[AsyncSession, Depends(get_session)],
    slug: Annotated[str, Query()] = "",
):
    slug = slug.strip()
    if not slug:
        return JSONResponse(status_code=400, content={"error": "Missing slug"})

    try:
        row = (
            await db.execute(
                text(f"{_RANKED_COMBOS} WHERE {_SLUG_EXPRESSION} = :slug LIMIT 1"),
                {"slug": slug},
            )
        ).first()
        if row is None:
            return JSONResponse(status_code=404, content={"error": "Combo not found"})
        return {"combo": _combo_payload(row), "rank": int(row.rank)}
    except Exception as exc:
        log.error("Error fetching combo by slug: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch combo by slug"})


@router.get("/api/stats/top/components")
async def top_components(
    db: Annotated[AsyncSession, Depends(get_session)],
    season: Annotated[str, Query()] = "",
):
    season = season.strip()
    target = season or "Off Season 2025"

    try:
        if _is_all_time(season):
            rows = await db.execute(
                text(
                    "SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale "
                    "FROM (SELECT component_type, name, SUM(primi_posti) AS primi_posti, "
                    "SUM(secondi_posti) AS secondi_posti, SUM(terzi_posti) AS terzi_posti, "
                    "SUM(punteggio_totale) AS punteggio_totale, "
                    "ROW_NUMBER() OVER (PARTITION BY component_type ORDER BY SUM(primi_posti) DESC, "
                    "SUM(punteggio_totale) DESC, name ASC) AS rn "
                    "FROM top_component_snapshot GROUP BY component_type, name) t WHERE rn = 1"
                )
            )
        else:
            rows = await db.execute(
                text(
                    "SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale "
                    "FROM (SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale, "
                    "ROW_NUMBER() OVER (PARTITION BY component_type ORDER BY primi_posti DESC, "
                    "punteggio_totale DESC, name ASC) AS rn "
                    "FROM top_component_snapshot WHERE season = :season) t WHERE rn = 1"
                ),
                {"season": target},
            )

        # The all-time branch aggregates, so its integer columns come back as
        # bigint (string); the per-season branch reads them as plain integers.
        count_of = big_number if _is_all_time(season) else number
        return {
            r.component_type: {
                r.component_type: r.name,
                "primiPosti": count_of(r.primi_posti),
                "secondiPosti": count_of(r.secondi_posti),
                "terziPosti": count_of(r.terzi_posti),
                "punteggioTotale": number(r.punteggio_totale),
            }
            for r in rows
        }
    except Exception as exc:
        log.error("Error fetching top components: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch top components"})


async def _single_top(db: AsyncSession, table: str, columns: list[str]) -> dict | None:
    row = (
        await db.execute(
            text(
                f"SELECT {', '.join(columns)} FROM {table} "
                "ORDER BY punteggio_totale DESC LIMIT 1"
            )
        )
    ).first()
    if row is None:
        return None
    return {key: number(value) for key, value in row._mapping.items()}


@router.get("/api/stats/top/blade")
async def top_blade(db: Annotated[AsyncSession, Depends(get_session)]):
    try:
        blade = await _single_top(
            db,
            "blade_stats",
            [
                "blade",
                "season",
                'primi_posti AS "primiPosti"',
                'secondi_posti AS "secondiPosti"',
                'terzi_posti AS "terziPosti"',
                'quarti_posti AS "quartiPosti"',
                'punteggio_totale AS "punteggioTotale"',
            ],
        )
        return {"blade": blade}
    except Exception as exc:
        log.error("Error fetching top blade: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch top blade"})


@router.get("/api/stats/top/ratchet")
async def top_ratchet(db: Annotated[AsyncSession, Depends(get_session)]):
    try:
        ratchet = await _single_top(
            db,
            "ratchet_stats",
            [
                "ratchet",
                "season",
                'primi_posti AS "primiPosti"',
                'secondi_posti AS "secondiPosti"',
                'terzi_posti AS "terziPosti"',
                'quarti_posti AS "quartiPosti"',
                'punteggio_totale AS "punteggioTotale"',
            ],
        )
        return {"ratchet": ratchet}
    except Exception as exc:
        log.error("Error fetching top ratchet: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch top ratchet"})


@router.get("/api/stats/top/bit")
async def top_bit(db: Annotated[AsyncSession, Depends(get_session)]):
    try:
        bit = await _single_top(
            db,
            "bit_stats",
            [
                '"bit"',
                "season",
                'is_ratchet_less AS "isRatchetLess"',
                'primi_posti AS "primiPosti"',
                'secondi_posti AS "secondiPosti"',
                'terzi_posti AS "terziPosti"',
                'quarti_posti AS "quartiPosti"',
                'punteggio_totale AS "punteggioTotale"',
            ],
        )
        return {"bit": bit}
    except Exception as exc:
        log.error("Error fetching top bit: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch top bit"})


_LEADERBOARD_TABLES = {
    "blade": ("blade_stats", "blade"),
    "ratchet": ("ratchet_stats", "ratchet"),
    "bit": ("bit_stats", '"bit"'),
}


@router.get("/api/stats/leaderboard/{type}")
async def leaderboard(
    type: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
):
    kind = type.lower()
    if kind not in _LEADERBOARD_TABLES:
        return JSONResponse(
            status_code=400, content={"error": "Invalid type. Use blade, ratchet, or bit."}
        )

    params = request.query_params
    limit = _clamp(params.get("limit"), 10, 1, 50)
    season = params.get("season")
    all_time = not season or season.lower() in {"all time", "all-time"}

    table, column = _LEADERBOARD_TABLES[kind]
    label = column.strip('"')

    try:
        if all_time:
            rows = await db.execute(
                text(
                    f'SELECT {column} AS "{label}", '
                    'sum(punteggio_totale) AS "punteggioTotale", sum(primi_posti) AS "primiPosti", '
                    'sum(secondi_posti) AS "secondiPosti", sum(terzi_posti) AS "terziPosti", '
                    'sum(quarti_posti) AS "quartiPosti" '
                    f"FROM {table} GROUP BY {column} "
                    "ORDER BY sum(punteggio_totale) DESC LIMIT :limit"
                ),
                {"limit": limit},
            )
        else:
            rows = await db.execute(
                text(
                    f'SELECT {column} AS "{label}", '
                    'punteggio_totale AS "punteggioTotale", primi_posti AS "primiPosti", '
                    'secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti", '
                    'quarti_posti AS "quartiPosti" '
                    f"FROM {table} WHERE season = :season "
                    "ORDER BY punteggio_totale DESC LIMIT :limit"
                ),
                {"season": season, "limit": limit},
            )

        placement_keys = {"primiPosti", "secondiPosti", "terziPosti", "quartiPosti"}
        items = [
            {
                k: (big_number(v) if all_time and k in placement_keys else number(v))
                for k, v in r._mapping.items()
            }
            for r in rows
        ]
        return {"items": items, "type": kind, "limit": limit, "season": season or "All Time"}
    except Exception as exc:
        log.error("Leaderboard error: %s", exc)
        return JSONResponse(status_code=500, content={"error": "Failed to fetch leaderboard"})
