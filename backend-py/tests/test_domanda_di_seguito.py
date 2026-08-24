"""Una domanda di seguito trova quello che la precedente aveva trovato.

Il difetto, preso dai log di produzione (sessione 10):

    utente:      45
    assistente:  "45 e' il valore di attacco di ..."
    utente:      Perche'?
    assistente:  "Non ho trovato niente nel sito che risponda a questa domanda."

La cronologia arrivava al MODELLO ma non al RECUPERO, e l'astensione decisa dal
recupero torna indietro PRIMA che il modello venga chiamato: la storia non aveva
modo di servire proprio nel caso in cui serviva.

Qui si verifica la politica, non la ricerca: `search.hybrid` e' sostituita da una
finta che registra con quali testi viene chiamata. Nessuna chiave, nessuna rete,
nessun database.
"""

from __future__ import annotations

import pytest

from app.lib.rag import generate, search


def _esito(*, abstained: bool) -> search.Retrieval:
    return search.Retrieval(
        hits=[],
        entities=search.Entities(slugs=[], codes=[]),
        abstained=abstained,
        reason="sotto la soglia di pertinenza" if abstained else None,
    )


class RicercaFinta:
    """Restituisce esiti preparati e ricorda cosa le e' stato chiesto."""

    def __init__(self, *esiti):
        self._esiti = list(esiti)
        self.domande: list[str] = []

    async def __call__(self, session, question, embedder, *, limit=5, reranker=None):
        self.domande.append(question)
        return self._esiti.pop(0) if self._esiti else _esito(abstained=True)


STORIA = [
    {"role": "user", "content": "quanto pesa il ratchet 9-60"},
    {"role": "assistant", "content": "Pesa 6,2 g."},
]


def test_la_domanda_precedente_si_unisce_a_quella_nuova():
    assert generate.con_contesto("Perche'?", STORIA) == "quanto pesa il ratchet 9-60 Perche'?"


def test_senza_cronologia_non_c_e_contesto():
    assert generate.con_contesto("Perche'?", []) is None
    assert generate.con_contesto("Perche'?", None) is None


def test_si_cammina_indietro_fino_a_una_domanda_che_si_regge():
    """In una serie di domande brevi l'ultima non aiuta piu' della penultima:
    serve quella che nomina ancora qualcosa."""
    storia = STORIA + [
        {"role": "user", "content": "e quello?"},
        {"role": "assistant", "content": "Non ho capito."},
    ]
    assert generate.con_contesto("perche'?", storia) == "quanto pesa il ratchet 9-60 perche'?"


def test_una_cronologia_di_sole_domande_brevi_non_offre_contesto():
    storia = [{"role": "user", "content": "e quello?"},
              {"role": "assistant", "content": "Non ho capito."}]
    assert generate.con_contesto("perche'?", storia) is None


def test_le_risposte_dell_assistente_non_diventano_contesto():
    """Sono lunghe e piene di parole del dominio: accostarle alla domanda
    sposterebbe l'embedding verso la risposta precedente invece che verso la
    nuova domanda."""
    storia = [{"role": "assistant", "content": "Il ratchet 9-60 pesa 6,2 grammi e ha nove lame."}]
    assert generate.con_contesto("perche'?", storia) is None


async def test_si_riprova_col_contesto_solo_dopo_un_buco(monkeypatch):
    finta = RicercaFinta(_esito(abstained=True), _esito(abstained=False))
    monkeypatch.setattr(search, "hybrid", finta)

    esito = await generate._recupera(
        None, "Perche'?", None, limit=5, reranker=None, history=STORIA)

    assert finta.domande == ["Perche'?", "quanto pesa il ratchet 9-60 Perche'?"]
    assert esito.abstained is False
    # Il campo esiste perche' guardando i log si sappia che si e' cercato con un
    # testo che l'utente non ha mai scritto.
    assert esito.riformulata == "quanto pesa il ratchet 9-60 Perche'?"


async def test_una_domanda_che_trova_non_paga_il_secondo_giro(monkeypatch):
    """Il costo del contesto si paga solo sul percorso che oggi fallisce."""
    finta = RicercaFinta(_esito(abstained=False))
    monkeypatch.setattr(search, "hybrid", finta)

    await generate._recupera(
        None, "come si comporta il 9-60", None, limit=5, reranker=None, history=STORIA)

    assert finta.domande == ["come si comporta il 9-60"]


async def test_se_non_trova_nemmeno_col_contesto_ci_si_astiene(monkeypatch):
    """Cercare col contesto non e' una licenza per rispondere lo stesso.

    Torna il PRIMO esito, non il secondo: la diagnostica deve raccontare la
    domanda che l'utente ha scritto davvero."""
    primo = _esito(abstained=True)
    finta = RicercaFinta(primo, _esito(abstained=True))
    monkeypatch.setattr(search, "hybrid", finta)

    esito = await generate._recupera(
        None, "Perche'?", None, limit=5, reranker=None, history=STORIA)

    assert esito is primo
    assert esito.abstained is True
    assert esito.riformulata is None


async def test_il_campo_riformulata_finisce_nella_diagnostica(monkeypatch):
    finta = RicercaFinta(_esito(abstained=True), _esito(abstained=False))
    monkeypatch.setattr(search, "hybrid", finta)

    esito = await generate._recupera(
        None, "Perche'?", None, limit=5, reranker=None, history=STORIA)

    assert esito.to_dict()["riformulata"] == "quanto pesa il ratchet 9-60 Perche'?"
