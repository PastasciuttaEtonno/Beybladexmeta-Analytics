"""La stessa domanda al database, una volta sola.

Il bug osservato in dev: il modello ha chiamato `current_meta` tre volte con gli
stessi argomenti dentro un solo turno. Tre interrogazioni identiche, tre copie
dello stesso risultato nel contesto, tre chip nell'interfaccia.
"""

from __future__ import annotations

import pytest

from app.lib.rag.generate import _ToolCache
from app.lib.rag.providers import ToolCall


class _Spy:
    """Conta le esecuzioni vere, che e' esattamente cio' che il test misura."""

    def __init__(self) -> None:
        self.executed: list[tuple[str, dict]] = []

    async def call_tool(self, session, name, arguments):
        self.executed.append((name, arguments))
        return {"rows": [], "sample_size": len(self.executed), "as_of": None}


@pytest.fixture
def spy(monkeypatch):
    from app.lib.rag import generate

    spy = _Spy()
    monkeypatch.setattr(generate.tools, "call_tool", spy.call_tool)
    return spy


def _call(name: str, **arguments) -> ToolCall:
    return ToolCall(id=f"c{id(arguments)}", name=name, arguments=arguments)


@pytest.mark.asyncio
async def test_a_repeated_call_does_not_touch_the_database_twice(spy):
    cache = _ToolCache()
    await cache.run(None, _call("current_meta", slot="blade"))
    await cache.run(None, _call("current_meta", slot="blade"))

    assert len(spy.executed) == 1


@pytest.mark.asyncio
async def test_the_repetition_still_receives_its_result(spy):
    """Il punto delicato: il protocollo pretende un tool_result per ogni
    call_id. Saltare la risposta lascerebbe il modello ad aspettare."""
    cache = _ToolCache()
    first, was_cached_first = await cache.run(None, _call("current_meta", slot="blade"))
    second, was_cached_second = await cache.run(None, _call("current_meta", slot="blade"))

    assert second == first
    assert (was_cached_first, was_cached_second) == (False, True)


@pytest.mark.asyncio
async def test_argument_order_is_not_a_different_question(spy):
    """sort_keys nella chiave: due dizionari con le stesse coppie in ordine
    diverso sono la stessa interrogazione."""
    cache = _ToolCache()
    await cache.run(None, ToolCall(id="a", name="top_combos",
                                   arguments={"slot": "blade", "limit": 5}))
    await cache.run(None, ToolCall(id="b", name="top_combos",
                                   arguments={"limit": 5, "slot": "blade"}))

    assert len(spy.executed) == 1


@pytest.mark.asyncio
async def test_different_arguments_are_different_questions(spy):
    """La cache non deve zittire una domanda diversa: sarebbe molto peggio del
    lavoro sprecato che evita."""
    cache = _ToolCache()
    await cache.run(None, _call("component_ranking", slot="blade"))
    await cache.run(None, _call("component_ranking", slot="bit"))

    assert len(spy.executed) == 2


@pytest.mark.asyncio
async def test_a_repetition_is_recorded_once(spy):
    """`calls` alimenta le chip dell'interfaccia e la colonna tool_calls: una
    ripetizione non e' un'interrogazione in piu' da mostrare."""
    cache = _ToolCache()
    for _ in range(3):
        await cache.run(None, _call("current_meta", slot="blade"))

    assert len(cache.calls) == 1
    assert len(cache.results) == 1


@pytest.mark.asyncio
async def test_seen_reports_before_the_call_is_run(spy):
    """Il percorso streaming lo interroga per decidere se emettere lo status
    'interrogo le statistiche' prima di eseguire."""
    cache = _ToolCache()
    call = _call("current_meta", slot="blade")

    assert cache.seen(call) is False
    await cache.run(None, call)
    assert cache.seen(call) is True
