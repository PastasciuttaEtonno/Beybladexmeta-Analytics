"""Il prompt caching, verificato invece che presunto.

La cache non cambia le risposte: cambia il conto. Quindi quando smette di
funzionare - per un blocco spostato, per un prompt che varia a ogni avvio, per
un TTL scaduto - non c'e' nessun sintomo da notare. L'unico segnale possibile
sono i token riletti, e solo se qualcuno li raccoglie.

Due cose da tenere ferme: che il marcatore stia sul pezzo giusto, e che i
numeri arrivino fino a chi guarda.
"""

from __future__ import annotations

import pytest

from app.lib.rag import generate
from app.lib.rag.providers import ModelReply, ToolCall

from tests.test_generate import ScriptedModel, hit  # riuso dei doppi


@pytest.fixture
def patched(monkeypatch):
    """Sostituisce il recupero: qui si misurano i token, non la ricerca."""
    from app.lib.rag import search

    async def fake_hybrid(session, question, embedder, **kwargs):
        return search.Retrieval(hits=[hit("knowledge/blades/wizard-rod.md")],
                                entities=search.Entities([], []), abstained=False)

    monkeypatch.setattr(generate.search, "hybrid", fake_hybrid)
    monkeypatch.setattr(generate, "get_embedder", lambda *a, **k: object())
    monkeypatch.setattr(generate, "get_reranker", lambda *a, **k: object())


def test_the_marker_sits_on_the_stable_block():
    """Prompt di sistema e definizioni degli strumenti sono identici a ogni
    richiesta: e' li' che la cache rende. Il contesto recuperato cambia sempre e
    deve restare DOPO il punto di taglio - marcarlo scriverebbe una voce nuova a
    ogni domanda, pagando il sovrapprezzo della scrittura senza mai rileggerla.
    """
    import inspect

    from app.lib.rag import providers

    source = inspect.getsource(providers._ClaudeConversation)
    # Il marcatore compare solo accanto al prompt di sistema, in entrambe le
    # strade (sincrona e streaming): due occorrenze, non di piu'.
    assert source.count('"cache_control"') == 2

    # Ogni marcatore sta dentro il blocco system=[...]: la riga precedente lo
    # apre. Se un giorno finisse accanto a `messages`, il contesto recuperato
    # verrebbe scritto in cache a ogni domanda - si pagherebbe il sovrapprezzo
    # della scrittura senza mai rileggerla, cioe' il contrario dello scopo.
    lines = source.splitlines()
    marked = [i for i, line in enumerate(lines) if '"cache_control"' in line]
    assert len(marked) == 2
    for i in marked:
        assert "self._system" in lines[i - 1], lines[i - 1]


def test_the_reply_carries_the_cache_counters():
    """Restano a zero sui fornitori che non espongono la cache, ed e' corretto:
    zero letture dove non c'e' cache non e' un guasto."""
    reply = ModelReply(text="x")

    assert reply.cache_read_tokens == 0
    assert reply.cache_write_tokens == 0


def test_the_accumulator_sums_across_tool_rounds():
    """Un turno con strumenti sono piu' richieste, e la cache si rilegge a ogni
    giro: sommare solo la prima direbbe un numero molto piu' basso del vero."""
    usage = generate._Usage()
    usage.add(ModelReply(input_tokens=100, output_tokens=10,
                         cache_write_tokens=5000, cache_read_tokens=0))
    usage.add(ModelReply(input_tokens=120, output_tokens=30,
                         cache_write_tokens=0, cache_read_tokens=5000))
    usage.add(ModelReply(input_tokens=140, output_tokens=50,
                         cache_write_tokens=0, cache_read_tokens=5000))

    assert usage.to_dict() == {"input": 360, "output": 90,
                               "cache_write": 5000, "cache_read": 10000}


@pytest.mark.asyncio
async def test_the_numbers_reach_the_answer(patched, monkeypatch):
    """Raccoglierli e non riportarli e' come non raccoglierli."""
    async def fake_call_tool(session, name, arguments):
        return {"rows": [], "sample_size": 1}

    monkeypatch.setattr(generate.tools, "call_tool", fake_call_tool)
    model = ScriptedModel(
        ModelReply(tool_calls=[ToolCall("t1", "top_combos", {})],
                   input_tokens=100, cache_write_tokens=4000),
        ModelReply(text="ecco", input_tokens=50, cache_read_tokens=4000),
    )

    answer = await generate.answer(None, "domanda", model=model)

    assert answer.cache_tokens == {"cache_write": 4000, "cache_read": 4000}
    assert answer.to_dict()["usage"]["cache_read"] == 4000


@pytest.mark.asyncio
async def test_a_cache_that_never_reads_is_visible(patched, monkeypatch):
    """Il caso da scoprire: si scrive sempre e non si rilegge mai. Il conto
    cresce, le risposte restano giuste, e senza questo numero non c'e' niente
    da notare."""
    async def fake_call_tool(session, name, arguments):
        return {"rows": [], "sample_size": 1}

    monkeypatch.setattr(generate.tools, "call_tool", fake_call_tool)
    model = ScriptedModel(
        ModelReply(tool_calls=[ToolCall("t1", "top_combos", {})],
                   cache_write_tokens=4000),
        ModelReply(text="ecco", cache_write_tokens=4000),
    )

    answer = await generate.answer(None, "domanda", model=model)

    assert answer.cache_tokens["cache_write"] == 8000
    assert answer.cache_tokens["cache_read"] == 0
