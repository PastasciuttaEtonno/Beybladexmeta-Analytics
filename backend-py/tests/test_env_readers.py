"""Una variabile d'ambiente vuota non e' un valore.

Il bug: os.environ.get(name, default) restituisce "" quando la variabile ESISTE
ed e' vuota, quindi il default non si applica. docker compose scrive
`OPENROUTER_MODEL: ${OPENROUTER_MODEL:-}`, che definisce SEMPRE la variabile -
vuota se non c'e' nel .env.

Il container costruito a mano non la definiva affatto e il default funzionava.
Passando a compose e' sparito, e OpenRouter ha risposto "No models provided" a
una richiesta partita senza modello: un errore del fornitore per una variabile
di configurazione, che e' il punto piu' lontano possibile dalla causa.
"""

from __future__ import annotations

import pytest

from app.lib.rag.env import env_float, env_int, env_str


def test_an_absent_variable_uses_the_default(monkeypatch):
    monkeypatch.delenv("MODELLO_DI_PROVA", raising=False)
    assert env_str("MODELLO_DI_PROVA", "voyage-4") == "voyage-4"


def test_an_empty_variable_is_absent(monkeypatch):
    """Il caso vero: compose la definisce vuota, non la omette."""
    monkeypatch.setenv("MODELLO_DI_PROVA", "")
    assert env_str("MODELLO_DI_PROVA", "voyage-4") == "voyage-4"


def test_whitespace_is_empty(monkeypatch):
    """Uno spazio in fondo a una riga del .env non e' un nome di modello."""
    monkeypatch.setenv("MODELLO_DI_PROVA", "   ")
    assert env_str("MODELLO_DI_PROVA", "voyage-4") == "voyage-4"


def test_a_real_value_wins(monkeypatch):
    monkeypatch.setenv("MODELLO_DI_PROVA", "voyage-3-large")
    assert env_str("MODELLO_DI_PROVA", "voyage-4") == "voyage-3-large"


def test_a_value_is_stripped(monkeypatch):
    """Uno spazio finale in un nome di modello diventa un 404 dal fornitore."""
    monkeypatch.setenv("MODELLO_DI_PROVA", " rerank-2.5\n")
    assert env_str("MODELLO_DI_PROVA", "x") == "rerank-2.5"


def test_an_empty_number_does_not_kill_the_import(monkeypatch):
    """int("") solleva ValueError durante l'import del modulo: l'applicazione
    non parte affatto, e il traceback non nomina la variabile responsabile."""
    monkeypatch.setenv("NUMERO_DI_PROVA", "")
    assert env_int("NUMERO_DI_PROVA", 64) == 64


def test_an_unreadable_number_falls_back_and_says_so(monkeypatch, caplog):
    monkeypatch.setenv("NUMERO_DI_PROVA", "sessantaquattro")
    with caplog.at_level("WARNING"):
        assert env_int("NUMERO_DI_PROVA", 64) == 64
    assert any("NUMERO_DI_PROVA" in r.message for r in caplog.records)


def test_numbers_are_read_when_readable(monkeypatch):
    monkeypatch.setenv("NUMERO_DI_PROVA", "128")
    assert env_int("NUMERO_DI_PROVA", 64) == 128
    monkeypatch.setenv("NUMERO_DI_PROVA", "2.5")
    assert env_float("NUMERO_DI_PROVA", 1.5) == pytest.approx(2.5)
