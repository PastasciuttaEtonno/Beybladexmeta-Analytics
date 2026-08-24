"""Measures retrieval against eval/golden_set.yaml.

This is the number M2 has to beat. Building the hybrid search first and
measuring afterwards would leave no way to tell whether RRF and the re-ranker
helped, hurt, or did nothing - so the baseline is taken now, while the system is
simple enough that the number is easy to explain.

    python tools/eval_retrieval.py --url "$DATABASE_URL"
    python tools/eval_retrieval.py --url "$DATABASE_URL" --provider voyage --k 10

What is measured, per case:

  recall@k     did every expected slug appear in the top k of the union of the
               branches. All of them, not one of them: a question naming two
               parts is answered badly if only one is found.
  forbidden    did a slug that must NOT appear show up anyway. This is how the
               optimus-prime / optimus-primal pair is kept honest.
  abstention   for a question that should retrieve nothing, did it retrieve
               nothing.

A caveat the output repeats, because it is easy to forget: with
--provider deterministic the dense branch is hash noise. Its numbers mean
nothing. The exact and full-text branches are real either way.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
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

    passed = 0
    pending = 0
    failures: list[str] = []
    by_tag: dict[str, list[bool]] = defaultdict(list)

    try:
        async with factory() as session:
            for case in cases:
                query = case["query"]
                expected = set(case.get("expected_docs") or [])
                # Rule and guide documents are not about one part, so they have
                # no slug and can only be named by path.
                expected_paths = set(case.get("expected_paths") or [])
                forbidden = set(case.get("forbidden_docs") or [])
                expect_none = bool(case.get("expected_none"))
                # Il caso appartiene a uno strato che ancora non esiste:
                # contarlo come fallito misurerebbe la roadmap, non il sistema.
                routing = case.get("expected_routing")
                tags = case.get("tags") or []

                if routing or (not expected and not expected_paths and not expect_none):
                    # expected_docs is empty and nothing else is asserted: the
                    # case is a placeholder waiting for a scheda to exist.
                    pending += 1
                    continue

                report = await retrieval.hybrid(
                    session, query, embedder, limit=args.k, reranker=reranker)
                hits, entities, abstained = report.hits, report.entities, report.abstained
                found = {hit.slug for hit in hits if hit.slug}
                found_paths = {hit.source_path for hit in hits}

                if expect_none:
                    ok = abstained
                    detail = ("abstained" if abstained
                              else f"expected abstention, got {len(hits)} hit(s)")
                else:
                    missing = (expected - found) | (expected_paths - found_paths)
                    leaked = forbidden & found
                    ok = not missing and not leaked
                    detail = ""
                    if missing:
                        detail += f"missing {sorted(missing)} "
                    if leaked:
                        detail += f"returned forbidden {sorted(leaked)}"

                passed += ok
                for tag in tags:
                    by_tag[tag].append(ok)
                if not ok:
                    failures.append(f"  {case['id']:28} {detail.strip()}")

        scored = len(cases) - pending
        print(f"provider {embedder.name}   rerank {reranker.name}   k={args.k}")
        if args.provider in ("deterministic", "fake"):
            print("NOTE: the dense branch is hash noise under this provider; only the")
            print("      exact and full-text branches carry meaning here.")
        print()
        print(f"{passed}/{scored} case(s) passed"
              + (f", {pending} in attesa (scheda da scrivere o strato non ancora "
                 f"costruito)" if pending else ""))
        if by_tag:
            print("\nby tag")
            for tag, results in sorted(by_tag.items()):
                print(f"  {tag:16} {sum(results)}/{len(results)}")
        if failures:
            print("\nfailing")
            print("\n".join(failures))
        return 0 if passed == scored else 1
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--golden", default=str(REPO / "eval" / "golden_set.yaml"))
    parser.add_argument("--provider", default="deterministic")
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--rerank", default="none",
                        help="rerank-2-lite, rerank-2.5-lite, ... oppure none")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
