"""I tetti di spesa della chat.

Ogni domanda costa embedding della query, re-rank e token del modello. Il
limite non difende da un attacco: impedisce che un ciclo lasciato girare
consumi la dotazione in pochi minuti.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.lib.rag import quota


class _Db:
    """Un database che risponde con i numeri decisi dal test."""

    def __init__(self, *answers):
        self._answers = list(answers)
        self.queries: list[str] = []

    async def execute(self, statement, params=None):
        self.queries.append(str(statement))
        value = self._answers.pop(0)
        if isinstance(value, Exception):
            raise value
        return SimpleNamespace(scalar_one=lambda: value)


def _request(headers=None, host="10.0.0.7"):
    return SimpleNamespace(headers=headers or {},
                           client=SimpleNamespace(host=host))


# --------------------------------------------------------------- indirizzo


def test_the_proxy_address_is_not_the_caller():
    """Dietro nginx request.client.host e' l'indirizzo del proxy, uguale per
    tutti: contare quello imporrebbe un unico limite condiviso da tutti i
    visitatori del sito."""
    request = _request({"x-forwarded-for": "203.0.113.9, 10.0.0.1"})

    assert quota.client_ip_of(request) == "203.0.113.9"


def test_without_a_proxy_the_socket_address_is_the_caller():
    assert quota.client_ip_of(_request()) == "10.0.0.7"


def test_an_empty_forwarded_header_is_not_an_address():
    """Un header vuoto darebbe la stringa vuota, che inet rifiuta: il controllo
    fallirebbe e - fallendo chiuso - negherebbe ogni richiesta."""
    assert quota.client_ip_of(_request({"x-forwarded-for": "  "})) is None


# ------------------------------------------------------------- limite orario


@pytest.mark.asyncio
async def test_under_the_hourly_limit_nothing_happens():
    assert await quota.check_rate(_Db(3), "203.0.113.9") is None


@pytest.mark.asyncio
async def test_at_the_limit_the_next_question_is_denied():
    """Al limite, non oltre: la ventunesima domanda e' quella da fermare."""
    denial = await quota.check_rate(_Db(quota.MAX_QUESTIONS_PER_HOUR), "203.0.113.9")

    assert denial is not None
    assert denial.retry_after == 3600


@pytest.mark.asyncio
async def test_a_request_without_an_address_is_not_limited(caplog):
    """Cio' che non si conta non si limita. Va detto nei log: se comparisse
    spesso, il proxy non passa l'indirizzo e il limite non esiste."""
    db = _Db()
    with caplog.at_level("WARNING"):
        assert await quota.check_rate(db, None) is None

    assert db.queries == []
    assert any("senza IP" in r.message for r in caplog.records)


# ---------------------------------------------------------- budget sessione


@pytest.mark.asyncio
async def test_a_new_session_costs_no_query():
    """Il caso piu' frequente: una sessione che non esiste non ha speso niente,
    e chiederlo al database sarebbe una query per ogni prima domanda."""
    db = _Db()
    assert await quota.check_session_budget(db, None) is None
    assert db.queries == []


@pytest.mark.asyncio
async def test_a_long_conversation_is_capped():
    """La cronologia rientra nel prompt a ogni turno, quindi il costo per
    domanda cresce col procedere della conversazione: senza tetto la centesima
    domanda costa molte volte la prima."""
    denial = await quota.check_session_budget(_Db(quota.MAX_SESSION_TOKENS), 11)

    assert denial is not None
    assert "nuova" in denial.reason
    # Riaprire subito e' proprio la cura: non c'e' attesa da imporre.
    assert denial.retry_after is None


@pytest.mark.asyncio
async def test_a_short_conversation_continues():
    assert await quota.check_session_budget(_Db(1200), 11) is None


# -------------------------------------------------------- guasto: si nega


@pytest.mark.asyncio
async def test_a_broken_check_denies_instead_of_letting_everything_through(caplog):
    """Il contrario di app/lib/rate_limit.py, e deliberatamente.

    Li' un guasto che blocca tutti i login sarebbe peggio del rischio. Qui il
    guasto costa denaro: negare una risposta e' meno grave che lasciare aperto
    il rubinetto proprio mentre il database e' in difficolta'.
    """
    with caplog.at_level("ERROR"):
        denial = await quota.check(_Db(RuntimeError("database irraggiungibile")),
                                   "203.0.113.9", None)

    assert denial is not None
    assert denial.retry_after == 60
    assert any("nego per prudenza" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_the_failure_message_does_not_pretend_to_be_a_limit():
    """Un guasto travestito da limite raggiunto manderebbe a cercare un abuso
    che non c'e'."""
    denial = await quota.check(_Db(RuntimeError("giu'")), "203.0.113.9", None)

    assert "limite di" not in denial.reason
    assert "non disponibile" in denial.reason


@pytest.mark.asyncio
async def test_both_checks_run_in_the_cheaper_order():
    """Il limite orario per primo: nega il caso che si vuole fermare davvero,
    e quando scatta la seconda query non serve."""
    db = _Db(quota.MAX_QUESTIONS_PER_HOUR)

    denial = await quota.check(db, "203.0.113.9", 11)

    assert denial.retry_after == 3600
    assert len(db.queries) == 1
