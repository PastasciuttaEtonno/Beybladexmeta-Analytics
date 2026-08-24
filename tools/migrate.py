"""Applies the SQL migrations in migrations/, and records which ones ran.

Until now there was no runner and no record: 0007 and 0008 were applied to
production by piping the file over SSH, and nothing in the database says so.
That works exactly once per person who remembers. This keeps a
`schema_migrations` table so the question "is production up to date?" has an
answer that is not someone's memory.

The migrations predate this tool and are already applied everywhere, so an
existing database must be told that before anything else:

    python tools/migrate.py --url "$DATABASE_URL" --baseline   # once, per database
    python tools/migrate.py --url "$DATABASE_URL" --status
    python tools/migrate.py --url "$DATABASE_URL" --apply

Each migration runs inside its own transaction and is recorded in the same
transaction, so a failure leaves neither a half-applied file nor a false record.
Postgres runs DDL transactionally, which is what makes that possible.

Against production, go through the container:

    ssh ... "sudo docker exec -i <pg> psql -U postgres -d beyblade_tracker" < migrations/00NN_x.sql

is what this replaces — point --url at the database instead, or run the tool on
the server. Take a backup first either way.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"
NAME = re.compile(r"^(\d{4})_.+\.sql$")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     text PRIMARY KEY,
    name        text NOT NULL,
    checksum    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
)
"""


def discover() -> list[tuple[str, Path]]:
    """Numbered migrations, in order. An unnumbered file is a mistake, not a
    migration — ordering is the one thing this has to get right."""
    found = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        match = NAME.match(path.name)
        if match:
            found.append((match.group(1), path))
        elif path.name != "schema.sql":
            print(f"ignoring {path.name}: not named NNNN_description.sql", file=sys.stderr)
    return found


def checksum(path: Path) -> str:
    """L'impronta del CONTENUTO, non dei byte.

    I fine riga si normalizzano prima di calcolarla. Senza, la stessa
    migrazione dava due impronte diverse a seconda di come git l'aveva
    depositata sul disco: CRLF su Windows, LF su Linux e sul server. Il
    risultato era che `--status` annunciava "il database e il repo sono
    divergenti" per undici file che nessuno aveva toccato - cioe' lo strumento
    che esiste per accorgersi di una divergenza gridava al lupo, ed e' il modo
    piu' rapido di insegnare a ignorarlo.
    """
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()[:16]


def _impronta_storica(path: Path) -> str:
    """L'impronta com'era calcolata prima: byte grezzi.

    Serve solo a riconoscere le righe gia' registrate. Chi ha applicato una
    migrazione da Windows ha in archivio l'impronta dei byte con CRLF, e
    rifiutarla vorrebbe dire chiedere di ri-registrare a mano cio' che e'
    corretto. Le registrazioni nuove usano solo la forma normalizzata.
    """
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def concorda(registrata: str, path: Path) -> bool:
    """Vero se il file su disco e' quello che risulta applicato."""
    return registrata in (checksum(path), _impronta_storica(path))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="postgresql://... connection string")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--status", action="store_true", help="what is applied, what is pending")
    group.add_argument("--apply", action="store_true", help="run every pending migration")
    group.add_argument(
        "--baseline",
        action="store_true",
        help="record every migration as applied WITHOUT running it — for a database "
             "that already has this schema",
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

    migrations = discover()
    if not migrations:
        print(f"No migrations found in {MIGRATIONS}")
        return 1

    # asyncpg's URL scheme is not psycopg's.
    url = args.url.replace("postgresql+asyncpg://", "postgresql://")

    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(CREATE_TABLE)
        connection.commit()

        with connection.cursor() as cursor:
            cursor.execute("SELECT version, checksum FROM schema_migrations")
            applied = {row[0]: row[1] for row in cursor.fetchall()}

        pending = [(v, p) for v, p in migrations if v not in applied]

        if args.status:
            print(f"{MIGRATIONS}\n")
            for version, path in migrations:
                if version in applied:
                    changed = not concorda(applied[version], path)
                    mark = "CHANGED SINCE APPLIED" if changed else "applied"
                else:
                    mark = "PENDING"
                print(f"  {version}  {mark:22} {path.name}")
            print(f"\n{len(applied)} applied, {len(pending)} pending")
            # A file edited after it ran means the database and the repo disagree.
            drifted = [v for v, p in migrations
                       if v in applied and not concorda(applied[v], p)]
            if drifted:
                print(f"\nWARNING: {', '.join(drifted)} changed after being applied. "
                      "The database does not match the file; write a new migration "
                      "rather than editing an old one.")
                return 1
            return 0

        if args.baseline:
            if not pending:
                print("Nothing to baseline; every migration is already recorded.")
                return 0
            with connection.cursor() as cursor:
                for version, path in pending:
                    cursor.execute(
                        "INSERT INTO schema_migrations (version, name, checksum) "
                        "VALUES (%s, %s, %s)",
                        (version, path.name, checksum(path)),
                    )
            connection.commit()
            print(f"Recorded {len(pending)} migration(s) as applied, without running them:")
            for version, path in pending:
                print(f"  {version}  {path.name}")
            return 0

        if not pending:
            print("Already up to date.")
            return 0

        for version, path in pending:
            print(f"applying {path.name} ... ", end="", flush=True)
            try:
                with connection.cursor() as cursor:
                    cursor.execute(path.read_text(encoding="utf-8"))
                    cursor.execute(
                        "INSERT INTO schema_migrations (version, name, checksum) "
                        "VALUES (%s, %s, %s)",
                        (version, path.name, checksum(path)),
                    )
                connection.commit()
                print("ok")
            except Exception as exc:
                connection.rollback()
                print("FAILED")
                print(f"\n{path.name} was rolled back and NOT recorded:\n{exc}", file=sys.stderr)
                return 1

        print(f"\nApplied {len(pending)} migration(s).")
        return 0


if __name__ == "__main__":
    sys.exit(main())
