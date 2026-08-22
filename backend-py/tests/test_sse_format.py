"""Il formato degli eventi SSE.

Il bug che li rende necessari: nel modulo esistevano insieme `import json as
_json` e una funzione `def _json(value)`. La funzione, definita piu' in basso,
vinceva - quindi `_json.dumps` cadeva su un oggetto funzione e OGNI evento
falliva.

Il sintomo era HTTP 200 con corpo vuoto, che e' il modo peggiore di rompersi:
lo stato dice che e' andato bene, il client non riceve niente, e nei log
l'eccezione compare dentro lo stream invece che come risposta di errore.
"""

from __future__ import annotations

import json

from app.routers.chat import _dumps, _sse


def test_an_event_has_a_name_and_a_data_line():
    """Il nome in `event:` oltre che nel JSON: cosi' un client puo' registrarsi
    sul singolo tipo con addEventListener invece di smistare ogni messaggio."""
    raw = _sse({"event": "sources", "sources": []})
    lines = raw.split("\n")
    assert lines[0] == "event: sources"
    assert lines[1].startswith("data: ")


def test_an_event_ends_with_a_blank_line():
    """E' la riga vuota a delimitare un evento: senza, il client aspetterebbe
    all'infinito che il primo finisca."""
    assert _sse({"event": "delta", "text": "x"}).endswith("\n\n")


def test_the_payload_survives_a_round_trip():
    payload = {"event": "tool", "name": "component_usage", "sample_size": 29}
    line = _sse(payload).split("\n")[1]
    assert json.loads(line[len("data: "):]) == payload


def test_accents_are_not_escaped():
    """ensure_ascii=False: il corpus e' italiano, e '\\u00e8' al posto di 'è'
    triplica il peso di ogni frammento."""
    raw = _sse({"event": "delta", "text": "però"})
    assert "però" in raw


def test_a_newline_in_the_text_does_not_break_the_event():
    """Un a capo dentro il testo diventerebbe un separatore di riga SSE e
    spezzerebbe l'evento in due. json.dumps lo codifica, ed e' il motivo per cui
    i frammenti viaggiano dentro JSON invece che come testo nudo."""
    raw = _sse({"event": "delta", "text": "prima\nseconda"})
    assert raw.count("\n") == 3  # event, data, e la riga vuota finale
    payload = json.loads(raw.split("\n")[1][len("data: "):])
    assert payload["text"] == "prima\nseconda"


def test_dumps_handles_dates_and_unknown_types():
    """default=str: as_of e' una data, e senza questo un evento `tool` non
    sarebbe serializzabile."""
    from datetime import date

    assert "2026-08-21" in _dumps({"as_of": date(2026, 8, 21)})
