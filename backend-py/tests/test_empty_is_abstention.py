"""Nessun risultato deve essere dichiarato come astensione.

Il caso reale che l'ha rivelato: "come si monta Lightning L-Drago in Metal
Fight". LightningL-Drago e' un pezzo registrato ma senza scheda scritta, quindi
l'entity linking lo riconosce - e la regola di corroborazione non scatta - poi
il filtro rigido restringe a quel pezzo, non trova nulla, e tutti i rami tornano
vuoti.

Il risultato era una lista vuota con abstained=False: "ho cercato, non mi
astengo". A valle il modello riceverebbe un contesto vuoto insieme al permesso
implicito di rispondere, cioe' l'invito a rispondere a memoria. E' la stessa
classe di errore del re-ranker che dichiarava utilizzabili punteggi di un'altra
scala: un valore di ritorno che dice qualcosa di diverso da cio' che e'
successo.
"""

from __future__ import annotations

from app.lib.rag.search import Entities, Hit, rrf_fuse, should_abstain


def hit(chunk_id: int) -> Hit:
    return Hit(chunk_id=chunk_id, document_id=chunk_id, source_path=f"{chunk_id}.md",
               slug=None, heading=None, text="", score=0.0, branch="dense",
               code_tokens=[])


def test_fusion_of_empty_branches_is_empty():
    assert rrf_fuse({"dense": [], "fulltext": [], "exact": []}) == []


def test_corroboration_does_not_fire_when_a_part_was_recognised():
    """Il presupposto del bug: riconoscere il pezzo disattiva la regola di
    corroborazione, quindi serve un secondo controllo piu' a valle."""
    assert not should_abstain(
        Entities(slugs=["lightningl-drago"], codes=[]),
        {"dense": [], "fulltext": [], "exact": []},
    )


def test_a_recognised_part_without_a_scheda_yields_nothing_to_fuse():
    """Filtro rigido su uno slug senza chunk vivi: ogni ramo torna vuoto, e la
    fusione non puo' inventare candidati. hybrid() deve tradurlo in astensione."""
    branches = {"dense": [], "fulltext": [], "exact": []}
    assert rrf_fuse(branches, limit=8) == []
    # E con almeno un candidato, invece, non si astiene.
    assert rrf_fuse({"dense": [hit(1)]}, limit=8)
