"""Una lettera sola e' una domanda; un punto interrogativo no.

Il difetto era una riga di validazione: `min_length=2` sulla domanda. Chi
scriveva "F" - che in questo dominio e' il Bit Flat, riconosciuto dal
collegamento entita' da quando esistono le sigle - riceveva un 422 con il corpo
grezzo di pydantic, cioe' il peggior errore possibile: incomprensibile, e su una
domanda legittima.

La cura non e' togliere il limite e basta. Sotto quel limite ci sono due casi
diversi che meritano risposte diverse:

  "F", "9"      un pezzo nominato nel modo piu' corto che esista -> si risponde
  "?", "...",   nemmeno una lettera o una cifra -> non c'e' niente da cercare,
                e cercarlo comunque costa un embedding, un re-rank e un giro di
                modello per concludere che non si e' capito
"""

from __future__ import annotations

from app.routers.chat import (
    MAX_QUESTION,
    ChatRequest,
    _e_una_domanda,
    _risposta_costante,
    _TROPPO_VAGA,
)


def test_una_lettera_sola_passa_la_validazione():
    """'F' e' Flat, 'R' e' Rush: con min_length=2 l'API rispondeva 422."""
    for domanda in ("F", "9", "R"):
        assert ChatRequest(question=domanda).question == domanda


def test_la_domanda_vuota_resta_rifiutata():
    import pydantic
    import pytest

    with pytest.raises(pydantic.ValidationError):
        ChatRequest(question="")


def test_il_limite_superiore_resta():
    """Il tetto protegge la quota di embedding: la domanda viene embeddata a
    ogni richiesta."""
    import pydantic
    import pytest

    ChatRequest(question="a" * MAX_QUESTION)
    with pytest.raises(pydantic.ValidationError):
        ChatRequest(question="a" * (MAX_QUESTION + 1))


def test_cosa_conta_come_domanda():
    for si in ("F", "9", "9-60", "parlami di WizardRod", "e'"):
        assert _e_una_domanda(si), si
    for no in ("?", "...", "   ", "!!!", "???", "-"):
        assert not _e_una_domanda(no), no


def test_gli_accenti_contano_come_lettere():
    """La classe dei caratteri deve coprire il latino esteso, o "e'" scritto
    "è" verrebbe scambiato per punteggiatura."""
    assert _e_una_domanda("è")
    assert _e_una_domanda("più")


def test_la_risposta_costante_ha_la_forma_di_una_vera():
    """Il client non deve conoscere due casi: stessa forma, stesse chiavi.

    Se questa si scostasse, l'interfaccia leggerebbe `undefined` proprio nel
    ramo che serve a spiegare all'utente cosa scrivere."""
    finta = _risposta_costante(_TROPPO_VAGA)
    for chiave in ("text", "sources", "tool_calls", "abstained", "verdict",
                   "model", "usage", "latency_ms", "retrieval"):
        assert chiave in finta, chiave
    assert finta["abstained"] is True
    assert finta["sources"] == []
    assert finta["verdict"]["phantom_citations"] == []
    # Il motivo finisce nei log della pagina di diagnostica: e' li' che si legge
    # quante volte la gente scrive qualcosa che non e' una domanda.
    assert finta["retrieval"]["reason"]
