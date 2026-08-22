"""I tool quantitativi: contratto, schemi e difese.

I test che toccano il database vivono in tools_integration.py e girano a mano;
qui resta cio' che si verifica senza rete ne' Postgres, che e' la parte dove gli
errori sono silenziosi: uno schema che non combacia col dispatcher, un contratto
di ritorno senza numerosita', un limite non applicato.
"""

from __future__ import annotations

import pytest

from app.lib.rag.tools import (
    SLOT_COLUMN,
    THIN_SAMPLE,
    TOOL_DEFINITIONS,
    ToolResult,
    _DISPATCH,
    _real,
    _season_filter,
)


def test_every_definition_has_a_handler_and_viceversa():
    """Uno schema senza funzione e' un tool che il modello puo' chiamare e che
    esplode; una funzione senza schema e' codice che il modello non vedra' mai."""
    assert {t["name"] for t in TOOL_DEFINITIONS} == set(_DISPATCH)


def test_schemas_are_strict_and_closed():
    """strict + additionalProperties:false garantiscono che gli argomenti
    validino esattamente. Senza, un parametro allucinato dal modello arriverebbe
    fino alla funzione."""
    for definition in TOOL_DEFINITIONS:
        assert definition["strict"] is True, definition["name"]
        schema = definition["input_schema"]
        assert schema["additionalProperties"] is False, definition["name"]
        # strict richiede che ogni proprieta' sia in `required`; l'opzionalita'
        # si esprime col tipo ["string", "null"], non omettendo il campo.
        assert set(schema["required"]) == set(schema["properties"]), definition["name"]


def test_slot_enums_match_the_real_slots():
    """Un enum che elenca uno slot inesistente porta il modello a chiamare un
    tool con un valore che il codice rifiuta, e a riprovare a vuoto.

    null e' ammesso dove lo slot e' facoltativo - current_meta senza slot
    restituisce le combo intere - e non e' uno slot, quindi si esclude dal
    confronto invece di aggiungerlo a SLOT_COLUMN.
    """
    for definition in TOOL_DEFINITIONS:
        slot = definition["input_schema"]["properties"].get("slot")
        if slot:
            values = {v for v in slot["enum"] if v is not None}
            assert values == set(SLOT_COLUMN), definition["name"]


def test_descriptions_say_when_to_use_the_tool():
    """La descrizione e' dove si decide il routing. Una che dica solo cosa fa la
    funzione produce chiamate sbagliate piu' di qualunque bug."""
    for definition in TOOL_DEFINITIONS:
        assert len(definition["description"]) > 80, definition["name"]


def test_result_always_carries_sample_size_and_as_of():
    payload = ToolResult(rows=[], sample_size=0, as_of="2026-01-16",
                         source="unified_meta_view").to_dict()
    assert "sample_size" in payload and "as_of" in payload


def test_empty_result_says_the_data_is_absent_not_zero():
    """La differenza conta: 'nessun piazzamento' non e' 'zero vittorie'."""
    result = ToolResult(rows=[], sample_size=0, as_of="x", source="y")
    assert any("non esiste" in note for note in result.notes)


def test_thin_sample_is_flagged_automatically():
    """La nota non e' facoltativa e non dipende da chi scrive il tool: nasce dal
    contratto di ritorno, quindi nessun tool puo' dimenticarsene."""
    result = ToolResult(rows=[{}], sample_size=THIN_SAMPLE - 1, as_of="x", source="y")
    assert any("Campione ridotto" in note for note in result.notes)

    healthy = ToolResult(rows=[{}], sample_size=THIN_SAMPLE, as_of="x", source="y")
    assert healthy.notes == []


def test_placeholders_are_not_real_components():
    """'None' e '-' sono 'nessun pezzo in questa posizione'. Contarli come pezzi
    e' cio' che mette 'None' nella classifica dei ratchet - come fa oggi
    /api/analytics/meta, con 56 punti."""
    assert _real("WizardRod")
    assert not _real("None")
    assert not _real("none")
    assert not _real("-")
    assert not _real("")
    assert not _real(None)


@pytest.mark.parametrize("value", ["", "all", "All Time", "sempre", None])
def test_all_time_seasons_add_no_filter(value):
    clause, args = _season_filter(value)
    assert clause == "" and args == {}


def test_a_named_season_is_bound_not_interpolated():
    """Il nome della stagione arriva dal modello: deve restare un parametro."""
    clause, args = _season_filter("Off Season 2025")
    assert ":season" in clause
    assert args == {"season": "Off Season 2025"}


@pytest.mark.asyncio
async def test_unknown_tool_returns_an_error_instead_of_raising():
    """In un ciclo agentico un'eccezione interrompe il turno; un errore
    restituito lascia al modello la possibilita' di correggersi."""
    from app.lib.rag.tools import call_tool

    result = await call_tool(None, "inventato", {})
    assert "error" in result
    assert "disponibili" in result
