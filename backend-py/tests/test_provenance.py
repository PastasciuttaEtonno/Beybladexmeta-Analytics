"""La provenienza di una sezione, dal markdown fino ai metadati del chunk.

La knowledge base non contiene solo fatti: accanto al peso dichiarato dal
produttore c'e' il giudizio di un appassionato, importato da un sito terzo. Sono
entrambi testo. Se la differenza non e' leggibile dalla macchina, arrivano al
modello con la stessa autorevolezza e vengono citati allo stesso modo - ed e'
cosi' che un'opinione diventa un fatto in una risposta.
"""

from __future__ import annotations

from app.lib.rag import chunking

SCHEDA = """---
slug: ball
type: component
slot: bit
canonical_name: "Ball"
---

# Ball

## Profilo

Ball e' un Bit del sistema BX, di tipo resistenza.

<!-- Generato da tools/import_wiki_facts.py -->

## Valutazione esterna (opinione)

<!-- provenance: third-party | source: https://beyblade.wiki/ball-bit/ | kind: opinion -->

Ball is one of the best stamina type Bits.
"""


def _chunk(document, heading):
    return next(c for c in document.chunks if c.heading == heading)


def test_provenance_is_parsed_into_the_chunk():
    document = chunking.parse("knowledge/bits/ball.md", SCHEDA)
    opinion = _chunk(document, "Valutazione esterna (opinione)")
    assert opinion.provenance["provenance"] == "third-party"
    assert opinion.provenance["kind"] == "opinion"
    assert opinion.provenance["source"] == "https://beyblade.wiki/ball-bit/"


def test_a_section_without_the_directive_carries_no_provenance():
    """L'assenza deve restare distinguibile: un chunk senza direttiva e'
    materiale nostro, non materiale di terzi non etichettato."""
    document = chunking.parse("x.md", SCHEDA)
    assert _chunk(document, "Profilo").provenance == {}


def test_comments_are_stripped_from_the_embedded_text():
    """I commenti sono note per chi cura la scheda. Embeddarli costa, li fa
    comparire fra le fonti mostrate al lettore, e nel caso della direttiva
    metterebbe un URL dentro il testo che il modello legge."""
    document = chunking.parse("x.md", SCHEDA)
    for chunk in document.chunks:
        assert "<!--" not in chunk.text
        assert "beyblade.wiki" not in chunk.text
        assert "import_wiki_facts" not in chunk.text
    assert _chunk(document, "Profilo").text.startswith("Ball e' un Bit")


def test_a_section_holding_only_a_directive_is_not_a_chunk():
    """Una direttiva senza testo sotto non e' contenuto."""
    body = SCHEDA.replace("Ball is one of the best stamina type Bits.\n", "")
    document = chunking.parse("x.md", body)
    assert all(c.heading != "Valutazione esterna (opinione)" for c in document.chunks)


def test_directive_does_not_change_the_hash_of_other_sections():
    """Aggiungere una sezione importata non deve far riembeddare le altre."""
    without = chunking.parse("x.md", SCHEDA[: SCHEDA.index("## Valutazione")])
    with_ = chunking.parse("x.md", SCHEDA)
    assert _chunk(without, "Profilo").chunk_hash == _chunk(with_, "Profilo").chunk_hash
