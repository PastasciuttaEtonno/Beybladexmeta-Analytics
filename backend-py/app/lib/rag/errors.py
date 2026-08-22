"""Cosa vede l'utente quando qualcosa si rompe, e cosa vede chi deve ripararlo.

Sono due pubblici diversi e finora ricevevano la stessa cosa. Un utente che
chiedeva una combo si e' visto rispondere:

    OpenRouter ha rifiutato la richiesta (HTTP 429): {"error":{"message":
    "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock...

Che e' sbagliato tre volte: non gli dice nulla di utile, rivela quale fornitore
c'e' dietro e quale piano e' stato scelto, e sembra un guasto del sito invece
che un limite temporaneo.

Il criterio qui e': **il messaggio all'utente e' una costante scritta a mano,
mai una stringa derivata dall'eccezione.** Non c'e' filtro o troncamento che
tenga: se il testo passa attraverso, prima o poi passa qualcosa che non doveva.

Il dettaglio completo va nel registro del server e nella tabella `chat_error`,
con un codice breve che compare anche all'utente. Cosi' chi segnala "non
funziona" porta con se' il codice, e chi ripara trova la riga esatta senza
chiedere altro.
"""

from __future__ import annotations

import secrets


class ChatError(RuntimeError):
    """Un guasto lungo il percorso della risposta.

    `detail` e' per il registro e non esce mai verso il client; `user_message`
    e' l'unica cosa che l'utente legge.
    """

    # Sovrascritti dalle sottoclassi. Il default e' il caso peggiore - non
    # sappiamo cos'e' successo - quindi il messaggio piu' generico.
    user_message = ("L'assistente non è disponibile in questo momento. "
                    "Riprova più tardi.")
    # Suggerimento per il client su quando ritentare. None = non si sa.
    retry_after: int | None = None
    # Stato HTTP da restituire sul percorso sincrono.
    status_code = 503

    def __init__(self, detail: str = "") -> None:
        super().__init__(detail)
        self.detail = detail


class ProviderRateLimited(ChatError):
    """Il fornitore ha detto "troppe richieste".

    Non si nomina il fornitore ne' il piano: all'utente serve sapere che
    riprovare piu' tardi ha senso, non chi impone il limite. Che sia il tetto
    giornaliero del piano gratuito o una raffica al minuto e' una questione di
    amministrazione, e sta nel registro.
    """

    user_message = ("L'assistente ha raggiunto il limite di richieste. "
                    "Riprova fra qualche minuto.")
    retry_after = 300
    status_code = 503


class ProviderUnavailable(ChatError):
    """Il fornitore non risponde, o risponde con un errore non nostro."""

    user_message = ("L'assistente non è raggiungibile in questo momento. "
                    "Riprova fra poco.")
    retry_after = 60


class ProviderMisconfigured(ChatError):
    """Chiave assente o non valida: e' un guasto dell'installazione.

    All'utente si dice la stessa cosa degli altri casi. Sapere che manca una
    chiave non lo aiuta a fare niente, e dirlo indica a chiunque passi di li'
    esattamente dove il sito e' fragile.
    """

    user_message = ("L'assistente non è disponibile in questo momento. "
                    "Riprova più tardi.")


class EmptyAnswer(ChatError):
    """Il modello non ha prodotto testo.

    L'unico caso in cui riprovare subito ha davvero senso: spesso e' il modello
    che si e' impuntato su quella domanda, non il servizio che e' giu'.
    """

    user_message = ("Non sono riuscito a formulare una risposta. "
                    "Prova a riformulare la domanda.")


def new_reference() -> str:
    """Un codice breve che compare sia all'utente sia nel registro.

    Otto caratteri esadecimali: abbastanza da non collidere fra i guasti di una
    stessa giornata, abbastanza corti da essere riportati a voce o in uno
    screenshot. Non e' un segreto e non apre niente: e' solo un indice.
    """
    return secrets.token_hex(4)


async def record(db, exc: BaseException, *, endpoint: str,
                 session_id: int | None = None,
                 client_ip: str | None = None) -> tuple[str, ChatError]:
    """Registra il guasto e restituisce (codice, errore classificato).

    Due destinazioni, deliberatamente:

      * il registro dell'applicazione, che legge chi ha accesso alla macchina.
        Ci finisce anche il traceback;
      * la tabella `chat_error`, che sopravvive alla ricreazione del container e
        che puo' interrogare l'amministratore del sito.

    La scrittura sul database non deve MAI far fallire la richiesta: se il
    guasto originale e' che il database non risponde, insistere trasformerebbe
    un errore gestito in un 500. Il registro resta comunque.
    """
    import logging
    import traceback

    log = logging.getLogger("app.lib.rag.chat_error")
    reference = new_reference()
    error = exc if isinstance(exc, ChatError) else ChatError(str(exc))
    kind = type(exc).__name__

    # Il registro per primo: e' l'unico che funziona anche quando il resto no.
    log.error("[chat %s] %s in %s (sessione %s): %s", reference, kind, endpoint,
              session_id, error.detail or str(exc), exc_info=exc)

    try:
        from sqlalchemy import text as _sql

        await db.execute(
            _sql("INSERT INTO chat_error (reference, kind, detail, traceback, "
                 "    endpoint, session_id, client_ip) "
                 "VALUES (:ref, :kind, :detail, :tb, :endpoint, :sid, "
                 "    CAST(:ip AS inet))"),
            {"ref": reference, "kind": kind,
             "detail": (error.detail or str(exc))[:4000],
             "tb": "".join(traceback.format_exception(exc))[:8000],
             "endpoint": endpoint, "sid": session_id, "ip": client_ip},
        )
        await db.commit()
    except Exception:  # noqa: BLE001 - la causa non cambia cosa si fa
        log.exception("[chat %s] guasto non salvato su chat_error", reference)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass

    return reference, error


def payload_for(reference: str, error: ChatError) -> dict:
    """Cio' che esce verso il client, e nient'altro.

    Nessun campo derivato dall'eccezione: `message` e' la costante della classe,
    `reference` e' un numero casuale. Il tipo dell'errore non compare - sapere
    che si chiama ProviderRateLimited direbbe a chiunque guardi quale fornitore
    c'e' dietro e in che stato si trova.
    """
    body = {"message": error.user_message, "reference": reference}
    if error.retry_after is not None:
        body["retry_after"] = error.retry_after
    return body
