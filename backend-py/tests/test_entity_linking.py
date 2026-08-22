"""Candidate generation for entity linking.

No database: this pins the string handling, which is where the linking went
wrong the first time. What the candidates are then matched against is a plain
lookup in component_alias, and that part is hard to get subtly wrong.
"""

from __future__ import annotations

from app.lib.rag.search import candidate_forms


def test_camelcase_name_survives_a_lowercase_word_before_it():
    """The regression. A single regex used to consume 'il WizardRod' as
    'il Wizard' + 'Rod', so no compound part name was ever recognised - and
    because the fallback was a hard filter that simply stayed off, nothing
    reported an error."""
    forms = candidate_forms("il WizardRod come si comporta")
    assert "wizardrod" in forms


def test_spaced_and_joined_spellings_produce_the_same_key():
    assert "wizardrod" in candidate_forms("parlami di Wizard Rod")
    assert "wizardrod" in candidate_forms("parlami di WizardRod")


def test_designations_are_candidates_too():
    """A ratchet's name starts with a digit. A word pattern that requires a
    letter first leaves the hard filter off for the queries that identify a
    part most precisely."""
    forms = candidate_forms("cosa succede con il ratchet 9-60")
    assert "960" in forms


def test_short_tokens_alone_are_not_candidates():
    """'il', 'di', 'un' would match nothing and cost a scan each."""
    forms = candidate_forms("il di un")
    assert "il" not in forms
    assert "di" not in forms


def test_pairs_do_not_invent_a_third_word():
    forms = candidate_forms("Dran Sword contro Dran Dagger")
    assert "dransword" in forms
    assert "drandagger" in forms
    # 'sword contro' is a pair, but it resolves to nothing in the registry and
    # so costs only a hash lookup.
    assert "swordcontrodran" not in forms
