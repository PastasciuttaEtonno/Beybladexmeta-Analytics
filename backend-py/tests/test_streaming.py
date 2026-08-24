"""Il gate di M5: streaming e non-streaming devono dare la stessa risposta.

Non e' una verifica di comodo. Se le due strade divergessero, ogni misura presa
con la valutazione - che usa answer() - varrebbe per una versione del sistema
diversa da quella che gli utenti usano davvero. Il golden set misurerebbe
qualcosa che nessuno vede.

La proprieta' e' garantita per costruzione: answer_stream() esegue gli stessi
passi nello stesso ordine, e l'adattatore restituisce la stessa ModelReply che
restituirebbe senza streaming. Questi test difendono quella costruzione.
"""

from __future__ import annotations

import pytest

from app.lib.rag import generate, search
from app.lib.rag.providers import ModelReply, ToolCall


class StreamingConversation:
    """Un modello finto che consegna il testo a pezzi, come farebbe uno vero."""

    def __init__(self, replies, log):
        self._replies = list(replies)
        self._log = log

    def _next(self) -> ModelReply:
        return self._replies.pop(0) if self._replies else ModelReply(text="fine")

    async def _emit(self, reply: ModelReply, on_delta) -> ModelReply:
        if on_delta is not None and reply.text:
            # Tre pezzi: quello che conta e' che il testo arrivi spezzato e che
            # la somma dei pezzi coincida con reply.text.
            size = max(1, len(reply.text) // 3)
            for start in range(0, len(reply.text), size):
                on_delta(reply.text[start:start + size])
        return reply

    async def ask(self, question, on_delta=None) -> ModelReply:
        self._log.append({"kind": "ask", "question": question})
        return await self._emit(self._next(), on_delta)

    async def give_tool_results(self, results, on_delta=None) -> ModelReply:
        self._log.append({"kind": "tool_results", "results": list(results)})
        return await self._emit(self._next(), on_delta)


class StreamingModel:
    name = "finto-streaming"

    def __init__(self, *replies: ModelReply):
        self._replies = replies
        self.log: list[dict] = []

    def conversation(self, *, system, tool_definitions, history=None):
        return StreamingConversation(self._replies, self.log)


def hit(path: str) -> search.Hit:
    return search.Hit(chunk_id=1, document_id=1, source_path=path, slug=None,
                      heading="Profilo", text="testo", score=0.9, branch="dense",
                      code_tokens=[])


@pytest.fixture
def patched(monkeypatch):
    state = {"hits": [hit("knowledge/blades/wizard-rod.md")], "abstained": False}

    async def fake_hybrid(session, question, embedder, **kwargs):
        return search.Retrieval(hits=state["hits"], entities=search.Entities([], []),
                                abstained=state["abstained"])

    monkeypatch.setattr(generate.search, "hybrid", fake_hybrid)
    monkeypatch.setattr(generate, "get_embedder", lambda *a, **k: object())
    monkeypatch.setattr(generate, "get_reranker", lambda *a, **k: object())
    return state


async def collect(model, question="domanda") -> list[dict]:
    return [item async for item in generate.answer_stream(None, question, model=model)]


async def test_the_deltas_reassemble_into_the_final_text(patched):
    """Se la somma dei frammenti non fosse il testo finale, l'utente leggerebbe
    una risposta diversa da quella salvata nella cronologia."""
    testo = "Il WizardRod tiene la rotazione [[knowledge/blades/wizard-rod.md]]."
    events = await collect(StreamingModel(ModelReply(text=testo)))

    deltas = "".join(e["text"] for e in events if e["event"] == "delta")
    done = next(e for e in events if e["event"] == "done")
    assert deltas == testo
    assert done["text"] == testo


async def test_sources_arrive_before_any_text(patched):
    """E' il motivo per cui esiste l'evento: chi legge vede su cosa si basera'
    la risposta prima che la risposta cominci."""
    events = await collect(StreamingModel(ModelReply(text="qualcosa")))
    kinds = [e["event"] for e in events]
    assert kinds.index("sources") < kinds.index("delta")


async def test_status_comes_first_of_all(patched):
    """Con una latenza mediana di dieci secondi, il primo evento non puo' essere
    la risposta: deve essere qualcosa che dica che si sta lavorando."""
    events = await collect(StreamingModel(ModelReply(text="x")))
    assert events[0]["event"] == "status"


async def test_a_tool_event_carries_the_sample_size(patched, monkeypatch):
    """La numerosita' campionaria arriva all'interfaccia come dato strutturato,
    non solo dentro la prosa: cosi' si puo' mostrare accanto al risultato anche
    se il modello si dimentica di scriverla."""
    async def fake_call_tool(session, name, arguments):
        return {"rows": [], "sample_size": 7, "as_of": "2026-01-16",
                "notes": ["Campione ridotto: 7 piazzamenti."]}

    monkeypatch.setattr(generate.tools, "call_tool", fake_call_tool)
    model = StreamingModel(
        ModelReply(tool_calls=[ToolCall("t1", "component_usage", {})]),
        ModelReply(text="risposta"),
    )
    events = await collect(model)

    tool_event = next(e for e in events if e["event"] == "tool")
    assert tool_event["sample_size"] == 7
    assert tool_event["notes"]


async def test_abstention_streams_the_same_text_it_returns(patched):
    patched["abstained"] = True
    patched["hits"] = []
    events = await collect(StreamingModel(ModelReply(text="non dovrei parlare")))

    done = next(e for e in events if e["event"] == "done")
    deltas = "".join(e["text"] for e in events if e["event"] == "delta")
    assert done["abstained"]
    assert deltas == done["text"]
    # Il modello non e' stato chiamato, come nella versione sincrona.
    assert done["model"] == "(nessuna chiamata)"


async def test_streaming_and_non_streaming_agree(patched, monkeypatch):
    """Il gate vero e proprio, sulla stessa domanda e con lo stesso finto
    modello: testo, fonti, strumenti e verdetto devono coincidere."""
    async def fake_call_tool(session, name, arguments):
        return {"rows": [{"punti": 4264}], "sample_size": 29, "as_of": "2026-01-16"}

    monkeypatch.setattr(generate.tools, "call_tool", fake_call_tool)

    def build():
        return StreamingModel(
            ModelReply(tool_calls=[ToolCall("t1", "component_usage", {})]),
            ModelReply(text="Ha 4264 punti (fonte: component_usage) "
                            "[[knowledge/blades/wizard-rod.md]]."),
        )

    sincrona = await generate.answer(None, "quanto vince?", model=build())
    events = await collect(build(), "quanto vince?")
    done = next(e for e in events if e["event"] == "done")

    assert done["text"] == sincrona.text
    assert done["sources"] == sincrona.sources
    assert [c["name"] for c in done["tool_calls"]] == \
           [c["name"] for c in sincrona.tool_calls]
    assert done["verdict"] == sincrona.verdict.to_dict()
    # Cache compresa: se i due percorsi contassero in modo diverso, il costo di
    # una risposta dipenderebbe da come e' stata consegnata.
    assert done["usage"] == {"input": sincrona.input_tokens,
                             "output": sincrona.output_tokens,
                             **sincrona.cache_tokens}
