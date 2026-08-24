"""All'utente non arriva niente dell'eccezione.

Il caso reale: qualcuno ha chiesto quale combo si usa di piu' e si e' visto
rispondere

    OpenRouter ha rifiutato la richiesta (HTTP 429): {"error":{"message":
    "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock...

Sbagliato tre volte: non lo aiuta, rivela quale fornitore c'e' dietro e su che
piano, e sembra un guasto del sito invece di un limite temporaneo.

La regola verificata qui e': il messaggio all'utente e' una COSTANTE della
classe, mai una stringa derivata dall'eccezione. Nessun filtro, nessun
troncamento - quelli lasciano sempre passare qualcosa.
"""

from __future__ import annotations

import pytest

from app.lib.rag import errors

# Il corpo vero restituito da OpenRouter, cosi' com'e' arrivato.
CORPO_VERO = (
    'HTTP 429: {"error":{"message":"Rate limit exceeded: free-models-per-day. '
    'Add 10 credits to unlock 1000 free model requests per day","code":429},'
    '"user_id":"user_3AkPci9mwb4cFwLtwM20eqgiJ7O"}'
)

# Parole che non devono comparire in cio' che legge l'utente. Sono di tre tipi:
# il fornitore, le sue condizioni commerciali, e gli identificativi interni.
VIETATE = ["OpenRouter", "openrouter", "credits", "crediti", "free-models",
           "429", "HTTP", "user_id", "ANTHROPIC", "API_KEY", ".env",
           "OPENROUTER_MODEL", "Traceback"]


@pytest.mark.parametrize("classe", [
    errors.ProviderRateLimited, errors.ProviderUnavailable,
    errors.ProviderMisconfigured, errors.EmptyAnswer, errors.ChatError,
])
def test_no_error_leaks_its_detail(classe):
    error = classe(CORPO_VERO)
    payload = errors.payload_for("deadbeef", error)

    testo = payload["message"]
    for parola in VIETATE:
        assert parola not in testo, (classe.__name__, parola)


@pytest.mark.parametrize("classe", [
    errors.ProviderRateLimited, errors.ProviderUnavailable,
    errors.ProviderMisconfigured, errors.EmptyAnswer, errors.ChatError,
])
def test_the_payload_carries_nothing_but_the_agreed_fields(classe):
    """Un campo in piu' e' una fuga in piu'. `code` col nome della classe
    c'era, ed era abbastanza: ProviderRateLimited dice a chiunque guardi che
    c'e' un fornitore esterno e che e' al limite."""
    payload = errors.payload_for("deadbeef", classe(CORPO_VERO))

    assert set(payload) <= {"message", "reference", "retry_after"}
    assert classe.__name__ not in str(payload)


def test_the_detail_is_kept_for_whoever_has_to_repair_it():
    """Nascondere non e' perdere: senza il dettaglio da qualche parte, il guasto
    diventa indiagnosticabile."""
    error = errors.ProviderRateLimited(CORPO_VERO)

    assert "free-models-per-day" in error.detail


def test_a_rate_limit_tells_the_user_that_waiting_helps():
    """L'unica differenza utile fra i casi: se riprovare ha senso, e quando."""
    limitato = errors.payload_for("x", errors.ProviderRateLimited(CORPO_VERO))
    vuoto = errors.payload_for("x", errors.EmptyAnswer("niente testo"))

    assert limitato["retry_after"] == 300
    assert "retry_after" not in vuoto
    assert "riformulare" in vuoto["message"]


def test_a_misconfiguration_looks_like_any_other_outage():
    """Sapere che manca una chiave non aiuta l'utente a fare niente, e indica a
    chiunque passi di li' esattamente dove il sito e' fragile."""
    mancante = errors.payload_for("x", errors.ProviderMisconfigured(
        "OPENROUTER_API_KEY non impostata. Prendine una su openrouter.ai/keys"))
    generico = errors.payload_for("x", errors.ChatError("boh"))

    assert mancante["message"] == generico["message"]


def test_the_reference_is_short_enough_to_be_read_aloud():
    """Serve che un utente lo riporti in una segnalazione o in uno screenshot."""
    reference = errors.new_reference()

    assert len(reference) == 8
    assert all(c in "0123456789abcdef" for c in reference)


def test_two_references_differ():
    assert errors.new_reference() != errors.new_reference()


class _DbRotto:
    """Un database che non risponde: e' il caso in cui la registrazione del
    guasto potrebbe trasformarne uno gestito in un 500."""

    async def execute(self, *a, **k):
        raise RuntimeError("database irraggiungibile")

    async def commit(self):
        raise RuntimeError("database irraggiungibile")

    async def rollback(self):
        raise RuntimeError("nemmeno il rollback")


@pytest.mark.asyncio
async def test_recording_never_makes_things_worse(caplog):
    """Se il guasto originale E' il database, insistere lo trasformerebbe in un
    500 - cioe' in una pagina di errore al posto di un messaggio gentile."""
    with caplog.at_level("ERROR"):
        reference, error = await errors.record(
            _DbRotto(), errors.ProviderRateLimited(CORPO_VERO),
            endpoint="/api/chat", session_id=1, client_ip="203.0.113.1")

    assert len(reference) == 8
    assert error.user_message == errors.ProviderRateLimited.user_message
    # Il registro resta: e' l'unica destinazione che funziona anche cosi'.
    assert any("free-models-per-day" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_an_unknown_exception_is_treated_as_the_worst_case():
    """Un'eccezione che non e' nostra non ha un user_message: deve ricadere sul
    piu' generico, non far fallire la gestione dell'errore."""
    reference, error = await errors.record(
        _DbRotto(), ValueError("qualcosa di inatteso con dettagli interni"),
        endpoint="/api/chat")

    payload = errors.payload_for(reference, error)
    assert "inatteso" not in payload["message"]
    assert payload["message"] == errors.ChatError.user_message
