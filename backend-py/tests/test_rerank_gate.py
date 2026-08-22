"""La soglia di astensione non deve mai essere applicata a punteggi di altra scala.

E' l'errore che il sistema ha gia' commesso una volta: NullReranker restituiva
"riuscito" invece di "punteggi non utilizzabili", quindi hybrid() confrontava
RERANK_FLOOR (0,30) con i punteggi RRF (intorno a 0,016) e si asteneva su ogni
domanda. La valutazione crollo' da 15/15 a 2/15, e gli unici casi superati erano
quelli in cui astenersi era la risposta giusta - il modo piu' insidioso in cui
un test puo' restare verde mentre tutto il resto e' rotto.
"""

from __future__ import annotations

import pytest

from app.lib.rag.rerank import NullReranker
from app.lib.rag.search import RRF_K, Hit, rrf_fuse


def hit(chunk_id: int) -> Hit:
    return Hit(chunk_id=chunk_id, document_id=chunk_id, source_path=f"{chunk_id}.md",
               slug=None, heading=None, text="", score=0.0, branch="dense",
               code_tokens=[])


@pytest.mark.asyncio
async def test_null_reranker_reports_its_scores_as_unusable():
    ranked, usable = await NullReranker().rerank("q", [hit(1), hit(2)], top_k=2)
    assert ranked
    assert usable is False


def test_rrf_scores_live_far_below_the_rerank_floor():
    """Il fatto numerico da cui nasce il bug: il miglior punteggio RRF possibile
    con un solo ramo e' 1/(k+1), circa 0,016. Qualunque soglia pensata per un
    cross-encoder lo scarta."""
    from app.lib.rag.search import RERANK_FLOOR

    best_possible = 1.0 / (RRF_K + 1)
    assert best_possible < RERANK_FLOOR
    fused = rrf_fuse({"dense": [hit(1)]})
    assert fused[0].score == pytest.approx(best_possible)


@pytest.mark.asyncio
async def test_null_reranker_preserves_order_and_applies_top_k():
    hits = [hit(i) for i in range(5)]
    ranked, _ = await NullReranker().rerank("q", hits, top_k=3)
    assert [h.chunk_id for h in ranked] == [0, 1, 2]
