"""Fusione RRF e porta di astensione.

Pure funzioni sui risultati dei rami, quindi verificabili senza database.
"""

from __future__ import annotations

from app.lib.rag.search import Entities, Hit, rrf_fuse, should_abstain


def hit(chunk_id: int, score: float = 0.0, branch: str = "x") -> Hit:
    return Hit(chunk_id=chunk_id, document_id=chunk_id, source_path=f"{chunk_id}.md",
               slug=None, heading=None, text="", score=score, branch=branch,
               code_tokens=[])


def test_corroborated_result_outranks_a_single_branch_leader():
    """Il motivo per cui si fonde: un chunk trovato da due rami vale piu' di uno
    trovato solo dal ramo denso, anche se quello lo metteva primo."""
    fused = rrf_fuse({
        "dense": [hit(1), hit(2)],
        "fulltext": [hit(3), hit(2)],
    })
    assert fused[0].chunk_id == 2
    assert fused[0].branch == "dense+fulltext"


def test_fusion_uses_rank_not_score():
    """I punteggi dei rami non sono commensurabili: un ts_rank_cd di 1.4 non e'
    'meglio' di un coseno di 0.9. Se la fusione guardasse i punteggi, il ramo
    con la scala piu' larga vincerebbe sempre."""
    fused = rrf_fuse({
        "dense": [hit(1, score=0.99)],
        "fulltext": [hit(2, score=1400.0)],
    })
    # Entrambi primi nel proprio ramo, quindi pari merito.
    assert {h.chunk_id for h in fused} == {1, 2}
    assert fused[0].score == fused[1].score


def test_limit_is_applied_after_fusion():
    fused = rrf_fuse({"dense": [hit(i) for i in range(20)]}, limit=5)
    assert len(fused) == 5


def test_empty_branches_fuse_to_nothing():
    assert rrf_fuse({"dense": [], "fulltext": []}) == []


def test_abstains_when_only_the_dense_branch_answered():
    """Il ramo denso restituisce sempre k risultati: non ha soglia. Se e' l'unico
    ad aver risposto, l'unica prova e' 'questi sono i chunk meno lontani del
    corpus' - vero per qualunque domanda, compresa una fuori tema."""
    assert should_abstain(
        Entities(slugs=[], codes=[]),
        {"dense": [hit(1), hit(2)], "fulltext": [], "exact": []},
    )


def test_does_not_abstain_when_a_part_was_recognised():
    assert not should_abstain(
        Entities(slugs=["wizard-rod"], codes=[]),
        {"dense": [hit(1)], "fulltext": [], "exact": []},
    )


def test_does_not_abstain_when_a_designation_matched():
    assert not should_abstain(
        Entities(slugs=[], codes=["9-60"]),
        {"dense": [], "fulltext": [], "exact": [hit(1)]},
    )


def test_does_not_abstain_on_lexical_corroboration():
    """Nessuna entita' riconosciuta, ma il full-text trova il testo: e' una
    domanda in linguaggio naturale su un argomento che il corpus copre."""
    assert not should_abstain(
        Entities(slugs=[], codes=[]),
        {"dense": [hit(1)], "fulltext": [hit(2)], "exact": []},
    )
