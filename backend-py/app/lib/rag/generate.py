"""Orchestrazione: recupero, strumenti, risposta, verifica.

Questo modulo non conosce nessun fornitore. Parla con `Conversation`, che e'
identica per Claude e per OpenRouter, e la traduzione da e verso i formati
nativi sta in providers.py. E' cio' che rende confrontabili due modelli: il
percorso e' lo stesso, cambia solo chi risponde.

Il ciclo e' scritto a mano invece di usare il tool runner dell'SDK per due
ragioni: gli strumenti hanno bisogno della sessione del database, e con un
fornitore alternativo il tool runner dell'SDK Anthropic non sarebbe comunque
utilizzabile. Sono trenta righe, e sono nostre.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.rag import guard, prompt, providers, search, tools
from app.lib.rag.embeddings import get_embedder
from app.lib.rag.env import load_env
from app.lib.rag.providers import LanguageModel, ToolCall
from app.lib.rag.rerank import get_reranker
from app.lib.rag.env import env_str
from app.lib.rag.errors import EmptyAnswer

log = logging.getLogger(__name__)

load_env()

# Quanti giri di strumenti prima di fermarsi. Una domanda ibrida ne usa due;
# oltre i quattro il modello sta girando a vuoto, e senza tetto un giro infinito
# e' una bolletta infinita.
MAX_TOOL_ROUNDS = 4



@dataclass
class _Usage:
    """I contatori di un turno intero, strumenti compresi.

    Erano variabili sciolte incrementate a mano in sei punti: aggiungerne una
    voleva dire trovarli tutti, e dimenticarne uno non rompe niente - fa solo
    tornare un numero piu' basso del vero.
    """

    input: int = 0
    output: int = 0
    cache_write: int = 0
    cache_read: int = 0

    def add(self, reply) -> None:
        self.input += reply.input_tokens
        self.output += reply.output_tokens
        self.cache_write += reply.cache_write_tokens
        self.cache_read += reply.cache_read_tokens

    def to_dict(self) -> dict[str, int]:
        """Le letture dalla cache accanto ai token d'ingresso: una cache che ha
        smesso di funzionare non cambia le risposte, cambia solo il conto - e
        senza questo numero non lascia alcuna traccia."""
        return {"input": self.input, "output": self.output,
                "cache_write": self.cache_write, "cache_read": self.cache_read}


class _ToolCache:
    """Esegue ogni coppia (tool, argomenti) una volta sola per risposta.

    Il modello ripete volentieri la stessa chiamata: senza memoria fra i giri la
    stessa interrogazione finiva piu' volte sul database e piu' volte nel
    contesto, gonfiandolo di copie di se stesso.
    """

    def __init__(self) -> None:
        self._seen: dict[str, Any] = {}
        self.results: list[Any] = []
        self.calls: list[dict[str, Any]] = []

    @staticmethod
    def _key(name: str, arguments: dict[str, Any]) -> str:
        # sort_keys: {"slot":"blade","limit":5} e {"limit":5,"slot":"blade"} sono
        # la stessa domanda, e senza ordinamento darebbero due chiavi diverse.
        return f"{name}:{json.dumps(arguments, sort_keys=True, default=str)}"

    def seen(self, call: ToolCall) -> bool:
        return self._key(call.name, call.arguments) in self._seen

    async def run(self, session: Any, call: ToolCall) -> tuple[Any, bool]:
        """Ritorna (risultato, era_gia_stato_calcolato)."""
        key = self._key(call.name, call.arguments)
        if key in self._seen:
            return self._seen[key], True

        result = await tools.call_tool(session, call.name, call.arguments)
        self._seen[key] = result
        self.results.append(result)
        self.calls.append({"name": call.name, "arguments": call.arguments,
                           "sample_size": result.get("sample_size")})
        return result, False

DEFAULT_PROVIDER = env_str("CHAT_PROVIDER", "claude")


@dataclass
class Answer:
    text: str
    sources: list[dict[str, Any]] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    abstained: bool = False
    verdict: guard.Verdict = field(default_factory=guard.Verdict)
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    # {'write': N, 'read': N}: token scritti nella cache del prompt e riletti da
    # essa. Una cache che smette di funzionare non cambia le risposte, cambia
    # solo il conto - e senza questi numeri non lascia nessuna traccia.
    cache_tokens: dict[str, int] = field(default_factory=dict)
    latency_ms: int = 0
    # La telemetria del recupero: quale ramo ha trovato i candidati, se il
    # re-rank e' stato utilizzabile, e perche' ci si e' astenuti quando e'
    # successo. E' cio' che distingue "ha cercato male" da "ha scritto male".
    retrieval: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "sources": self.sources,
            "tool_calls": self.tool_calls,
            "abstained": self.abstained,
            "verdict": self.verdict.to_dict(),
            "model": self.model,
            "usage": {"input": self.input_tokens, "output": self.output_tokens,
                      **self.cache_tokens},
            "latency_ms": self.latency_ms,
            "retrieval": self.retrieval,
        }


# Quante parole "vere" servono perche' una domanda si regga da sola. Tre e' una
# scelta, non una misura: "meglio 1-60 o 9-60" ne ha quattro e si regge, "e
# quello?" ne ha due e non si regge.
_PAROLA = re.compile(r"[0-9A-Za-z\u00C0-\u024F]+")
_PAROLE_MINIME = 3


def _ultima_domanda_piena(history: list[dict] | None) -> str | None:
    """L'ultima domanda dell'utente che si regge da sola.

    Si cammina all'indietro invece di prendere l'ultima e basta: in una serie
    come "quanto pesa?" -> "e l'altro?" -> "perche'?" l'ultima non aiuta piu'
    della penultima. Serve quella che nomina ancora qualcosa.
    """
    for turno in reversed(history or []):
        if turno.get("role") != "user":
            continue
        contenuto = (turno.get("content") or "").strip()
        if len(_PAROLA.findall(contenuto)) >= _PAROLE_MINIME:
            return contenuto
    return None


def con_contesto(question: str, history: list[dict] | None) -> str | None:
    """La domanda unita a quella che l'ha preceduta, o None se non serve.

    Non riscrive niente col modello: costerebbe un giro intero prima ancora di
    cercare, e la latenza e' gia' il difetto piu' sentito. Accostare i due testi
    basta a far somigliare l'embedding a quello giusto, e i rami esatto e
    full-text ritrovano le sigle che la domanda breve non conteneva.
    """
    precedente = _ultima_domanda_piena(history)
    if not precedente:
        return None
    unita = f"{precedente} {question}".strip()
    return unita if unita != question else None


async def _recupera(session, question, embedder, *, limit, reranker,
                    history: list[dict] | None):
    """Cerca; se non trova, riprova una volta sola con la domanda precedente.

    Il caso che questo ripara si vede nei log di produzione:

        utente:      45
        assistente:  "45 e' il valore di attacco di ..."
        utente:      Perche'?
        assistente:  "Non ho trovato niente nel sito..."

    La cronologia arrivava al MODELLO ma non al RECUPERO, e l'astensione decisa
    dal recupero torna indietro prima che il modello venga chiamato: la storia
    non aveva modo di servire proprio nel caso in cui serviva. Una domanda di
    seguito - "perche'?", "e quello?", "quanto?" - da sola non somiglia a
    niente, quindi finiva sotto la soglia ogni volta.

    Il secondo tentativo costa un embedding e un re-rank, e si paga SOLO sul
    percorso che oggi fallisce comunque. Se anche cosi' non trova, ci si astiene
    come prima: cercare col contesto non e' una licenza per rispondere lo
    stesso.
    """
    trovato = await search.hybrid(
        session, question, embedder, limit=limit, reranker=reranker
    )
    if not trovato.abstained:
        return trovato

    riformulata = con_contesto(question, history)
    if not riformulata:
        return trovato

    secondo = await search.hybrid(
        session, riformulata, embedder, limit=limit, reranker=reranker
    )
    if secondo.abstained:
        return trovato
    secondo.riformulata = riformulata
    return secondo


def get_model(provider: str | None = None, model: str | None = None) -> LanguageModel:
    return providers.get_model(provider or DEFAULT_PROVIDER, model)



async def _closing_turn(session, conversation, reply, cache):
    """Chiede la risposta quando il ciclo e' finito senza testo.

    Le chiamate ancora pendenti vanno comunque servite: il protocollo pretende
    un tool_result per ogni call_id, e un messaggio dell'utente inserito prima
    di quelli viene rifiutato. Solo dopo si puo' chiedere di concludere.
    """
    if reply.tool_calls:
        payloads = []
        for call in reply.tool_calls:
            result, _ = await cache.run(session, call)
            payloads.append((call, json.dumps(result, ensure_ascii=False, default=str)))
        reply = await conversation.give_tool_results(payloads)
        if reply.text.strip():
            return reply

    log.warning("[generazione] giri di strumenti esauriti senza risposta: "
                "sollecito la conclusione")
    closing = await conversation.ask(prompt.FINAL_NUDGE)
    if not closing.text.strip():
        # Due tentativi e nessun testo. Un `done` vuoto sarebbe indistinguibile
        # da "non aveva niente da dire": meglio un errore che si vede.
        raise EmptyAnswer(
            "Il modello non ha prodotto una risposta dopo aver esaurito le "
            "interrogazioni disponibili. Riprova, o prova un modello diverso "
            "con OPENROUTER_MODEL.")
    return closing


async def answer(
    session: AsyncSession,
    question: str,
    *,
    model: LanguageModel | None = None,
    embedder=None,
    reranker=None,
    history: list[dict] | None = None,
    limit: int = 5,
) -> Answer:
    started = time.monotonic()
    embedder = embedder or get_embedder("voyage")
    reranker = reranker or get_reranker(
        env_str("VOYAGE_RERANK_MODEL", "rerank-2.5"))

    retrieval = await _recupera(
        session, question, embedder, limit=limit, reranker=reranker,
        history=history,
    )
    hits, abstained = retrieval.hits, retrieval.abstained

    # L'astensione decisa dal recupero non arriva al modello. Chiedergli di
    # rispondere con un contesto vuoto sarebbe invitarlo a rispondere a memoria,
    # che e' esattamente cio' che tutta la pipeline esiste per impedire.
    if abstained:
        return Answer(
            text=prompt.ABSTENTION_ANSWER,
            abstained=True,
            model="(nessuna chiamata)",
            latency_ms=int((time.monotonic() - started) * 1000),
            retrieval=retrieval.to_dict(),
        )

    model = model or get_model()
    conversation = model.conversation(
        system=prompt.SYSTEM_PROMPT,
        tool_definitions=tools.TOOL_DEFINITIONS,
        history=history,
    )

    cache = _ToolCache()
    usage = _Usage()

    reply = await conversation.ask(
        f"{prompt.render_context(hits)}\n\n{prompt.render_question(question)}"
    )
    usage.add(reply)

    for _round in range(MAX_TOOL_ROUNDS):
        if not reply.tool_calls:
            break
        payloads: list[tuple[ToolCall, str]] = []
        for call in reply.tool_calls:
            result, _ = await cache.run(session, call)
            payloads.append((call, json.dumps(result, ensure_ascii=False, default=str)))
        reply = await conversation.give_tool_results(payloads)
        usage.add(reply)

    if not reply.text.strip():
        reply = await _closing_turn(session, conversation, reply, cache)
        usage.add(reply)

    verdict = guard.verify(
        reply.text,
        injected_sources=guard.sources_from(hits),
        tool_names={t["name"] for t in tools.TOOL_DEFINITIONS},
        tool_results=cache.results,
        context_text=prompt.render_context(hits),
    )

    return Answer(
        text=reply.text,
        sources=[{"source_path": h.source_path, "heading": h.heading,
                  "slug": h.slug, "score": round(h.score, 3)} for h in hits],
        tool_calls=cache.calls,
        abstained=False,
        verdict=verdict,
        model=model.name,
        input_tokens=usage.input,
        output_tokens=usage.output,
        cache_tokens={"cache_write": usage.cache_write,
                      "cache_read": usage.cache_read},
        latency_ms=int((time.monotonic() - started) * 1000),
        retrieval=retrieval.to_dict(),
    )


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------
#
# Sei tipi di evento, e sono un contratto pubblico fra backend e frontend:
#
#   status   a che punto e' il lavoro. Riempie l'attesa di informazione vera
#            invece che di uno spinner, e con una latenza mediana di dieci
#            secondi non e' un dettaglio estetico.
#   sources  le fonti, appena il recupero le ha. Arrivano PRIMA del testo: chi
#            legge vede subito su cosa si basera' la risposta.
#   tool     uno strumento e' stato chiamato, con la numerosita' campionaria in
#            chiaro - la stessa che il prompt obbliga a dichiarare nel testo.
#   delta    un frammento di risposta.
#   done     la risposta e' finita, col verdetto.
#   error    qualcosa e' andato storto, in una forma che il client puo' mostrare.
#
# Non c'e' logica nuova rispetto ad answer(): gli stessi passi, nello stesso
# ordine, con gli stessi controlli. E' cio' che rende vero il gate di M5 -
# streaming e non-streaming danno la stessa risposta - per costruzione invece
# che per verifica.

_END = object()


async def _with_deltas(coro, queue: asyncio.Queue):
    """Esegue una chiamata al modello consegnando i frammenti mentre arrivano.

    Il problema da risolvere: l'adattatore chiama un callback SINCRONO per ogni
    frammento, mentre qui serve un generatore asincrono. La coda fa da ponte, e
    la sentinella evita sia il polling sia la corsa fra "il task e' finito" e
    "c'e' ancora roba in coda" - che perderebbe l'ultimo frammento, cioe' la
    fine della frase.
    """
    async def runner():
        try:
            return await coro
        finally:
            queue.put_nowait(_END)

    task = asyncio.create_task(runner())
    while True:
        item = await queue.get()
        if item is _END:
            break
        yield {"event": "delta", "text": item}
    yield {"event": "_reply", "reply": await task}



async def _closing_turn_streaming(session, conversation, reply, cache, on_delta):
    """Come _closing_turn, ma con i frammenti che continuano a scorrere."""
    if reply.tool_calls:
        payloads = []
        for call in reply.tool_calls:
            result, _ = await cache.run(session, call)
            payloads.append((call, json.dumps(result, ensure_ascii=False, default=str)))
        reply = await conversation.give_tool_results(payloads, on_delta)
        if reply.text.strip():
            return reply

    log.warning("[generazione] giri di strumenti esauriti senza risposta: "
                "sollecito la conclusione")
    closing = await conversation.ask(prompt.FINAL_NUDGE, on_delta)
    if not closing.text.strip():
        raise EmptyAnswer(
            "Il modello non ha prodotto una risposta dopo aver esaurito le "
            "interrogazioni disponibili. Riprova, o prova un modello diverso "
            "con OPENROUTER_MODEL.")
    return closing


async def answer_stream(
    session: AsyncSession,
    question: str,
    *,
    model: LanguageModel | None = None,
    embedder=None,
    reranker=None,
    history: list[dict] | None = None,
    limit: int = 5,
) -> AsyncIterator[dict[str, Any]]:
    started = time.monotonic()
    embedder = embedder or get_embedder("voyage")
    reranker = reranker or get_reranker(
        env_str("VOYAGE_RERANK_MODEL", "rerank-2.5"))

    yield {"event": "status", "phase": "retrieval", "detail": "cerco fra le schede"}
    retrieval = await _recupera(
        session, question, embedder, limit=limit, reranker=reranker,
        history=history,
    )
    hits, abstained = retrieval.hits, retrieval.abstained

    if abstained:
        yield {"event": "delta", "text": prompt.ABSTENTION_ANSWER}
        yield {"event": "done", "text": prompt.ABSTENTION_ANSWER, "abstained": True,
               "sources": [], "tool_calls": [], "verdict": guard.Verdict().to_dict(),
               "model": "(nessuna chiamata)", "usage": {"input": 0, "output": 0},
               "latency_ms": int((time.monotonic() - started) * 1000),
               "retrieval": retrieval.to_dict()}
        return

    sources = [{"source_path": h.source_path, "heading": h.heading,
                "slug": h.slug, "score": round(h.score, 3)} for h in hits]
    yield {"event": "sources", "sources": sources}

    model = model or get_model()
    conversation = model.conversation(
        system=prompt.SYSTEM_PROMPT,
        tool_definitions=tools.TOOL_DEFINITIONS,
        history=history,
    )

    queue: asyncio.Queue = asyncio.Queue()
    on_delta = queue.put_nowait
    cache = _ToolCache()
    usage = _Usage()
    reply = None

    yield {"event": "status", "phase": "generating", "detail": "scrivo la risposta"}

    async for item in _with_deltas(
        conversation.ask(
            f"{prompt.render_context(hits)}\n\n{prompt.render_question(question)}",
            on_delta),
        queue,
    ):
        if item["event"] == "_reply":
            reply = item["reply"]
        else:
            yield item
    usage.add(reply)

    for _round in range(MAX_TOOL_ROUNDS):
        if not reply.tool_calls:
            break
        payloads = []
        for call in reply.tool_calls:
            # Una ripetizione non emette eventi: l'utente vedrebbe la stessa chip
            # comparire tre volte e la leggerebbe come tre interrogazioni vere.
            if not cache.seen(call):
                yield {"event": "status", "phase": "tool",
                       "detail": f"interrogo le statistiche ({call.name})"}
            result, was_cached = await cache.run(session, call)
            if not was_cached:
                yield {"event": "tool", "name": call.name,
                       "sample_size": result.get("sample_size"),
                       "as_of": result.get("as_of"), "notes": result.get("notes") or []}
            payloads.append((call, json.dumps(result, ensure_ascii=False, default=str)))

        async for item in _with_deltas(
            conversation.give_tool_results(payloads, on_delta), queue
        ):
            if item["event"] == "_reply":
                reply = item["reply"]
            else:
                yield item
        usage.add(reply)

    if not reply.text.strip():
        yield {"event": "status", "phase": "generating",
               "detail": "raccolgo le conclusioni"}
        # I frammenti della conclusione arrivano come tutti gli altri: per chi
        # guarda non c'e' differenza fra una risposta scritta subito e una
        # sollecitata, e non deve essercene.
        async for item in _with_deltas(
            _closing_turn_streaming(session, conversation, reply, cache, on_delta), queue
        ):
            if item["event"] == "_reply":
                reply = item["reply"]
            else:
                yield item
        usage.add(reply)

    verdict = guard.verify(
        reply.text,
        injected_sources=guard.sources_from(hits),
        tool_names={t["name"] for t in tools.TOOL_DEFINITIONS},
        tool_results=cache.results,
        context_text=prompt.render_context(hits),
    )

    yield {
        "event": "done",
        "text": reply.text,
        "abstained": False,
        "sources": sources,
        "tool_calls": cache.calls,
        "verdict": verdict.to_dict(),
        "model": model.name,
        "usage": usage.to_dict(),
        "latency_ms": int((time.monotonic() - started) * 1000),
        "retrieval": retrieval.to_dict(),
    }
