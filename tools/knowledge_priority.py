"""Says which schede to write next, in order, and what each one buys.

"Which of the 171 should I start with" has a real answer, and it is not a matter
of taste: some parts carry the meta and most do not. This ranks the unwritten
schede by the score their part has actually earned in the stats tables, and
reports how much of each slot's total weight the written ones already cover.

    python tools/knowledge_priority.py --url "$DATABASE_URL"
    python tools/knowledge_priority.py --url "$DATABASE_URL" --coverage 0.9
    python tools/knowledge_priority.py --url "$DATABASE_URL" --season "Off Season 2025"

The point of the coverage figure: a question about the meta almost always names
a part that placed. Covering 80% of the scored weight per slot answers most real
questions with a fraction of the writing - and the remaining files stay
scaffolded, cost nothing, and are there when someone asks about a rare part.

A scheda counts as written when at least one of its sections is no longer a
placeholder, which is the same test the ingest applies.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

SLOTS = [
    ("blade", "blade", "blade_stats", "blades"),
    ("ratchet", "ratchet", "ratchet_stats", "ratchets"),
    ("bit", '"bit"', "bit_stats", "bits"),
    ("assist_blade", "assist_blade", "assist_blade_stats", "assist-blades"),
    ("lock_chip", "lock_chip", "lock_chip_stats", "lock-chips"),
]

PLACEHOLDERS = {"NONE", "-"}

# Same test as app/lib/rag/chunking.py: a section holding only whitespace, an
# HTML comment or an italicised note has not been written.
PLACEHOLDER_SECTION = re.compile(
    r"\A(?:\s|<!--.*?-->|TODO\b.*|_.*_)*\Z", re.DOTALL | re.IGNORECASE
)
SECTION = re.compile(r"^##\s+.+?$", re.MULTILINE)


def is_written(path: Path) -> bool:
    if not path.exists():
        return False
    body = path.read_text(encoding="utf-8")
    parts = SECTION.split(body)
    return any(not PLACEHOLDER_SECTION.match(part) for part in parts[1:])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--knowledge", default=str(REPO / "knowledge"))
    parser.add_argument("--coverage", type=float, default=0.8,
                        help="fraction of each slot's scored weight to reach (default 0.8)")
    parser.add_argument("--season", help="only this season; default is every season summed")
    args = parser.parse_args()

    try:
        import psycopg
    except ImportError:
        try:
            import psycopg2 as psycopg  # type: ignore
        except ImportError:
            print("Needs psycopg (or psycopg2):  uv pip install psycopg[binary]", file=sys.stderr)
            return 1

    root = Path(args.knowledge)
    url = args.url.replace("postgresql+asyncpg://", "postgresql://")
    todo: list[tuple[str, str, str, float]] = []

    with psycopg.connect(url) as connection, connection.cursor() as cursor:
        for slot, column, table, folder in SLOTS:
            where = "WHERE season = %s" if args.season else ""
            cursor.execute(
                f"SELECT r.slug, r.canonical_name, sum(s.punteggio_totale) AS pts "  # noqa: S608
                f"FROM {table} s "
                f"JOIN component_registry r ON r.canonical_name = s.{column} AND r.slot = %s "
                f"{where} "
                f"GROUP BY r.slug, r.canonical_name ORDER BY pts DESC",
                (slot, args.season) if args.season else (slot,),
            )
            rows = [r for r in cursor.fetchall() if r[1].upper() not in PLACEHOLDERS]

            total = sum(float(r[2] or 0) for r in rows) or 1.0
            written_pts = sum(
                float(pts or 0) for slug, _, pts in rows
                if is_written(root / folder / f"{slug}.md")
            )

            print(f"\n### {slot}   {written_pts / total * 100:.0f}% del peso gia' coperto"
                  f"   ({len(rows)} pezzi con punteggio)")

            cumulative = written_pts
            picked = 0
            for slug, name, pts in rows:
                if cumulative / total >= args.coverage:
                    break
                if is_written(root / folder / f"{slug}.md"):
                    continue
                pts = float(pts or 0)
                if pts <= 0:
                    break  # nothing below this point has ever placed
                cumulative += pts
                picked += 1
                todo.append((slot, folder, slug, pts))
                print(f"  {picked:2}. {name:16} {int(pts):6} pt"
                      f"   -> {cumulative / total * 100:5.1f}%")
            if picked == 0:
                print(f"  gia' oltre il {args.coverage:.0%}, niente da scrivere")

    print(f"\n{len(todo)} scheda/e da scrivere per arrivare al {args.coverage:.0%} "
          f"su ogni slot:\n")
    for slot, folder, slug, _ in todo:
        print(f"  knowledge/{folder}/{slug}.md")

    return 0


if __name__ == "__main__":
    sys.exit(main())
