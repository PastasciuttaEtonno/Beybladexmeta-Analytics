"""La verifica meccanica della risposta.

E' l'unico controllo anti-allucinazione che non dipende dalla buona volonta' del
modello: tutto il resto sono istruzioni nel prompt, e un'istruzione disattesa
non lascia traccia. Questi test difendono il controllo stesso.
"""

from __future__ import annotations

from app.lib.rag.guard import Verdict, verify


INJECTED = {"knowledge/blades/wizard-rod.md", "knowledge/ratchets/9-60.md"}
TOOLS = {"component_usage", "top_combos"}


def test_a_citation_that_was_injected_passes():
    verdict = verify(
        "Il WizardRod tiene la rotazione [[knowledge/blades/wizard-rod.md]].",
        injected_sources=INJECTED, tool_names=TOOLS,
    )
    assert verdict.ok
    assert verdict.phantom_citations == []


def test_an_invented_citation_is_caught():
    """Il segnale piu' netto che una risposta e' stata costruita a memoria."""
    verdict = verify(
        "Come spiegato in [[knowledge/blades/inventato.md]], il pezzo e' pesante.",
        injected_sources=INJECTED, tool_names=TOOLS,
    )
    assert not verdict.ok
    assert verdict.phantom_citations == ["knowledge/blades/inventato.md"]


def test_a_real_document_that_was_not_retrieved_is_still_phantom():
    """Citare un documento che esiste ma non e' stato recuperato e' comunque
    inventarselo: il modello non l'ha letto, quindi non puo' saperne il
    contenuto. injected_sources sono i chunk finiti nel prompt, non il corpus."""
    verdict = verify(
        "[[knowledge/bits/hexa.md]] dice altro.",
        injected_sources=INJECTED, tool_names=TOOLS,
    )
    assert verdict.phantom_citations == ["knowledge/bits/hexa.md"]


def test_an_invented_tool_name_is_caught():
    verdict = verify(
        "Ha vinto 12 volte (fonte: statistiche_globali).",
        injected_sources=INJECTED, tool_names=TOOLS,
    )
    assert not verdict.ok
    assert verdict.unknown_tools == ["statistiche_globali"]


def test_a_number_present_in_a_tool_result_is_accepted():
    verdict = verify(
        "Ha 383 vittorie (fonte: component_usage).",
        injected_sources=INJECTED, tool_names=TOOLS,
        tool_results=[{"rows": [{"punti": 383}], "sample_size": 29}],
    )
    assert verdict.unsourced_numbers == []


def test_italian_decimals_match_the_json_form():
    """'75,0' nella risposta e 75.0 nel payload sono lo stesso numero. Senza
    normalizzare, ogni percentuale scritta all'italiana sarebbe un falso
    positivo e il controllo diventerebbe rumore da ignorare."""
    verdict = verify(
        "Compare nel 62,1% dei casi (fonte: component_usage).",
        injected_sources=INJECTED, tool_names=TOOLS,
        tool_results=[{"rows": [{"quota_pct": 62.1}]}],
    )
    assert verdict.unsourced_numbers == []


def test_a_number_from_nowhere_is_flagged():
    verdict = verify(
        "Vince circa il 47% delle partite.",
        injected_sources=INJECTED, tool_names=TOOLS,
        tool_results=[{"rows": [{"punti": 383}]}],
    )
    assert "47" in verdict.unsourced_numbers


def test_unsourced_numbers_do_not_fail_the_verdict():
    """Il controllo sui numeri ha falsi positivi noti - un valore calcolato
    correttamente da due altri verrebbe segnalato. Far fallire una risposta
    buona per un'euristica sarebbe peggio del problema che risolve, quindi il
    segnale resta visibile ma non blocca."""
    verdict = verify("Vince il 47%.", injected_sources=INJECTED, tool_names=TOOLS)
    assert verdict.unsourced_numbers
    assert verdict.ok


def test_numbers_found_in_the_context_count_as_sourced():
    """Le sezioni Sinergie contengono percentuali generate: se il modello ne
    riporta una, l'ha letta, non inventata."""
    verdict = verify(
        "1-60 compare nel 75% dei casi [[knowledge/blades/wizard-rod.md]].",
        injected_sources=INJECTED, tool_names=TOOLS,
        context_text="- 1-60 — 286 su 383 (75%)",
    )
    assert verdict.unsourced_numbers == []


def test_small_numbers_are_ignored():
    """'le 3 posizioni', 'i primi 5': fanno parte della lingua, non dei dati."""
    verdict = verify("Ci sono 5 posizioni e 3 sistemi.",
                     injected_sources=INJECTED, tool_names=TOOLS)
    assert verdict.unsourced_numbers == []


def test_a_repeated_bad_number_is_one_problem():
    verdict = verify("47 e ancora 47 e sempre 47.",
                     injected_sources=INJECTED, tool_names=TOOLS)
    assert verdict.unsourced_numbers == ["47"]


def test_empty_verdict_is_ok_but_says_nothing_about_correctness():
    assert Verdict().ok


# --- I falsi positivi trovati sulla prima risposta vera -------------------
#
# Il controllo segnalava 14, 18, 36, 39 e 261 su una risposta corretta. Il
# payload conteneva 14.3, 17.9, 35.7, 39.3 e 4261: la risposta aveva arrotondato
# le percentuali e scritto '4.261' col separatore delle migliaia. Un controllo
# che segnala esattamente cio' che una risposta ben scritta fa e' rumore, e il
# rumore si smette di guardarlo.

PAYLOAD = [{"rows": [{"punti": 4261, "montato_piu_spesso_con": {
    "blade": [{"quota_pct": 39.3}, {"quota_pct": 17.9}],
    "bit": [{"quota_pct": 35.7}, {"quota_pct": 14.3}]}}], "sample_size": 28}]


def test_a_thousands_separator_is_not_a_new_number():
    verdict = verify("Ha 4.261 punti (fonte: component_usage).",
                     injected_sources=INJECTED, tool_names=TOOLS,
                     tool_results=PAYLOAD)
    assert verdict.unsourced_numbers == []


def test_a_rounded_percentage_is_accepted():
    verdict = verify("Compare nel 39% e nel 18% dei casi.",
                     injected_sources=INJECTED, tool_names=TOOLS,
                     tool_results=PAYLOAD)
    assert verdict.unsourced_numbers == []


def test_rounding_is_allowed_only_towards_an_integer():
    """'14,7' quando il dato e' 14,3 non e' un arrotondamento: e' un altro
    numero. Concedere la tolleranza anche ai decimali svuoterebbe il controllo."""
    verdict = verify("Compare nel 14,7% dei casi.",
                     injected_sources=INJECTED, tool_names=TOOLS,
                     tool_results=PAYLOAD)
    assert "14,7" in verdict.unsourced_numbers


def test_an_invented_number_is_still_caught_after_the_tolerance():
    """La tolleranza non deve far passare tutto: 92 non e' vicino a nulla."""
    verdict = verify("Vince il 92% delle partite.",
                     injected_sources=INJECTED, tool_names=TOOLS,
                     tool_results=PAYLOAD)
    assert "92" in verdict.unsourced_numbers
