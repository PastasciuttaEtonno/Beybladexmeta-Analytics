"""Open Graph previews and the sitemap.

Ported from backend/src/routes/og.ts.

`/combo/:id` is not an API call: it returns the SPA's own index.html with the
og:image tags rewritten, so a link shared on social media previews that combo.
The frontend is a separate service now, so the document is fetched from it over
HTTP rather than read off disk.
"""

import logging
import re
from datetime import date, datetime, timezone
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.main_helpers import raw_path
from app.db import get_session
from app.lib.challengermode import fetch_tournament_detail, fetch_tournaments_for_game
from app.lib.og_image import generate_combo_image

router = APIRouter()
log = logging.getLogger(__name__)

DEFAULT_AFTER = "2024-01-01T00:00:00Z"

_OG_IMAGE = re.compile(r'<meta property="og:image" content="[^"]*"\s*/?>')
_TWITTER_IMAGE = re.compile(r'<meta name="twitter:image" content="[^"]*"\s*/?>')

_index_cache: dict[str, Any] = {"html": None, "fetched_at": 0.0}
INDEX_TTL_SECONDS = 60


def _slug(value: Any) -> str:
    return re.sub(r"[^a-z0-9\-]", "", re.sub(r"\s+", "-", str(value).strip().lower()))


def combo_slug(lock_chip: Any, blade: Any, assist: Any, ratchet: Any, bit: Any) -> str:
    """The slug used in /combo/... links and the sitemap.

    Note this is the JS spelling — lowercase FIRST, then strip — which is NOT
    what the SQL in /api/stats/combos/by-slug does. The two disagree; both are
    reproduced as they are.
    """
    parts = [
        lock_chip if str(lock_chip or "").lower() != "none" else "",
        blade,
        assist if str(assist or "").lower() != "none" else "",
        ratchet if str(ratchet or "").lower() != "none" else "",
        bit,
    ]
    return "-".join(_slug(p) for p in parts if p)


async def _fetch_index_html(settings: Settings) -> str | None:
    """The SPA shell, from the frontend service, cached briefly."""
    import time

    origin = settings.frontend_origin
    if not origin:
        return None

    if _index_cache["html"] and time.time() - _index_cache["fetched_at"] < INDEX_TTL_SECONDS:
        return _index_cache["html"]

    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
            response = await client.get(f"{origin.rstrip('/')}/index.html")
        if response.status_code >= 400:
            return None
        _index_cache["html"] = response.text
        _index_cache["fetched_at"] = time.time()
        return response.text
    except Exception as exc:
        log.error("Error fetching index.html: %s", exc)
        return None


@router.get("/combo/{combo_id:path}")
async def combo_page(
    combo_id: str,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
):
    html = await _fetch_index_html(settings)
    if html is None:
        # Express calls next() here, which lands on its catch-all 404. Return
        # that exact body so a frontend that cannot be reached looks the same
        # whichever backend was asked.
        return JSONResponse(
            status_code=404, content={"error": "not_found", "path": raw_path(request)}
        )

    base = (settings.app_base_url or "https://beybladexmeta.com").rstrip("/")
    image = f'{base}/api/og/combo/{combo_id}'

    html = _OG_IMAGE.sub(f'<meta property="og:image" content="{image}" />', html)
    html = _TWITTER_IMAGE.sub(f'<meta name="twitter:image" content="{image}" />', html)
    return HTMLResponse(html)


@router.get("/api/og/combo/{key:path}")
async def og_combo_image(key: str, db: Annotated[AsyncSession, Depends(get_session)]):
    try:
        target = None
        rank = 0

        # Strategy 1: the pipe-separated key used by internal links.
        if "|" in key:
            parts = key.split("|")
            if len(parts) == 5:
                row = (
                    await db.execute(
                        text(
                            "WITH ranked AS (SELECT blade, assist_blade, ratchet, bit, lock_chip, "
                            "punteggio_totale, data_creazione, "
                            "ROW_NUMBER() OVER (ORDER BY punteggio_totale DESC, data_creazione DESC) AS rank "
                            "FROM combo_stats) "
                            'SELECT blade, assist_blade AS "assistBlade", ratchet, bit, '
                            'lock_chip AS "lockChip", punteggio_totale AS "punteggioTotale", rank '
                            "FROM ranked WHERE blade = :blade AND assist_blade = :assist "
                            "AND ratchet = :ratchet AND bit = :bit AND lock_chip = :chip LIMIT 1"
                        ),
                        dict(zip(("blade", "assist", "ratchet", "bit", "chip"), parts)),
                    )
                ).first()
                if row is not None:
                    target = {
                        "blade": row.blade, "assistBlade": row.assistBlade,
                        "ratchet": row.ratchet, "bit": row.bit, "lockChip": row.lockChip,
                        "punteggioTotale": row.punteggioTotale,
                    }
                    rank = int(row.rank)

        # Strategy 2: the slug form used by the sitemap. The position in the
        # ranked list IS the rank, so the scan has to stay ordered.
        if target is None:
            rows = (
                await db.execute(
                    text(
                        "SELECT blade, assist_blade, ratchet, bit, lock_chip, punteggio_totale "
                        "FROM combo_stats ORDER BY punteggio_totale DESC, data_creazione DESC"
                    )
                )
            ).all()
            for index, row in enumerate(rows):
                if combo_slug(row.lock_chip, row.blade, row.assist_blade, row.ratchet, row.bit) == key:
                    target = {
                        "blade": row.blade, "assistBlade": row.assist_blade,
                        "ratchet": row.ratchet, "bit": row.bit, "lockChip": row.lock_chip,
                        "punteggioTotale": row.punteggio_totale,
                    }
                    rank = index + 1
                    break

        if target is None:
            return PlainTextResponse("Combo not found", status_code=404)

        image = await generate_combo_image({**target, "rank": rank})
        return Response(
            content=image,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception as exc:
        log.error("Error generating OG image: %s", exc)
        return PlainTextResponse("Internal Server Error", status_code=500)


_STATIC_PATHS = [
    ("/", "0.9", "daily"),
    ("/analytics", "0.8", "daily"),
    ("/favorites", "0.5", "weekly"),
    ("/tournaments", "0.7", "daily"),
    ("/players", "0.7", "daily"),
    ("/leaderboard/blade", "0.6", "weekly"),
    ("/leaderboard/ratchet", "0.6", "weekly"),
    ("/leaderboard/bit", "0.6", "weekly"),
]

_EMPTY_SITEMAP = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
)


@router.get("/sitemap.xml")
async def sitemap(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    try:
        base = (settings.app_base_url or f"http://localhost:{settings.port}").rstrip("/")
        today = datetime.now(timezone.utc).date().isoformat()

        entries: list[tuple[str, str, str, str]] = [
            (path, priority, changefreq, today) for path, priority, changefreq in _STATIC_PATHS
        ]

        # --- tournaments ---
        nodes = await fetch_tournaments_for_game(db, DEFAULT_AFTER)
        for node in nodes:
            tournament_id = str(node.get("id"))
            lastmod = today
            try:
                detail = await fetch_tournament_detail(db, tournament_id)
                started = (detail.get("schedule") or {}).get("startedAt")
                if started:
                    lastmod = str(started)[:10]
            except Exception:
                pass
            entries.append((f"/tournaments/{tournament_id}", "0.6", "weekly", lastmod))

        # --- players ---
        players = (
            await db.execute(
                text(
                    "SELECT player_id FROM player_leaderboard "
                    "ORDER BY total_points DESC LIMIT 100"
                )
            )
        ).all()
        for player in players:
            player_id = str(player.player_id)
            last = (
                await db.execute(
                    text("SELECT MAX(updated_at) AS last FROM cm_match_results WHERE player_id = :id"),
                    {"id": player_id},
                )
            ).scalar()
            entries.append(
                (f"/players/{player_id}", "0.6", "weekly", str(last)[:10] if last else today)
            )

        # --- combos ---
        combos = (
            await db.execute(
                text(
                    "SELECT blade, assist_blade, ratchet, bit, lock_chip, data_creazione "
                    "FROM combo_stats ORDER BY punteggio_totale DESC, data_creazione DESC LIMIT 300"
                )
            )
        ).all()
        for row in combos:
            slug = combo_slug(row.lock_chip, row.blade, row.assist_blade, row.ratchet, row.bit)
            lastmod = str(row.data_creazione)[:10] if row.data_creazione else today
            entries.append((f"/combo/{slug}", "0.6", "weekly", lastmod))

        urls = "".join(
            f"<url><loc>{base}{path}</loc><lastmod>{lastmod}</lastmod>"
            f"<changefreq>{changefreq}</changefreq><priority>{priority}</priority></url>"
            for path, priority, changefreq, lastmod in entries
        )
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f"{urls}</urlset>"
        )
        return Response(content=xml, media_type="application/xml")
    except Exception as exc:
        log.error("Error building sitemap: %s", exc)
        return Response(content=_EMPTY_SITEMAP, media_type="text/html", status_code=500)
