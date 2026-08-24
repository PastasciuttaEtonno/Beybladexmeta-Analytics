"""Tetti di spesa per la chat.

Non e' protezione dagli abusi nel senso di app/lib/rate_limit.py, che difende
un login dalla forza bruta. Qui ogni domanda costa denaro vero - embedding
della query, re-rank, token del modello - e un ciclo lasciato girare consuma la
dotazione in pochi minuti. I limiti sono due perche' i modi di spendere troppo
sono due:

  * TANTE domande da un solo chiamante. Si conta per IP, non per sessione:
    contare per sessione sarebbe inutile, basterebbe aprirne una nuova.
  * UNA conversazione che non finisce mai. La cronologia rientra nel prompt a
    ogni turno, quindi il costo per domanda cresce col procedere della
    conversazione; senza tetto, la centesima domanda di una sessione costa
    molte volte la prima.

Entrambi FALLISCONO CHIUSI, al contrario del limitatore dei login. La scelta e'
deliberata e opposta: li' bloccare tutti per un errore del limitatore sarebbe
peggio del rischio: qui il guasto costa denaro, e negare una risposta e' meno
grave che lasciare aperto un rubinetto. Il messaggio lo dice, cosi' un guasto
non si traveste da limite raggiunto.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

# Venti domande all'ora per IP. Generoso per una persona che esplora il sito,
# stretto per uno script. Il numero e' un punto di partenza dichiarato, non
# misurato: non ci sono ancora abbastanza domande vere per tararlo, e quando ce
# ne saranno la query da cui ricavarlo e' quella qui sotto.
MAX_QUESTIONS_PER_HOUR = 20

# Il tetto di una singola conversazione. A ~4.000 token per turno fra contesto,
# schede e risposta, sono un'ottantina di domande: nessuno le fa in buona fede,
# e chi le fa non le sta leggendo.
MAX_SESSION_TOKENS = 300_000


@dataclass(frozen=True)
class Denial:
    """Un rifiuto che sa spiegarsi.

    `retry_after` va nell'header omonimo: un client che riprova subito peggiora
    proprio la situazione che il limite esiste per evitare.
    """

    reason: str
    retry_after: int | None = None


async def check_rate(db: AsyncSession, client_ip: str | None) -> Denial | None:
    """Ritorna un rifiuto se questo IP ha gia' chiesto troppo nell'ultima ora.

    Si contano i messaggi dell'utente, non le sessioni: e' la domanda a costare,
    e chi ne fa venti in una sola sessione spende quanto chi apre venti sessioni.
    """
    if client_ip is None:
        # Nessun IP significa che non si puo' contare, e cio' che non si conta
        # non si limita. Vale la pena saperlo: se comparisse spesso, il proxy
        # davanti non sta passando l'indirizzo e il limite non esiste.
        log.warning("[quota] richiesta senza IP: il limite orario non si applica")
        return None

    row = await db.execute(
        text(
            "SELECT count(*) FROM chat_message m "
            "JOIN chat_session s ON s.id = m.session_id "
            "WHERE s.client_ip = CAST(:ip AS inet) AND m.role = 'user' "
            "  AND m.created_at >= now() - interval '1 hour'"
        ),
        {"ip": client_ip},
    )
    asked = row.scalar_one()
    if asked < MAX_QUESTIONS_PER_HOUR:
        return None

    return Denial(
        reason=(f"Hai raggiunto il limite di {MAX_QUESTIONS_PER_HOUR} domande "
                "all'ora. Riprova fra un po'."),
        retry_after=3600,
    )


async def check_session_budget(db: AsyncSession, session_id: int | None) -> Denial | None:
    """Ritorna un rifiuto se questa conversazione ha gia' consumato il suo tetto.

    Una sessione nuova non ha speso niente, quindi non c'e' niente da chiedere
    al database: e' il caso piu' frequente e non deve costare una query.
    """
    if session_id is None:
        return None

    row = await db.execute(
        text(
            "SELECT coalesce(sum(coalesce(input_tokens, 0) + "
            "                    coalesce(output_tokens, 0)), 0) "
            "FROM chat_message WHERE session_id = :id"
        ),
        {"id": session_id},
    )
    spent = row.scalar_one()
    if spent < MAX_SESSION_TOKENS:
        return None

    return Denial(
        reason=("Questa conversazione ha raggiunto la sua lunghezza massima. "
                "Aprine una nuova per continuare."),
    )


async def check(db: AsyncSession, client_ip: str | None,
                session_id: int | None) -> Denial | None:
    """I due controlli, nell'ordine in cui costano meno.

    Il fallimento e' chiuso: se il controllo stesso si rompe, si nega. Il
    contrario - il comportamento giusto per un limitatore di login - qui
    lascerebbe passare tutto proprio nel momento in cui il database e' in
    difficolta', che e' il peggiore in cui aprire il rubinetto.
    """
    try:
        return await check_rate(db, client_ip) or await check_session_budget(db, session_id)
    except Exception as exc:  # noqa: BLE001 - il tipo non cambia la decisione
        log.error("[quota] controllo fallito, nego per prudenza: %s", exc)
        return Denial(
            reason="Controllo dei limiti non disponibile, riprova fra poco.",
            retry_after=60,
        )


def client_ip_of(request) -> str | None:
    """L'indirizzo del chiamante, dietro il proxy che c'e' davvero.

    In produzione nginx sta davanti, quindi request.client.host e' l'indirizzo
    del proxy - lo stesso per tutti - e contare quello significherebbe imporre
    un unico limite condiviso da tutti i visitatori. Il primo elemento di
    X-Forwarded-For e' il chiamante originale.

    Un client puo' falsificare quell'header, e questo limite non pretende di
    essere infalsificabile: e' un tetto di spesa contro il consumo accidentale
    e gli script pigri, non una misura di sicurezza.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.client.host if request.client else None
