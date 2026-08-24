"""Misura dove separare "pertinente" da "fuori tema" sul punteggio del re-ranker.

RERANK_FLOOR in app/lib/rag/search.py non va scelto a occhio. Questo strumento
esegue il golden set e stampa, per ogni caso, il punteggio del miglior candidato
dopo il re-rank, diviso fra i casi che devono trovare qualcosa e quelli che
devono astenersi. La soglia giusta e' un valore nel mezzo, e se un valore nel
mezzo non esiste il punteggio da solo non basta - cosa che e' meglio scoprire
qui che in produzione.

    python tools/calibrate_abstention.py --url "$DATABASE_URL" --provider voyage

Stessa logica usata per la soglia dei refusi in search.py: si guarda la coppia
piu' vicina fra le due popolazioni e si sceglie in mezzo, invece di ereditare un
numero da un altro dataset.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend-py"))

import yaml  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.lib.rag import search as retrieval  # noqa: E402
from app.lib.rag.env import load_env  # noqa: E402
from app.lib.rag.embeddings import get_embedder  # noqa: E402
from app.lib.rag.rerank import get_reranker  # noqa: E402

load_env()


def _async_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return url.replace(prefix, "postgresql+asyncpg://", 1)
    return url


async def run(args) -> int:
    cases = yaml.safe_load(Path(args.golden).read_text(encoding="utf-8"))["cases"]
    engine = create_async_engine(_async_url(args.url), pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    embedder = get_embedder(args.provider)
    reranker = get_reranker(args.rerank)

    scored = 0
    relevant: list[tuple[float, str]] = []
    off_topic: list[tuple[float, str]] = []

    try:
        async with factory() as session:
            for case in cases:
                expects_nothing = bool(case.get("expected_none"))
                wants = case.get("expected_docs") or case.get("expected_paths")
                if not expects_nothing and not wants:
                    continue

                entities = await retrieval.link_entities(session, case["query"])
                branches = {
                    "dense": await retrieval.dense(
                        session, case["query"], embedder, limit=20, entities=entities),
                    "fulltext": await retrieval.fulltext(
                        session, case["query"], limit=20, entities=entities),
                    "exact": await retrieval.exact(session, entities, limit=20),
                }
                fused = retrieval.rrf_fuse(branches, limit=20)
                # Passo lento: sul free tier il budget e' di circa 3.000
                # token al minuto e ogni rerank ne consuma un paio di
                # migliaia. Senza pausa la calibrazione finisce a meta'
                # contro un 429 e produce una soglia su meta' dei casi.
                if scored:
                    time.sleep(args.pause)
                scored += 1
                ranked, ok = await reranker.rerank(case["query"], fused, top_k=5)
                top = ranked[0].score if (ok and ranked) else 0.0
                (off_topic if expects_nothing else relevant).append((top, case["id"]))
    finally:
        await engine.dispose()

    print(f"provider {embedder.name}   rerank {reranker.name}\n")
    for label, rows in (("PERTINENTI", relevant), ("FUORI TEMA", off_topic)):
        print(f"--- {label} ---")
        for score, case_id in sorted(rows):
            print(f"  {score:6.3f}  {case_id}")
        print()

    if not relevant or not off_topic:
        print("Serve almeno un caso per popolazione per poter calibrare.")
        return 1

    worst_relevant = min(s for s, _ in relevant)
    best_off_topic = max(s for s, _ in off_topic)
    print(f"pertinente piu' basso : {worst_relevant:.3f}")
    print(f"fuori tema piu' alto  : {best_off_topic:.3f}")

    if best_off_topic >= worst_relevant:
        print("\nLe due popolazioni si sovrappongono: nessuna soglia le separa.")
        print("Il punteggio del re-ranker da solo non basta, e alzarlo comunque")
        print("scarterebbe risposte buone. Tenere la regola per corroborazione.")
        return 1

    suggested = round((worst_relevant + best_off_topic) / 2, 2)
    print(f"\nsoglia suggerita      : {suggested:.2f}   (attuale "
          f"{retrieval.RERANK_FLOOR})")
    print("Sta in mezzo alle due popolazioni, quindi non scarta nessun caso")
    print("pertinente e ferma tutti quelli fuori tema di questo insieme.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--golden", default=str(REPO / "eval" / "golden_set.yaml"))
    parser.add_argument("--provider", default="voyage")
    parser.add_argument("--rerank", default="rerank-2.5-lite")
    parser.add_argument("--pause", type=float, default=1.0,
                        help="secondi fra un rerank e l'altro. Il default vale "
                             "per il Tier 1; senza metodo di pagamento servono "
                             "~50 secondi o la calibrazione muore a meta'")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
