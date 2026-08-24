"""Writes one empty scheda per registered part, with the factual frontmatter
already filled in from component_registry.

The knowledge base is the slow part of this project: the pipeline takes days,
a curated corpus does not. This removes the half of the work that is mechanical
- 170-odd files, each needing a slug, a canonical name that matches the database
byte for byte, and the same section headings as its neighbours - and leaves only
the half a person actually has to supply, which is the prose.

    python tools/scaffold_knowledge.py --url "$DATABASE_URL" --dry-run
    python tools/scaffold_knowledge.py --url "$DATABASE_URL" --apply
    python tools/scaffold_knowledge.py --url "$DATABASE_URL" --apply --slot blade

An existing file is never overwritten, so this is safe to re-run after new parts
appear in the stats tables: it writes what is missing and leaves the rest alone.

The sections are left empty on purpose. The ingest pipeline skips a section that
still holds only its placeholder, so a scaffolded corpus costs no embedding
calls and reports honestly how much of itself has actually been written.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Directory per slot. Plural, because they are collections of files.
FOLDERS = {
    "blade": "blades",
    "assist_blade": "assist-blades",
    "ratchet": "ratchets",
    "bit": "bits",
    "lock_chip": "lock-chips",
}

# What a reader would ask about a part, in the order they would ask it. Keeping
# the headings identical across schede is what lets chunking be atomic: one
# heading is one answerable question.
SECTIONS = {
    "blade": ["Profilo", "Interazioni", "Sinergie note", "Note di formato"],
    "assist_blade": ["Profilo", "Interazioni", "Sinergie note"],
    "ratchet": ["Profilo", "Interazioni", "Sinergie note"],
    "bit": ["Profilo", "Interazioni", "Sinergie note"],
    "lock_chip": ["Profilo", "Note di formato"],
}

PLACEHOLDER = "<!-- da scrivere -->"


def render(slug: str, canonical: str, slot: str, system: str | None, aliases: list[str]) -> str:
    lines = [
        "---",
        f"id: {slot}.{slug}",
        f"slug: {slug}",
        # The kind of document, not the part's slot: kb_document.doc_type only
        # admits component / rule / guide / meta_snapshot. The slot goes below.
        "type: component",
        f"slot: {slot}",
        # Quoted: a name like '9-60' is a string, and YAML would read it as
        # something else given the chance.
        f'canonical_name: "{canonical}"',
        "aliases: [" + ", ".join(f'"{a}"' for a in aliases) + "]",
    ]
    lines.append(f"system: {system}" if system else "system:        # BX | UX | CX")
    lines += [
        "lang: it",
        "status: draft",
        "doc_version: 1",
        "sources: []",
        "---",
        "",
        f"# {canonical}",
        "",
    ]
    for heading in SECTIONS.get(slot, ["Profilo"]):
        lines += [f"## {heading}", "", PLACEHOLDER, ""]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="postgresql://... connection string")
    parser.add_argument("--knowledge", default=str(REPO / "knowledge"))
    parser.add_argument("--slot", help="only this slot (blade, ratchet, bit, ...)")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="say what would be written")
    group.add_argument("--apply", action="store_true", help="write the missing files")
    args = parser.parse_args()

    try:
        import psycopg
    except ImportError:
        try:
            import psycopg2 as psycopg  # type: ignore
        except ImportError:
            print("Needs psycopg (or psycopg2):  uv pip install psycopg[binary]", file=sys.stderr)
            return 1

    url = args.url.replace("postgresql+asyncpg://", "postgresql://")
    root = Path(args.knowledge)

    with psycopg.connect(url) as connection, connection.cursor() as cursor:
        clause = "WHERE slot = %s" if args.slot else ""
        cursor.execute(
            "SELECT r.slug, r.canonical_name, r.slot, r.system, "
            "       coalesce(array_agg(a.alias ORDER BY a.alias) "
            "                FILTER (WHERE a.alias IS NOT NULL), '{}') "
            "FROM component_registry r "
            "LEFT JOIN component_alias a ON a.slug = r.slug "
            f"{clause} "
            "GROUP BY r.slug, r.canonical_name, r.slot, r.system "
            "ORDER BY r.slot, r.canonical_name",
            (args.slot,) if args.slot else (),
        )
        parts = cursor.fetchall()

    written, skipped = 0, 0
    for slug, canonical, slot, system, aliases in parts:
        path = root / FOLDERS.get(slot, slot) / f"{slug}.md"
        if path.exists():
            skipped += 1
            continue
        written += 1
        if args.dry_run:
            print(f"  + {path.relative_to(REPO)}")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            render(slug, canonical, slot, system, list(aliases)), encoding="utf-8"
        )

    verb = "would write" if args.dry_run else "wrote"
    print(f"{verb} {written} file(s), {skipped} already existed")
    if written and not args.dry_run:
        print(f"\nEvery section is a placeholder. Until one is written the ingest skips")
        print(f"the file, so `rag ingest` will report {written} scaffolded file(s) as empty.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
