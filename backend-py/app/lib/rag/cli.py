"""Command line for the knowledge base, so retrieval can be judged before any
model is put in front of it.

    python -m app.lib.rag.cli ingest --provider deterministic
    python -m app.lib.rag.cli search "come si comporta il 9-60 contro un attacco"
    python -m app.lib.rag.cli stats

DATABASE_URL comes from the environment, the same one the application reads.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.lib.rag import search as retrieval
from app.lib.rag.env import load_env
from app.lib.rag.embeddings import get_embedder
from app.lib.rag.ingest import ingest

REPO = Path(__file__).resolve().parents[4]
KNOWLEDGE = REPO / "knowledge"


load_env()


def _url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("DATABASE_URL is not set", file=sys.stderr)
        raise SystemExit(1)
    for prefix, replacement in (
        ("postgresql+asyncpg://", "postgresql+asyncpg://"),
        ("postgresql://", "postgresql+asyncpg://"),
        ("postgres://", "postgresql+asyncpg://"),
    ):
        if url.startswith(prefix):
            return url.replace(prefix, replacement, 1)
    return url


def _sessionmaker():
    engine = create_async_engine(_url(), pool_pre_ping=True)
    return engine, async_sessionmaker(engine, expire_on_commit=False)


async def cmd_ingest(args) -> int:
    engine, factory = _sessionmaker()
    # Resolved, because source_path is stored relative to the repo root and a
    # relative argument has nothing to be made relative to.
    knowledge = Path(args.knowledge).resolve()
    if not knowledge.is_dir():
        print(f"{knowledge} does not exist", file=sys.stderr)
        return 1
    try:
        async with factory() as session:
            report = await ingest(
                session, knowledge, get_embedder(args.provider), repo_root=REPO
            )
        print(report.summary())
        if report.empty:
            print(
                f"\n{len(report.empty)} scaffolded file(s) have no written section yet "
                f"and were not ingested:"
            )
            for path in report.empty[:10]:
                print(f"  {path}")
            if len(report.empty) > 10:
                print(f"  ... and {len(report.empty) - 10} more")
        return 0
    finally:
        await engine.dispose()


async def cmd_search(args) -> int:
    engine, factory = _sessionmaker()
    embedder = get_embedder(args.provider)
    try:
        async with factory() as session:
            entities = await retrieval.link_entities(session, args.query)
            print(f"query    {args.query!r}")
            print(f"entities slugs={entities.slugs or '-'}  codes={entities.codes or '-'}")
            print()

            branches = [
                ("dense", await retrieval.dense(
                    session, args.query, embedder, limit=args.limit, entities=entities)),
                ("fulltext", await retrieval.fulltext(
                    session, args.query, limit=args.limit, entities=entities)),
                ("exact", await retrieval.exact(session, entities, limit=args.limit)),
            ]
            for name, hits in branches:
                print(f"--- {name} ({len(hits)}) ---")
                if not hits:
                    print("    nothing")
                for hit in hits[: args.limit]:
                    heading = hit.heading or "(preamble)"
                    snippet = " ".join(hit.text.split())[:96]
                    print(f"  {hit.score:6.3f}  {hit.source_path} :: {heading}")
                    print(f"          {snippet}")
                print()
        return 0
    finally:
        await engine.dispose()


async def cmd_stats(args) -> int:
    engine, factory = _sessionmaker()
    try:
        async with factory() as session:
            rows = await session.execute(text(
                "SELECT (SELECT count(*) FROM kb_document WHERE superseded_at IS NULL), "
                "       (SELECT count(*) FROM kb_document WHERE superseded_at IS NOT NULL), "
                "       (SELECT count(*) FROM kb_chunk), "
                "       (SELECT count(*) FROM component_registry)"
            ))
            live, superseded, chunks, parts = rows.one()
            print(f"{live} live document(s), {superseded} superseded")
            print(f"{chunks} chunk(s)")
            print(f"{parts} registered part(s)")

            # Solo i chunk vivi: quelli delle versioni superate restano per
            # risolvere le citazioni vecchie e non partecipano al recupero.
            models = await session.execute(text(
                "SELECT c.embedding_model, count(*) FROM kb_chunk c "
                "JOIN kb_document d ON d.id = c.document_id "
                "WHERE d.superseded_at IS NULL "
                "GROUP BY c.embedding_model ORDER BY 2 DESC"
            ))
            live_models = list(models)
            for model, count in live_models:
                print(f"  {count:5} chunk(s) from {model}")

            # Un corpus vivo con due modelli e' rotto in modo silenzioso: le
            # distanze non sono confrontabili fra i due gruppi, e il ramo denso
            # filtra per modello, quindi una parte del corpus diventa invisibile
            # senza che nulla lo segnali. Meglio dirlo qui.
            if len(live_models) > 1:
                print("\nATTENZIONE: il corpus vivo contiene piu' di un modello di")
                print("embedding. Le distanze non sono confrontabili fra loro e il")
                print("ramo denso vede solo i chunk del modello interrogato.")
                print("Rilancia l'ingest con un solo --provider per allinearli.")
        return 0
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(prog="rag", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("ingest", help="read knowledge/ into the database")
    p.add_argument("--knowledge", default=str(KNOWLEDGE))
    p.add_argument("--provider", default="deterministic",
                   help="voyage, or deterministic to run without an API key")
    p.set_defaults(run=cmd_ingest)

    p = sub.add_parser("search", help="run the retrieval branches and print the top hits")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--provider", default="deterministic")
    p.set_defaults(run=cmd_search)

    p = sub.add_parser("stats", help="what is in the corpus")
    p.set_defaults(run=cmd_stats)

    args = parser.parse_args()
    return asyncio.run(args.run(args))


if __name__ == "__main__":
    sys.exit(main())
