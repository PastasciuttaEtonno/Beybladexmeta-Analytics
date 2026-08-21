"""The social preview image for a combo, ported from backend/src/og-image.ts.

An honest caveat up front: this is the one place in the migration where the two
backends CANNOT be made byte-identical. The original draws with
@napi-rs/canvas; this draws with Pillow. Different rasterisers, different font
files, different antialiasing. The layout, colours and sizes are reproduced, and
the result is compared visually rather than by hash.

Fonts are the biggest source of drift: the original asks for "Arial", which does
not exist on a Linux container, so it already falls back to whatever fontconfig
picks. Here DejaVu Sans is requested explicitly and the drawing degrades to
Pillow's built-in font if even that is missing.
"""

from __future__ import annotations

import asyncio
import io
import logging
import math
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.config import get_settings

log = logging.getLogger(__name__)

WIDTH, HEIGHT = 1200, 630
GRID_SIZE = 50

_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
]

# backend-py carries its own copy, exactly as backend/ does.
_LOGO_PATH = Path(__file__).resolve().parents[2] / "assets" / "meta-logo-white.png"


def _font(size: int, bold: bool) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        if bold and "Bold" not in path and "bd" not in path:
            continue
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    for path in _FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    log.warning("No TrueType font available; OG text will use the bitmap fallback")
    return ImageFont.load_default()


def _variations(name: str) -> list[str]:
    """The same three spellings the frontend and the TS version try."""
    lowered = name.lower()
    return [
        re.sub(r"\s+", "", lowered),
        re.sub(r"\s+", "-", lowered),
        re.sub(r"\s+", "-", re.sub(r"([a-z])([A-Z])", r"\1-\2", name).lower()),
    ]


async def _load_component(client: httpx.AsyncClient, base: str, folder: str, name: str):
    if not name or name.lower() == "none":
        return None

    # WebP first, then PNG — the same order the browser tries.
    for extension in ("webp", "png"):
        for filename in _variations(name):
            try:
                response = await client.get(f"{base}/{folder}/{filename}.{extension}")
                if response.status_code == 200:
                    return Image.open(io.BytesIO(response.content)).convert("RGBA")
            except Exception:
                continue

    log.warning("Failed to load image for %s in %s", name, folder)
    return None


@lru_cache(maxsize=1)
def _radial_background() -> Image.Image:
    """#1a1a1a at the centre fading to black at the edges.

    Cached: it takes no arguments and every image gets the same gradient, but
    the loop below is ~378_000 Python iterations and the server has one CPU —
    paying that per request was most of the time spent rendering an OG image.

    Callers must not draw on the returned image. `_render` converts it to RGBA
    first, and PIL's convert() returns a new image, so the cached original stays
    pristine.
    """
    canvas = Image.new("RGB", (WIDTH, HEIGHT), (17, 17, 17))
    pixels = canvas.load()
    centre_x, centre_y = WIDTH / 2, HEIGHT / 2
    for y in range(HEIGHT):
        for x in range(0, WIDTH, 2):
            distance = math.hypot(x - centre_x, y - centre_y) / WIDTH
            value = max(0, int(26 * (1 - min(distance, 1.0))))
            pixels[x, y] = (value, value, value)
            if x + 1 < WIDTH:
                pixels[x + 1, y] = (value, value, value)
    return canvas


def _draw_centred(draw: ImageDraw.ImageDraw, text: str, y: int, font, fill) -> None:
    """Canvas draws text centred on x with the baseline at y."""
    left, top, right, _ = draw.textbbox((0, 0), text, font=font)
    draw.text((WIDTH / 2 - (right - left) / 2, y - (top + font.size)), text, font=font, fill=fill)


def _paste_contained(canvas: Image.Image, image: Image.Image, cx: int, cy: int, box: int) -> None:
    scale = min(box / image.width, box / image.height)
    size = (max(1, int(image.width * scale)), max(1, int(image.height * scale)))
    resized = image.resize(size, Image.LANCZOS)

    # The original gives components a soft drop shadow; approximate it with a
    # blurred copy of the alpha channel offset downwards.
    shadow = Image.new("RGBA", (size[0] + 80, size[1] + 80), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 153), (40, 40), resized.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    canvas.alpha_composite(shadow, (cx - size[0] // 2 - 40, cy - size[1] // 2 - 40 + 20))
    canvas.alpha_composite(resized, (cx - size[0] // 2, cy - size[1] // 2))


def _render(combo: dict, images: dict[str, Image.Image | None]) -> bytes:
    canvas = _radial_background().convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # Grid at 3% white. It has to be drawn on a transparent overlay and
    # composited: drawing a translucent colour straight onto an RGBA image
    # REPLACES the pixel's alpha instead of blending, which turned these hairlines
    # into solid white once the alpha channel was dropped on save.
    grid = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid)
    for x in range(0, WIDTH, GRID_SIZE):
        grid_draw.line([(x, 0), (x, HEIGHT)], fill=(255, 255, 255, 8), width=1)
    for y in range(0, HEIGHT, GRID_SIZE):
        grid_draw.line([(0, y), (WIDTH, y)], fill=(255, 255, 255, 8), width=1)
    canvas.alpha_composite(grid)

    title = " • ".join(
        part for part in (
            combo.get("lockChip") if str(combo.get("lockChip") or "").lower() != "none" else "",
            combo.get("blade"),
            combo.get("assistBlade") if str(combo.get("assistBlade") or "").lower() != "none" else "",
            combo.get("ratchet") if str(combo.get("ratchet") or "").lower() != "none" else "",
            combo.get("bit"),
        ) if part
    )
    _draw_centred(draw, title, 100, _font(60, bold=True), (255, 255, 255, 255))

    if isinstance(combo.get("rank"), int):
        _draw_centred(
            draw, f"Rank #{combo['rank']}", 160, _font(40, bold=True), (245, 158, 11, 255)
        )

    if _LOGO_PATH.exists():
        try:
            logo = Image.open(_LOGO_PATH).convert("RGBA")
            scale = 150 / logo.width
            logo = logo.resize((150, max(1, int(logo.height * scale))), Image.LANCZOS)
            canvas.alpha_composite(logo, (WIDTH - 150 - 40, 40))
        except Exception as exc:
            log.error("Failed to load logo for OG image: %s", exc)

    centre_x, centre_y = WIDTH // 2, HEIGHT // 2 + 50

    if images.get("blade") is not None:
        _paste_contained(canvas, images["blade"], centre_x, centre_y - 50, 320)
    else:
        draw.ellipse(
            [centre_x - 150, centre_y - 200, centre_x + 150, centre_y + 100],
            fill=(34, 34, 34, 255),
        )
        _draw_centred(
            draw, str(combo.get("blade") or "Blade"), centre_y - 40, _font(30, bold=False),
            (102, 102, 102, 255),
        )

    if images.get("ratchet") is not None:
        _paste_contained(canvas, images["ratchet"], centre_x - 350, centre_y, 220)
    if images.get("bit") is not None:
        _paste_contained(canvas, images["bit"], centre_x + 350, centre_y, 220)

    _draw_centred(
        draw, "Beyblade X Meta Analytics", HEIGHT - 40, _font(30, bold=False),
        (148, 163, 184, 255),
    )

    buffer = io.BytesIO()
    canvas.convert("RGB").save(buffer, format="PNG")
    return buffer.getvalue()


async def generate_combo_image(combo: dict[str, Any]) -> bytes:
    base = (get_settings().public_storage_url or "https://minio.vasquezlisciotto.dev/").rstrip("/")

    images: dict[str, Image.Image | None] = {"blade": None, "ratchet": None, "bit": None}
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            images["blade"], images["ratchet"], images["bit"] = await asyncio.gather(
                _load_component(client, base, "blades", str(combo.get("blade") or "")),
                _load_component(client, base, "ratchets", str(combo.get("ratchet") or "")),
                _load_component(client, base, "bits", str(combo.get("bit") or "")),
            )
    except Exception as exc:
        # Text-only is better than no image at all, which is what the original
        # falls back to as well.
        log.error("Error loading component images for OG generation: %s", exc)

    # Rasterising is CPU-bound; keep it off the event loop.
    return await asyncio.to_thread(_render, combo, images)
