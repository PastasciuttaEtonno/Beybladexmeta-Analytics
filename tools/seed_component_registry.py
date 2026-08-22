"""Fills component_registry and component_alias from the stats tables.

The stats tables are the only place that knows which parts actually exist -
/api/components already derives the filter lists from them with GROUP BY. This
takes the same distinct values and gives each one a stable slug plus the aliases
that can be derived mechanically, so the knowledge base has something to key on.

    python tools/seed_component_registry.py --url "$DATABASE_URL" --dry-run
    python tools/seed_component_registry.py --url "$DATABASE_URL" --apply

Re-runnable: parts already present keep their slug, their hand-edited system and
attributes, and any aliases added by hand. Only genuinely new parts are inserted.

What it deliberately does NOT invent:

  * abbreviations. 'WR' for WizardRod is obvious to a player and unguessable
    here - a wrong abbreviation is worse than a missing one, because entity
    linking uses these as a hard filter.
  * the `system` column (BX / UX / CX). Nothing in the stats tables records it.

Both are left for a human to fill in; --report shows what is still missing.
"""

from __future__ import annotations

import argparse
import re
import sys

# Placeholder rows the stats tables carry for "no component in this slot".
# Same set as app/routers/components.py - kept in step by the check script.
PLACEHOLDERS = {"NONE", "-"}

# (slot, column, table) - every slot the schema knows about.
SLOTS = [
    ("blade", "blade", "blade_stats"),
    ("assist_blade", "assist_blade", "assist_blade_stats"),
    ("ratchet", "ratchet", "ratchet_stats"),
    ("bit", '"bit"', "bit_stats"),
    ("lock_chip", "lock_chip", "lock_chip_stats"),
]

CAMEL = re.compile(r"[A-Z][a-z0-9]*|[a-z0-9]+")
ALPHA_ONLY = re.compile(r"^[A-Za-z]+$")


def is_real(name: str | None) -> bool:
    return bool(name) and name.strip().upper() not in PLACEHOLDERS


def split_camel(name: str) -> list[str]:
    """'WizardRod' -> ['Wizard', 'Rod']. Anything with a digit or separator is
    left alone: ratchets like '9-60' are identifiers, not compound words, and
    splitting them would produce aliases that collide with each other."""
    if not ALPHA_ONLY.match(name):
        return [name]
    parts = CAMEL.findall(name)
    return parts if len(parts) > 1 else [name]


def slugify(name: str) -> str:
    words = split_camel(name)
    if len(words) > 1:
        return "-".join(word.lower() for word in words)
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def normalise(value: str) -> str:
    """Mirrors the kb_norm() SQL function in migration 0010. The two must agree:
    the database indexes on one and lookups are built with the other."""
    return re.sub(r"[^a-z0-9]", "", value.lower())


def derive_aliases(canonical: str, slug: str) -> list[tuple[str, str]]:
    """(alias, kind) pairs that follow mechanically from the canonical name."""
    aliases: dict[str, tuple[str, str]] = {}

    def add(alias: str, kind: str) -> None:
        key = normalise(alias)
        # First writer wins, so 'exact' is never downgraded by a later form that
        # normalises to the same thing.
        if key and key not in aliases:
            aliases[key] = (alias, kind)

    add(canonical, "exact")
    words = split_camel(canonical)
    if len(words) > 1:
        add(" ".join(words), "spaced")
    add(slug, "slug")
    return [(alias, kind) for alias, kind in aliases.values()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="postgresql://... connection string")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="show what would be inserted")
    group.add_argument("--apply", action="store_true", help="insert the missing rows")
    group.add_argument("--report", action="store_true", help="what still needs a human")
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

    with psycopg.connect(url) as connection:
        if args.report:
            return report(connection)

        with connection.cursor() as cursor:
            cursor.execute("SELECT slug, canonical_name, slot FROM component_registry")
            existing = {(row[2], row[1]): row[0] for row in cursor.fetchall()}

            cursor.execute("SELECT alias_norm, slug FROM component_alias")
            existing_aliases = {(row[0], row[1]) for row in cursor.fetchall()}

        new_parts: list[tuple[str, str, str]] = []
        new_aliases: list[tuple[str, str, str, str]] = []
        taken = set(existing.values())

        for slot, column, table in SLOTS:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT {column} AS name FROM {table} "  # noqa: S608 - fixed identifiers
                    f"GROUP BY {column} ORDER BY {column} ASC"
                )
                names = [row[0] for row in cursor.fetchall() if is_real(row[0])]

            for name in names:
                slug = existing.get((slot, name))
                if slug is None:
                    slug = slugify(name)
                    # Two slots can hold parts whose names slugify the same way.
                    if slug in taken:
                        slug = f"{slug}-{slot.replace('_', '-')}"
                    taken.add(slug)
                    new_parts.append((slug, name, slot))

                for alias, kind in derive_aliases(name, slug):
                    if (normalise(alias), slug) not in existing_aliases:
                        new_aliases.append((normalise(alias), alias, slug, kind))

        print(f"{len(existing)} part(s) already registered")
        print(f"{len(new_parts)} new part(s), {len(new_aliases)} new alias(es)")

        if args.dry_run:
            for slug, name, slot in new_parts:
                print(f"  + {slot:13} {name:24} -> {slug}")
            return 0

        if not new_parts and not new_aliases:
            print("Nothing to do.")
            return 0

        with connection.cursor() as cursor:
            for slug, name, slot in new_parts:
                cursor.execute(
                    "INSERT INTO component_registry (slug, canonical_name, slot) "
                    "VALUES (%s, %s, %s) ON CONFLICT (slug) DO NOTHING",
                    (slug, name, slot),
                )
            for alias_norm, alias, slug, kind in new_aliases:
                cursor.execute(
                    "INSERT INTO component_alias (alias_norm, alias, slug, kind) "
                    "VALUES (%s, %s, %s, %s) ON CONFLICT (alias_norm, slug) DO NOTHING",
                    (alias_norm, alias, slug, kind),
                )
        connection.commit()
        print(f"Inserted {len(new_parts)} part(s) and {len(new_aliases)} alias(es).")
        return 0


def report(connection) -> int:
    """What a human still has to supply."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT slot, count(*) FILTER (WHERE system IS NULL), count(*) "
            "FROM component_registry GROUP BY slot ORDER BY slot"
        )
        rows = cursor.fetchall()

        print("slot            missing system   total")
        for slot, missing, total in rows:
            print(f"  {slot:13} {missing:14} {total:7}")

        cursor.execute(
            "SELECT count(*) FROM component_registry r "
            "WHERE NOT EXISTS (SELECT 1 FROM component_alias a "
            "                  WHERE a.slug = r.slug AND a.kind = 'abbrev')"
        )
        print(f"\n{cursor.fetchone()[0]} part(s) have no hand-written abbreviation")
    return 0


if __name__ == "__main__":
    sys.exit(main())
