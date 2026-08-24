"""POST /api/chat — una domanda, una risposta.

Senza streaming, di proposito: e' M4. Lo streaming e' M5, e separarli non e'
pedanteria di roadmap. Una risposta sincrona si confronta con quella attesa in
un test; una in streaming aggiunge un protocollo di trasporto sopra la stessa
logica, e mescolare le due cose significa non sapere piu' se un errore viene dal
ragionamento o dal trasporto.

Il rate limit e la persistenza stanno qui e non in generate.py: quella e' logica
di dominio e deve poter girare da un test o dalla valutazione senza toccare ne'
sessioni ne' quote.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.lib.rag import errors, generate, quota

router = APIRouter()
log = logging.getLogger(__name__)

# Una domanda piu' lunga di cosi' non e' una domanda. Il limite protegge la
# quota di embedding prima ancora che il modello: la query viene embeddata a
# ogni richiesta.
MAX_QUESTION = 500

# Quanti scambi precedenti si rimandano al modello. Oltre, il contesto cresce
# senza migliorare la risposta: le domande su questo dominio sono quasi sempre
# autonome, e la storia serve a risolvere "e quello?" non a ricordare tutto.
HISTORY_TURNS = 6


# Una domanda che non contiene nemmeno una lettera o una cifra non e' una
# domanda: "?", "...", uno spazio. Riconoscerla qui costa una regex; lasciarla
# passare costa un embedding, un re-rank e un giro di modello per poi dire
# comunque che non si e' capito.
_ALFANUMERICO = re.compile(r"[0-9A-Za-z\u00C0-\u024F]")

# Il testo e' una costante, come tutti i messaggi all'utente in errors.py.
_TROPPO_VAGA = (
    "Non ho capito la domanda. Scrivi il nome di un pezzo (per esempio "
    "WizardRod, 9-60, LR) oppure una domanda intera."
)


def _e_una_domanda(question: str) -> bool:
    return bool(_ALFANUMERICO.search(question))


def _risposta_costante(testo: str) -> dict:
    """Una risposta senza modello, nella stessa forma di quelle vere.

    Stessa forma perche' il client non deve conoscere due casi: la tratta come
    ogni altra risposta, mostra le stesse etichette e lo stesso pollice.
    `retrieval.reason` dice perche', ed e' quello che si legge nei log.
    """
    return {
        "text": testo,
        "sources": [],
        "tool_calls": [],
        "abstained": True,
        "verdict": {"phantom_citations": [], "unknown_tools": [],
                    "unsourced_numbers": []},
        "model": None,
        "usage": {"input": 0, "output": 0, "cache_write": 0, "cache_read": 0},
        "latency_ms": 0,
        "retrieval": {"branch_counts": {}, "fused_count": 0, "reranked": False,
                      "top_score": None, "abstained": True,
                      "reason": "domanda senza lettere ne' cifre",
                      "slugs": [], "codes": []},
    }


class ChatRequest(BaseModel):
    # Una lettera sola e' una domanda legittima: in questo dominio "F" e' Flat e
    # "R" e' Rush, e il collegamento entita' le riconosce. Con min_length=2
    # l'API rispondeva 422 - un errore di validazione grezzo, per giunta - a
    # chi chiedeva di un pezzo col suo nome piu' corto.
    question: str = Field(min_length=1, max_length=MAX_QUESTION)
    session_id: int | None = None


class FeedbackRequest(BaseModel):
    message_id: int
    # -1, 0, 1. Il pollice giu' e' il segnale piu' economico che esista per
    # scoprire quali domande vanno male davvero.
    value: int = Field(ge=-1, le=1)


async def _history(db: AsyncSession, session_id: int) -> list[dict]:
    rows = await db.execute(
        text(
            "SELECT role, content FROM chat_message WHERE session_id = :id "
            "ORDER BY created_at DESC LIMIT :limit"
        ),
        {"id": session_id, "limit": HISTORY_TURNS},
    )
    # Riletti al contrario perche' la query prende gli ULTIMI, non i primi.
    return [{"role": r.role, "content": r.content} for r in reversed(list(rows))]



async def _open_session(db: AsyncSession, request: Request, body: ChatRequest,
                        question: str) -> tuple[int, list[dict]]:
    """Apre o convalida la sessione, e ne restituisce la cronologia.

    Era duplicato nei due endpoint. Conta perche' qui si registra l'IP: in due
    copie sarebbe finito in una sola, e il limite orario avrebbe contato meta'
    delle domande.
    """
    if body.session_id is not None:
        exists = await db.execute(
            text("SELECT 1 FROM chat_session WHERE id = :id"), {"id": body.session_id})
        if exists.first() is None:
            raise HTTPException(status_code=404, detail="sessione inesistente")
        return body.session_id, await _history(db, body.session_id)

    row = await db.execute(
        text("INSERT INTO chat_session (title, client_ip) "
             "VALUES (:title, CAST(:ip AS inet)) RETURNING id"),
        {"title": question[:80], "ip": quota.client_ip_of(request)},
    )
    return row.scalar_one(), []


def _enforce(denial: quota.Denial | None) -> None:
    """429 con Retry-After quando c'e'.

    Senza l'header un client riprova subito, che e' esattamente il
    comportamento che il limite esiste per scoraggiare.
    """
    if denial is None:
        return
    headers = ({"Retry-After": str(denial.retry_after)}
               if denial.retry_after else None)
    raise HTTPException(status_code=429, detail=denial.reason, headers=headers)


@router.post("/api/chat")
async def chat(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    body: Annotated[ChatRequest, Body()],
) -> dict:
    question = body.question.strip()
    if not _e_una_domanda(question):
        # Nessuna spesa e nessun 400: al client arriva una risposta come le
        # altre, che dice cosa scrivere. Viene salvata, cosi' resta nei log
        # insieme alle domande vere.
        session_id, _ = await _open_session(db, request, body, question or "?")
        finale = _risposta_costante(_TROPPO_VAGA)
        message_id = await _persist(db, session_id, question or "?", finale)
        await db.commit()
        return {**finale, "session_id": session_id, "message_id": message_id}

    # Prima di qualunque spesa: la domanda costa embedding, re-rank e token, e
    # il controllo va fatto quando negare e' ancora gratis.
    _enforce(await quota.check(db, quota.client_ip_of(request), body.session_id))

    session_id, history = await _open_session(db, request, body, question)

    try:
        answer = await generate.answer(db, question, history=history)
    except Exception as exc:  # noqa: BLE001 - qualunque guasto, stesso trattamento
        # Nulla di cio' che l'eccezione dice arriva al client. Il testo del
        # fornitore conteneva il suo nome, il piano tariffario scelto e il
        # consiglio di comprare crediti: informazioni di amministrazione,
        # mostrate a chi aveva solo chiesto quale combo si usa di piu'.
        reference, error = await errors.record(
            db, exc, endpoint="/api/chat", session_id=session_id,
            client_ip=quota.client_ip_of(request))
        headers = ({"Retry-After": str(error.retry_after)}
                   if error.retry_after else None)
        raise HTTPException(status_code=error.status_code,
                            detail=errors.payload_for(reference, error),
                            headers=headers) from exc

    # Le citazioni fantasma non fanno fallire la richiesta: la risposta e' gia'
    # scritta, e nasconderla non la migliora. Vengono registrate perche' e' cosi'
    # che si scoprono, e restituite perche' l'interfaccia possa segnalarle.
    if answer.verdict.phantom_citations:
        log.warning("citazioni inesistenti in sessione %s: %s",
                    session_id, answer.verdict.phantom_citations)

    await db.execute(
        text("INSERT INTO chat_message (session_id, role, content) "
             "VALUES (:s, 'user', :c)"),
        {"s": session_id, "c": question},
    )
    row = await db.execute(
        text(
            "INSERT INTO chat_message (session_id, role, content, sources, "
            "    tool_calls, abstained, phantom_citations, model, input_tokens, "
            "    output_tokens, latency_ms, retrieval) "
            "VALUES (:s, 'assistant', :c, CAST(:sources AS jsonb), "
            "    CAST(:calls AS jsonb), :abstained, CAST(:phantom AS jsonb), "
            "    :model, :inp, :out, :ms, CAST(:retrieval AS jsonb)) RETURNING id"
        ),
        {
            "s": session_id, "c": answer.text,
            "sources": _dumps(answer.sources), "calls": _dumps(answer.tool_calls),
            "abstained": answer.abstained,
            "phantom": _dumps(answer.verdict.phantom_citations),
            "model": answer.model, "inp": answer.input_tokens,
            "out": answer.output_tokens, "ms": answer.latency_ms,
            "retrieval": _dumps(answer.retrieval),
        },
    )
    message_id = row.scalar_one()
    await db.execute(
        text("UPDATE chat_session SET last_message_at = now() WHERE id = :id"),
        {"id": session_id},
    )
    await db.commit()

    payload = answer.to_dict()
    payload["session_id"] = session_id
    payload["message_id"] = message_id
    return payload


@router.post("/api/chat/feedback")
async def feedback(
    db: Annotated[AsyncSession, Depends(get_session)],
    body: Annotated[FeedbackRequest, Body()],
) -> dict:
    result = await db.execute(
        text("UPDATE chat_message SET feedback = :v WHERE id = :id AND role = 'assistant'"),
        {"v": body.value, "id": body.message_id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="messaggio inesistente")
    return {"ok": True}


@router.get("/api/chat/sessions/{session_id}")
async def session_history(
    db: Annotated[AsyncSession, Depends(get_session)],
    session_id: int,
) -> dict:
    rows = await db.execute(
        text(
            "SELECT id, role, content, sources, tool_calls, abstained, feedback, "
            "       created_at FROM chat_message WHERE session_id = :id "
            "ORDER BY created_at"
        ),
        {"id": session_id},
    )
    messages = [dict(row._mapping) for row in rows]
    if not messages:
        raise HTTPException(status_code=404, detail="sessione inesistente o vuota")
    return {"session_id": session_id, "messages": messages}


def _dumps(value) -> str:
    """Serializza per una colonna jsonb o per un evento SSE."""
    return json.dumps(value, ensure_ascii=False, default=str)


@router.post("/api/chat/stream")
async def chat_stream(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    body: Annotated[ChatRequest, Body()],
):
    """La stessa risposta di /api/chat, consegnata a pezzi.

    SSE e non WebSocket: il flusso e' a senso unico, e SSE passa da proxy e CDN
    senza configurazione speciale mentre i WebSocket dietro nginx richiedono
    header aggiuntivi. Bidirezionalita' che non serve non vale una dipendenza in
    piu' nel percorso.
    """
    question = body.question.strip()
    if not _e_una_domanda(question):
        session_id, _ = await _open_session(db, request, body, question or "?")
        finale = _risposta_costante(_TROPPO_VAGA)
        message_id = await _persist(db, session_id, question or "?", finale)
        await db.commit()

        async def solo_finale():
            yield _sse({"event": "status", "phase": "start",
                        "session_id": session_id})
            yield _sse({"event": "done", **finale, "saved": True,
                        "message_id": message_id, "session_id": session_id})

        return StreamingResponse(solo_finale(),
                                 media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no"})

    # Prima di qualunque spesa: la domanda costa embedding, re-rank e token, e
    # il controllo va fatto quando negare e' ancora gratis.
    _enforce(await quota.check(db, quota.client_ip_of(request), body.session_id))

    session_id, history = await _open_session(db, request, body, question)

    async def events():
        # L'evento di apertura porta l'id della sessione: senza, il client non
        # potrebbe continuare la conversazione se lo stream si interrompe a meta'.
        yield _sse({"event": "status", "phase": "start", "session_id": session_id})
        final: dict | None = None
        try:
            async for item in generate.answer_stream(db, question, history=history):
                if item["event"] == "done":
                    final = item
                yield _sse(item)
        except Exception as exc:  # noqa: BLE001
            # L'errore va nello stream, non come stato HTTP: le intestazioni
            # sono gia' partite, quindi un 500 qui non arriverebbe al client -
            # vedrebbe solo una connessione che si chiude senza spiegazione.
            #
            # `code` non c'e' piu': era il nome della classe dell'eccezione, e
            # anche solo quello racconta quale fornitore c'e' dietro e in che
            # stato si trova.
            reference, error = await errors.record(
                db, exc, endpoint="/api/chat/stream", session_id=session_id,
                client_ip=quota.client_ip_of(request))
            yield _sse({"event": "error", **errors.payload_for(reference, error)})
            return

        if final is None:
            return
        try:
            message_id = await _persist(db, session_id, question, final)
            yield _sse({"event": "done", "saved": True, "message_id": message_id,
                        "session_id": session_id})
        except Exception:
            # La risposta e' gia' arrivata a chi legge: non salvarla e' un
            # problema per la diagnostica futura, non per questa conversazione.
            log.exception("risposta non salvata in sessione %s", session_id)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # nginx bufferizza le risposte per default, e con un buffer lo
            # streaming smette di essere streaming: i frammenti arriverebbero
            # tutti insieme alla fine.
            "X-Accel-Buffering": "no",
        },
    )


def _sse(payload: dict) -> str:
    """Un evento nel formato text/event-stream.

    Il nome dell'evento va anche in `event:` oltre che nel JSON, cosi' un client
    puo' registrarsi sul singolo tipo con addEventListener invece di leggere e
    smistare ogni messaggio.
    """
    name = payload.get("event", "message")
    return f"event: {name}\ndata: {_dumps(payload)}\n\n"


async def _persist(db: AsyncSession, session_id: int, question: str,
                   final: dict) -> int:
    await db.execute(
        text("INSERT INTO chat_message (session_id, role, content) "
             "VALUES (:s, 'user', :c)"),
        {"s": session_id, "c": question},
    )
    verdict = final.get("verdict") or {}
    usage = final.get("usage") or {}
    row = await db.execute(
        text(
            "INSERT INTO chat_message (session_id, role, content, sources, "
            "    tool_calls, abstained, phantom_citations, model, input_tokens, "
            "    output_tokens, latency_ms, retrieval) "
            "VALUES (:s, 'assistant', :c, CAST(:sources AS jsonb), "
            "    CAST(:calls AS jsonb), :abstained, CAST(:phantom AS jsonb), "
            "    :model, :inp, :out, :ms, CAST(:retrieval AS jsonb)) RETURNING id"
        ),
        {
            "s": session_id, "c": final.get("text", ""),
            "sources": _dumps(final.get("sources", [])),
            "calls": _dumps(final.get("tool_calls", [])),
            "abstained": bool(final.get("abstained")),
            "phantom": _dumps(verdict.get("phantom_citations", [])),
            "model": final.get("model", ""),
            "inp": usage.get("input", 0), "out": usage.get("output", 0),
            "ms": final.get("latency_ms", 0),
            "retrieval": _dumps(final.get("retrieval", {})),
        },
    )
    message_id = row.scalar_one()
    await db.execute(
        text("UPDATE chat_session SET last_message_at = now() WHERE id = :id"),
        {"id": session_id},
    )
    await db.commit()
    return message_id


