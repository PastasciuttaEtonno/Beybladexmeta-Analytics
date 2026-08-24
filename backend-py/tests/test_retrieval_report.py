"""hybrid() come rapporto, non come tupla.

Prima tornava (hits, entities, abstained): abbastanza per rispondere, non per
capire una risposta sbagliata. La domanda che si fa sempre - quale ramo ha
trovato i candidati, il re-rank ha funzionato, l'astensione da dove viene - non
aveva appiglio.

Il caso peggiore e' l'astensione: nessun testo da leggere, nessuna fonte da
controllare. `reason` e' l'unica traccia che resta.
"""

from __future__ import annotations

import pytest

from app.lib.rag import search
from app.lib.rag.search import Entities, Hit


def hit(slug: str, score: float = 0.8, branch: str = "dense") -> Hit:
    return Hit(chunk_id=abs(hash(slug)) % 10000, document_id=1,
               source_path=f"knowledge/blades/{slug}.md", slug=slug,
               heading="Profilo", text="…", score=score, branch=branch,
               code_tokens=[])


@pytest.fixture
def branches(monkeypatch):
    """I tre rami diventano pilotabili: qui si prova l'orchestrazione."""
    state = {"dense": [], "fulltext": [], "exact": [], "entities": Entities([], [])}

    async def fake_entities(session, query):
        return state["entities"]

    async def fake_dense(session, query, embedder, **kw):
        return state["dense"]

    async def fake_fulltext(session, query, **kw):
        return state["fulltext"]

    async def fake_exact(session, entities, **kw):
        return state["exact"]

    monkeypatch.setattr(search, "link_entities", fake_entities)
    monkeypatch.setattr(search, "dense", fake_dense)
    monkeypatch.setattr(search, "fulltext", fake_fulltext)
    monkeypatch.setattr(search, "exact", fake_exact)
    return state


class _Reranker:
    """Un re-ranker pilotabile. `ok` e' il valore che conta: dice se esistono
    punteggi confrontabili, non se la chiamata e' andata a buon fine."""

    def __init__(self, hits, ok=True):
        self._hits, self._ok = hits, ok

    async def rerank(self, query, candidates, top_k):
        return self._hits[:top_k], self._ok


@pytest.mark.asyncio
async def test_every_branch_is_counted(branches):
    branches["entities"] = Entities(["wizard-rod"], [])
    branches["dense"] = [hit("wizard-rod"), hit("silver-wolf")]
    branches["fulltext"] = [hit("wizard-rod", branch="fulltext")]

    report = await search.hybrid(None, "wizard rod", object(), limit=5)

    assert report.branch_counts == {"dense": 2, "fulltext": 1, "exact": 0}


@pytest.mark.asyncio
async def test_a_dead_branch_is_visible(branches):
    """Un ramo sempre a zero e' un ramo rotto. Senza il conteggio gli altri due
    coprono l'assenza e il sistema sembra funzionare."""
    branches["entities"] = Entities(["wizard-rod"], [])
    branches["dense"] = [hit("wizard-rod")]

    report = await search.hybrid(None, "wizard rod", object(), limit=5)

    assert report.branch_counts["fulltext"] == 0
    assert report.branch_counts["exact"] == 0


@pytest.mark.asyncio
async def test_an_off_topic_question_says_why_it_abstained(branches):
    """Nessuna entita', nessun full-text, nessuna sigla: l'unico segnale e'
    "questi sono i chunk meno lontani", che per una domanda fuori tema e' vero
    e privo di significato."""
    branches["dense"] = [hit("hexa"), hit("kick")]

    report = await search.hybrid(None, "che tempo fa a Milano", object(), limit=5)

    assert report.abstained is True
    assert report.hits == []
    assert report.reason == "corroborazione insufficiente"


@pytest.mark.asyncio
async def test_a_named_part_without_a_scheda_abstains_with_its_own_reason(branches):
    """Il filtro rigido restringe al pezzo nominato, la sua scheda non esiste, e
    tutti i rami tornano vuoti. E' un'astensione diversa dalla precedente e va
    distinta: qui la cura e' scrivere una scheda, non aggiustare il recupero."""
    branches["entities"] = Entities(["pezzo-senza-scheda"], [])

    report = await search.hybrid(None, "parlami del pezzo", object(), limit=5)

    assert report.abstained is True
    assert report.reason == "nessun candidato dopo il filtro rigido"
    assert report.fused_count == 0


@pytest.mark.asyncio
async def test_a_degraded_reranker_is_reported_not_hidden(branches, caplog):
    """ok=False significa "punteggi non utilizzabili". Non e' fatale - si va
    avanti con l'ordine della fusione - ma la soglia di astensione e' tarata su
    quei punteggi, quindi il sistema sta girando con una rete in meno e deve
    dirlo."""
    branches["entities"] = Entities(["wizard-rod"], [])
    branches["dense"] = [hit("wizard-rod")]
    reranker = _Reranker([hit("wizard-rod", score=0.02)], ok=False)

    with caplog.at_level("ERROR"):
        report = await search.hybrid(None, "wizard rod", object(),
                                     limit=5, reranker=reranker)

    assert report.reranked is False
    assert any("degradato" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_a_degraded_reranker_does_not_trigger_the_threshold(branches):
    """Il bug che costo' quindici casi su quindici: con ok=True erroneo, la
    soglia veniva confrontata con punteggi RRF (~0,016) e il sistema si asteneva
    su OGNI domanda. Il punteggio non confrontabile non deve passare dal
    cancello."""
    branches["entities"] = Entities(["wizard-rod"], [])
    branches["dense"] = [hit("wizard-rod")]
    reranker = _Reranker([hit("wizard-rod", score=0.016)], ok=False)

    report = await search.hybrid(None, "wizard rod", object(),
                                 limit=5, reranker=reranker)

    assert report.abstained is False
    assert report.hits


@pytest.mark.asyncio
async def test_a_low_rerank_score_abstains_and_records_it(branches):
    branches["entities"] = Entities(["wizard-rod"], [])
    branches["dense"] = [hit("wizard-rod")]
    reranker = _Reranker([hit("wizard-rod", score=0.10)], ok=True)

    report = await search.hybrid(None, "wizard rod", object(),
                                 limit=5, reranker=reranker)

    assert report.abstained is True
    assert report.reason == "sotto la soglia di pertinenza"
    assert report.top_score == pytest.approx(0.10)


@pytest.mark.asyncio
async def test_the_report_serialises_for_storage(branches):
    """to_dict() alimenta chat_message.retrieval: se non e' serializzabile la
    telemetria non sopravvive alla richiesta che doveva spiegare."""
    import json

    branches["entities"] = Entities(["wizard-rod"], ["9-60"])
    branches["dense"] = [hit("wizard-rod")]

    report = await search.hybrid(None, "wizard rod 9-60", object(), limit=5)
    payload = report.to_dict()

    assert json.loads(json.dumps(payload))["slugs"] == ["wizard-rod"]
    assert payload["codes"] == ["9-60"]
    assert payload["reason"] is None
