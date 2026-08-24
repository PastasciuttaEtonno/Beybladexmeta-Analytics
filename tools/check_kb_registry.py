"""Fails when the knowledge base and the database disagree about a part name.

This is the guard the RAG plan calls for. The failure it prevents looks like
this: a knowledge-base file says "Wizard Rod", the stats tables say "WizardRod",
the join returns zero rows, and the model answers anyway from the prose alone -
confidently, and with no statistics behind it. Nothing else in the system
notices, which is why it gets its own check.

    python tools/check_kb_registry.py --url "$DATABASE_URL"
    python tools/check_kb_registry.py --url "$DATABASE_URL" --knowledge knowledge/

Exit code 1 on any mismatch, so it can be wired to CI once there is one. Today
it is meant to be run by hand before an ingest.

Five things are verified:

  1. every canonical_name in component_registry still exists in the stats tables
     (a part renamed upstream leaves a registry row pointing at nothing);
  2. every part in the stats tables has a registry row (a new part nobody seeded);
  3. no two parts in the same slot fold to the same normalised name - that means
     the stats tables hold one part under two spellings, which splits its
     statistics and makes the alias lookup ambiguous;
  4. no two genuinely different parts score at or above the typo threshold the
     fuzzy entity-linking fallback uses - if they did, a query for one would be
     treated as a misspelling of the other;
  5. every `canonical_name:` in a knowledge/ file resolves through the registry
     or its aliases.

Check 5 is skipped with a note while knowledge/ does not exist yet.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Kept in step with app/lib/rag/search.py by hand: importing it would drag the
# whole FastAPI dependency tree into a script that only needs psycopg.
FUZZY_THRESHOLD = 0.70

PLACEHOLDERS = {"NONE", "-"}

SLOTS = [
    ("blade", "blade", "blade_stats"),
    ("assist_blade", "assist_blade", "assist_blade_stats"),
    ("ratchet", "ratchet", "ratchet_stats"),
    ("bit", '"bit"', "bit_stats"),
    ("lock_chip", "lock_chip", "lock_chip_stats"),
]

# Deliberately a plain regex and not a YAML parser: this has to run before the
# ingest pipeline and its dependencies exist, and the field is a bare scalar.
FRONTMATTER_NAME = re.compile(r"^canonical_name:\s*(.+?)\s*$", re.MULTILINE)


def is_real(name: str | None) -> bool:
    return bool(name) and name.strip().upper() not in PLACEHOLDERS


def normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="postgresql://... connection string")
    parser.add_argument(
        "--knowledge",
        default=str(REPO / "knowledge"),
        help="the knowledge base directory (default: knowledge/ in the repo root)",
    )
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
    problems: list[str] = []

    with psycopg.connect(url) as connection, connection.cursor() as cursor:
        cursor.execute("SELECT slot, canonical_name, slug FROM component_registry")
        registry = {(row[0], row[1]): row[2] for row in cursor.fetchall()}

        cursor.execute("SELECT alias_norm, slug FROM component_alias")
        aliases = {row[0] for row in cursor.fetchall()}

        stats: set[tuple[str, str]] = set()
        for slot, column, table in SLOTS:
            cursor.execute(
                f"SELECT {column} AS name FROM {table} GROUP BY {column}"  # noqa: S608
            )
            stats.update((slot, row[0]) for row in cursor.fetchall() if is_real(row[0]))

    # 1. registry rows with nothing behind them
    for slot, name in sorted(set(registry) - stats):
        problems.append(
            f"component_registry has {slot}/{name!r}, but no such value exists in the "
            f"stats tables - it was renamed or removed upstream"
        )

    # 2. parts nobody registered
    for slot, name in sorted(stats - set(registry)):
        problems.append(
            f"the stats tables contain {slot}/{name!r}, which has no registry row - "
            f"run tools/seed_component_registry.py --apply"
        )

    # 3. one part recorded under two spellings
    by_norm: dict[tuple[str, str], list[str]] = {}
    for slot, name in registry:
        by_norm.setdefault((slot, normalise(name)), []).append(name)
    for (slot, _), names in sorted(by_norm.items()):
        if len(names) > 1:
            spellings = ", ".join(repr(name) for name in sorted(names))
            problems.append(
                f"{slot}: {spellings} are the same part spelled differently. The stats "
                f"tables hold both, so its statistics are split across them and the "
                f"filter lists show it twice - pick one spelling and merge the rows"
            )

    # 4. two real parts close enough that the typo fallback would merge them
    with psycopg.connect(url) as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT a.alias_norm, b.alias_norm, similarity(a.alias_norm, b.alias_norm) AS s "
            "FROM component_alias a JOIN component_alias b ON a.slug < b.slug "
            "ORDER BY s DESC LIMIT 1"
        )
        closest = cursor.fetchone()

    if closest:
        left, right, score = closest
        print(f"closest distinct pair: {left!r} / {right!r} at {score:.3f} "
              f"(fuzzy threshold {FUZZY_THRESHOLD})")
        if score >= FUZZY_THRESHOLD:
            problems.append(
                f"{left!r} and {right!r} are different parts but score {score:.3f}, at or "
                f"above the {FUZZY_THRESHOLD} typo threshold in app/lib/rag/search.py. The "
                f"fuzzy fallback would treat a query for one as a misspelling of the other "
                f"- raise the threshold above {score:.3f} or add explicit aliases for both"
            )

    # 5. knowledge base names that do not resolve
    knowledge = Path(args.knowledge)
    if not knowledge.is_dir():
        print(f"note: {knowledge} does not exist yet; skipping the knowledge-base check")
    else:
        known = {normalise(name) for _, name in registry} | aliases
        # The README documents the format with a worked example, so it contains
        # a canonical_name that is illustration rather than data. The ingest
        # skips it for the same reason.
        files = [p for p in sorted(knowledge.rglob("*.md")) if p.name.upper() != "README.MD"]
        for path in files:
            for name in FRONTMATTER_NAME.findall(path.read_text(encoding="utf-8")):
                if normalise(name) not in known:
                    rel = path.relative_to(REPO) if path.is_relative_to(REPO) else path
                    problems.append(
                        f"{rel}: canonical_name {name!r} matches no part and no alias"
                    )
        print(f"checked {len(files)} knowledge file(s)")

    print(f"{len(registry)} registered part(s), {len(stats)} in the stats tables")

    if problems:
        print(f"\n{len(problems)} problem(s):\n", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    print("registry and stats tables agree")
    return 0


if __name__ == "__main__":
    sys.exit(main())
