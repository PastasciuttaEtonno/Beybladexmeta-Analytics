"""Chunking, hashing and code-token extraction.

No database and no network: everything here is a pure function, which is why it
can be the fast test. The behaviours pinned below are the ones the rest of the
pipeline assumes, and each has a specific way of going wrong silently.
"""

from __future__ import annotations

from app.lib.rag import chunking

SCHEDA = """---
id: blade.wizard-rod
slug: wizard-rod
type: component
slot: blade
canonical_name: "WizardRod"
system: UX
lang: it
---

# WizardRod

Riassunto di una riga prima di qualunque heading.

## Profilo

Un blade orientato alla resistenza.

## Interazioni

Questo pezzo mantiene la rotazione contro un attacco frontale
quando e' montato su 9-60.

## Sinergie note

<!-- da scrivere -->
"""


def test_frontmatter_and_body_split():
    document = chunking.parse("knowledge/blades/wizard-rod.md", SCHEDA)
    assert document.slug == "wizard-rod"
    assert document.doc_type == "component"
    assert document.slot == "blade"
    assert document.frontmatter["canonical_name"] == "WizardRod"
    assert document.lang == "it"


def test_preamble_is_kept_not_dropped():
    """The line before the first heading is usually the summary. Losing it means
    losing the one sentence that answers "what is this part"."""
    document = chunking.parse("x.md", SCHEDA)
    first = document.chunks[0]
    assert first.heading is None
    assert "Riassunto di una riga" in first.text


def test_placeholder_sections_are_skipped():
    """A scaffolded section must not become a chunk: it would cost an embedding
    call and put empty text in front of the model."""
    document = chunking.parse("x.md", SCHEDA)
    assert all(chunk.heading != "Sinergie note" for chunk in document.chunks)
    assert [c.heading for c in document.chunks] == [None, "Profilo", "Interazioni"]


def test_ratchet_designations_are_extracted_exactly():
    """The whole reason code_tokens exists. An embedder puts 9-60 and 1-60 in
    almost the same place; these two must never be confused."""
    document = chunking.parse("x.md", SCHEDA)
    interazioni = next(c for c in document.chunks if c.heading == "Interazioni")
    assert "9-60" in interazioni.code_tokens
    assert "1-60" not in interazioni.code_tokens
    assert "UX" not in interazioni.code_tokens  # the system is in the frontmatter, not the prose


def test_known_names_come_from_the_registry_not_from_capitalisation():
    text = "Buono contro DranSword, meno contro Dran."
    assert chunking.extract_code_tokens(text, ["DranSword", "Dran"]) == ["DranSword", "Dran"]
    # Nothing is invented when the registry does not know the word.
    assert chunking.extract_code_tokens(text, []) == []


def test_hash_ignores_reflowing():
    """Rewrapping a paragraph, or a checkout that changes line endings, must not
    invalidate the corpus and re-bill every chunk."""
    a = chunking.parse("x.md", SCHEDA)
    b = chunking.parse("x.md", SCHEDA.replace("frontale\nquando", "frontale quando"))
    assert a.content_hash == b.content_hash
    assert [c.chunk_hash for c in a.chunks] == [c.chunk_hash for c in b.chunks]


def test_hash_changes_when_the_text_changes():
    a = chunking.parse("x.md", SCHEDA)
    b = chunking.parse("x.md", SCHEDA.replace("resistenza", "attacco"))
    assert a.content_hash != b.content_hash
    changed = [
        (x.heading, x.chunk_hash != y.chunk_hash) for x, y in zip(a.chunks, b.chunks)
    ]
    # Exactly one section moved, so exactly one chunk is re-embedded.
    assert [heading for heading, differs in changed if differs] == ["Profilo"]


def test_context_header_names_the_subject():
    """A chunk saying "questo pezzo" has to retrieve for the part's name."""
    document = chunking.parse("x.md", SCHEDA)
    interazioni = next(c for c in document.chunks if c.heading == "Interazioni")
    header = chunking.build_context_header(document, interazioni)
    assert "WizardRod" in header
    assert "Interazioni" in header
    assert "UX" in header


def test_oversized_section_splits_on_blank_lines():
    body = "---\nslug: x\ntype: guide\n---\n\n## Lungo\n\n" + "\n\n".join(
        f"Paragrafo numero {i}. " + "parola " * 60 for i in range(12)
    )
    document = chunking.parse("x.md", body)
    assert len(document.chunks) > 1
    assert all(chunk.token_count <= chunking.MAX_TOKENS * 1.2 for chunk in document.chunks)
    # Ordinals stay dense and ordered, because kb_chunk has a unique key on them.
    assert [c.ordinal for c in document.chunks] == list(range(len(document.chunks)))


def test_file_without_frontmatter_still_parses():
    document = chunking.parse("x.md", "## Solo testo\n\nQualcosa.\n")
    assert document.frontmatter == {}
    assert document.doc_type == "guide"
    assert len(document.chunks) == 1


SCAFFOLD = """---
slug: 9-60
type: component
slot: ratchet
canonical_name: "9-60"
---

# 9-60

## Profilo

<!-- da scrivere -->

## Interazioni

<!-- da scrivere -->
"""


def test_scaffolded_scheda_produces_no_chunks():
    """A scaffolded scheda with nothing written must cost nothing at all.

    Left in, the `# Nome` line becomes a one-line chunk per file: 171 files of
    pure title, each costing an embedding call and each retrievable as if it
    were knowledge. Caught only because ingesting the scaffold was supposed to
    be free and was not.
    """
    document = chunking.parse("knowledge/ratchets/9-60.md", SCAFFOLD)
    assert document.chunks == []


def test_title_stripped_but_real_preamble_kept():
    """Dropping the title must not also drop the summary line under it."""
    body = SCAFFOLD.replace("# 9-60\n", "# 9-60\n\nUna frase vera.\n")
    document = chunking.parse("x.md", body)
    assert [c.heading for c in document.chunks] == [None]
    assert document.chunks[0].text == "Una frase vera."


def test_document_with_only_a_title_has_no_chunks():
    document = chunking.parse("x.md", "---\nslug: x\ntype: guide\n---\n\n# Solo titolo\n")
    assert document.chunks == []
