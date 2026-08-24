"""Retrieval over the knowledge base.

M1 scope: the dense branch, plus the two exact branches that need no model at
all. Fusion with RRF and the cross-encoder re-rank belong to M2 — the point of
keeping them apart is that recall can be measured here first, and the M2 numbers
then mean something because there is a baseline to compare them against.

The exact branches are already here because they are the ones that make this
domain work. A query naming 9-60 must not return chunks about 1-60, and no
amount of embedding quality achieves that: to a model those two strings are
nearly the same, while to a player they are different parts with opposite
statistics.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from functools import partial
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.rag.embeddings import Embedder, to_pgvector

log = logging.getLogger(__name__)

RATCHET = re.compile(r"\b\d{1,2}-\d{2}\b")
SYSTEM = re.compile(r"\b(?:BX|UX|CX)\b")

# Trigram similarity above which a near-miss is treated as a typo for a real
# part. Measured against the corpus rather than guessed:
#
#   'wizzardrod' vs 'wizardrod'        0.750   a typo, must be caught
#   'optimusprimal' vs 'optimusprime'  0.688   two DIFFERENT blades, must not be
#   'wizardrod' vs 'wizardarrow'       0.375   two different blades
#   '960' vs '160'                     0.143   two different ratchets
#
# 0.688 is the closest pair of genuinely distinct parts in the registry today,
# so anything above it is safe and anything at or below it merges two real
# parts. 0.70 sits in that gap. tools/check_kb_registry.py re-measures the
# closest pair on every run and fails if a new part ever closes it.
FUZZY_THRESHOLD = 0.70


TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]*")


def _normalise(value: str) -> str:
    """Mirrors kb_norm() in migration 0010."""
    return re.sub(r"[^a-z0-9]", "", value.lower())


# Le sigle dei bit che coincidono con una parola funzione italiana.
#
# Il registry ne contiene 42 di una o due lettere e occupano quasi tutto
# l'alfabeto, quindi la collisione non e' un caso limite: 'un' e' UnderNeedle,
# 'lo' e' LowOrb, 'e' e' Elevate, 'o' e' Orb, 'a' e' Accel, 'l' e' Level, 'd'
# e' Dot. Il maiuscolo di solito basta a separarle - i codici si scrivono LR,
# HN, FB - ma non quando arriva per un altro motivo: a inizio frase, o in un
# titolo. Queste sette restano fuori sempre. Gli altri modi in cui una maiuscola
# arriva senza voler dire niente - l'elisione, il punto di abbreviazione - li
# tratta _incollata(): li' il segnale e' la punteggiatura e non serve un elenco.
#
# Chi cerca davvero Elevate o Orb ha il nome per esteso, che funziona. Il
# contrario non e' vero: senza questa lista, 'un blade da attacco' verrebbe
# ristretto a UnderNeedle, perche' il collegamento entita' e' un filtro
# rigido, e la risposta sbagliata arriverebbe senza che nulla segnali un
# errore.
AMBIGUE = frozenset({"a", "d", "e", "l", "lo", "o", "un"})

# L'apostrofo tipografico e quello dattilografico. Chi scrive dal telefono manda
# il primo senza saperlo, quindi guardarne uno solo lascia scoperta meta' delle
# domande.
APOSTROFI = frozenset("'’")


def _incollata(query: str, m: re.Match[str]) -> bool:
    """La lettera non e' un nome: e' attaccata al resto di una parola.

    Due modi, e in entrambi e' la punteggiatura a dire quello che la maiuscola
    da sola non sa dire.

    **L'apostrofo.** "C'e' differenza fra Rush e LowRush?" collegava Cyclone, e
    la scheda di Cyclone finiva davvero fra le fonti della risposta. Cosi'
    "V'e' un blade migliore" tirava dentro Vortex e "S'intende" Spike. Nessuna
    delle tre e' coperta da AMBIGUE, che elenca parole funzione: C, V e S non lo
    sono, e' la lingua italiana che le elide.

    **Il punto di abbreviazione.** "parlami di T.Rex" collegava Taper accanto al
    blade giusto, perche' quella T e' una maiuscola isolata come le altre. Il
    punto pero' va distinto dal punto fermo: conta solo se subito dopo riprende
    una lettera o una cifra, senza spazio. Cosi' "T.Rex" e' una parola sola e
    "meglio F." a fine frase resta una sigla.

    La punteggiatura e' un segnale sintattico, non un elenco da mantenere: vale
    per tutte le lettere insieme, comprese quelle che nessuno ha ancora provato.
    """
    # frozenset e non stringa: `"" in "'’"` e' vero, e con APOSTROFI come
    # stringa una sigla a fine domanda ("cosa fa il bit LR") passava per elisa.
    dopo = query[m.end():m.end() + 2]
    if dopo[:1] in APOSTROFI:
        return True
    return dopo[:1] == "." and dopo[1:2].isalnum()


def candidate_forms(query: str) -> set[str]:
    """Normalised strings to look up in component_alias.

    Single tokens, and every adjacent pair. The pairs are what catch a name
    written with a space - 'Wizard Rod' normalises to the same key as
    'WizardRod', so one alias row covers both spellings.

    This replaced a single regex that tried to do it in one pass and instead
    glued a lowercase word onto the capitalised one after it: 'il WizardRod'
    came out as 'il Wizard' plus 'Rod', so no compound part name was ever
    recognised. Splitting the job in two is duller and correct.
    """
    trovati = list(TOKEN.finditer(query))
    tokens = [m.group() for m in trovati]

    # Se la domanda e' tutta maiuscola il maiuscolo non distingue piu' niente:
    # meglio perdere la sigla che scambiare una preposizione per un pezzo.
    urlata = query.isupper()

    forms: set[str] = set()
    for m in trovati:
        token = m.group()
        if len(token) > 2:
            forms.add(_normalise(token))
        elif token.isupper() and not urlata and not _incollata(query, m):
            norm = _normalise(token)
            if norm not in AMBIGUE:
                forms.add(norm)

    forms.update(
        _normalise(f"{a}{b}") for a, b in zip(tokens, tokens[1:])
    )
    forms.add(_normalise(query))
    forms.discard("")
    return forms


@dataclass
class Hit:
    chunk_id: int
    document_id: int
    source_path: str
    slug: str | None
    heading: str | None
    text: str
    score: float
    branch: str
    code_tokens: list[str]


@dataclass
class Retrieval:
    """L'esito del recupero, con abbastanza dettaglio per diagnosticarlo.

    `branch_counts` e `reason` non servono a rispondere: servono a capire una
    risposta sbagliata dopo, quando l'unica traccia rimasta e' quella salvata.
    La distinzione che rendono possibile e' la piu' importante di tutte - "il
    recupero ha portato i frammenti sbagliati" contro "erano giusti e il modello
    ha scritto male" - due problemi con soluzioni opposte, indistinguibili
    guardando solo il testo finale.
    """

    hits: list[Hit]
    entities: Entities
    abstained: bool

    # Quanti candidati ha prodotto ogni ramo. Un ramo sempre a zero e' un ramo
    # rotto, e senza questo numero resta rotto in silenzio - gli altri due
    # coprono l'assenza e il sistema sembra funzionare.
    branch_counts: dict[str, int] = field(default_factory=dict)
    fused_count: int = 0

    # Falso quando il re-ranker non ha prodotto punteggi utilizzabili. E' il
    # caso in cui la soglia di astensione cambia significato, quindi va saputo.
    reranked: bool = False
    top_score: float | None = None

    # Perche' ci si e' astenuti, quando ci si e' astenuti.
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Quello che finisce in chat_message.retrieval."""
        return {
            "branch_counts": self.branch_counts,
            "fused_count": self.fused_count,
            "reranked": self.reranked,
            "top_score": round(self.top_score, 4) if self.top_score is not None else None,
            "abstained": self.abstained,
            "reason": self.reason,
            "slugs": self.entities.slugs,
            "codes": self.entities.codes,
        }


@dataclass
class Entities:
    slugs: list[str]
    codes: list[str]

    def __bool__(self) -> bool:
        return bool(self.slugs or self.codes)


async def link_entities(session: AsyncSession, query: str) -> Entities:
    """Resolves part mentions before anything is searched.

    Deterministic and cheap: a regex for the designations, then an exact lookup
    against component_alias, then trigram only for what is left. What it finds
    becomes a hard filter, not a hint to a ranker — if the question names a
    part, chunks about a different part are not candidates.
    """
    codes = list(dict.fromkeys(RATCHET.findall(query) + SYSTEM.findall(query)))

    candidates = candidate_forms(query)

    slugs: list[str] = []
    if candidates:
        rows = await session.execute(
            text(
                "SELECT DISTINCT slug FROM component_alias "
                "WHERE alias_norm = ANY(:candidates)"
            ),
            {"candidates": list(candidates)},
        )
        slugs = [row[0] for row in rows]

    # Only when nothing matched exactly: a typo is worth catching, a second
    # loose match on top of a good exact one is not.
    if not slugs and candidates:
        rows = await session.execute(
            text(
                "SELECT slug, max(similarity(alias_norm, c)) AS s "
                "FROM component_alias, unnest(CAST(:candidates AS text[])) AS c "
                "WHERE similarity(alias_norm, c) >= :threshold "
                "GROUP BY slug ORDER BY s DESC LIMIT 3"
            ),
            {"candidates": list(candidates), "threshold": FUZZY_THRESHOLD},
        )
        slugs = [row[0] for row in rows]

    return Entities(slugs=slugs, codes=codes)


_LIVE = (
    "JOIN kb_document d ON d.id = c.document_id AND d.superseded_at IS NULL"
)

# The question's lexemes, joined with OR.
#
# plainto_tsquery ANDs everything, which sounds stricter and is in practice
# fatal: 'perche non vedo le over blade nei filtri' becomes
# 'perc' & 'ved' & 'over' & 'blad' & 'filtr', and a document has to contain
# every one of those to match. A real question always carries a verb the
# document does not use, so the branch fired almost never - it looked like it
# worked because the tests queried single words.
#
# to_tsvector does the stemming and drops the stop words; the lexemes come out
# already reduced, so the query is assembled with the 'simple' configuration to
# avoid stemming them a second time. ts_rank_cd then does the real work: a chunk
# matching four of the terms outranks one matching one. Precision is not this
# branch's job - it returns candidates, and RRF and the re-ranker sort them.
# La configurazione di ricerca testuale, unica per il lato query e per il lato
# indice (migrazione 0016). Sono lo STESSO confronto: se divergono, i lessemi
# della domanda e quelli dei frammenti smettono di combaciare, ed e' esattamente
# il difetto che ha reso "Qual è la combo più usata?" una domanda senza risposta.
TS_CONFIG = "italian_unaccent"

_OR_QUERY = (
    "to_tsquery('simple', (SELECT string_agg(lexeme, ' | ') "
    f"FROM unnest(to_tsvector('{TS_CONFIG}', :query))))"
)


async def dense(
    session: AsyncSession,
    query: str,
    embedder: Embedder,
    *,
    limit: int = 20,
    entities: Entities | None = None,
) -> list[Hit]:
    vector = (await embedder.embed([query], is_query=True))[0]
    slugs = entities.slugs if entities else []
    rows = await session.execute(
        text(
            f"SELECT c.id, c.document_id, d.source_path, d.slug, c.heading, c.text, c.code_tokens, "
            f"       1 - (c.embedding <=> CAST(:vector AS vector)) AS score "
            f"FROM kb_chunk c {_LIVE} "
            f"WHERE c.embedding IS NOT NULL AND c.embedding_model = :model "
            f"  AND (:no_filter OR c.meta->>'slug' = ANY(:slugs)) "
            f"ORDER BY c.embedding <=> CAST(:vector AS vector) LIMIT :limit"
        ),
        {
            "vector": to_pgvector(vector),
            "model": embedder.name,
            "slugs": slugs,
            "no_filter": not slugs,
            "limit": limit,
        },
    )
    return [_hit(row, "dense") for row in rows]


async def fulltext(
    session: AsyncSession, query: str, *, limit: int = 20, entities: Entities | None = None
) -> list[Hit]:
    """Ramo lessicale, con una soglia di copertura.

    L'OR da solo non basta. Passando da AND a OR il ramo e' smesso di non
    accendersi mai e ha cominciato ad accendersi sempre: 'che tempo fa domani a
    Milano' produce i lessemi doman|fa|mil|temp, e uno solo bastava a far
    tornare 140 chunk. Un ramo che risponde a qualunque domanda non aggiunge
    informazione ne' alla fusione ne' alla decisione di astenersi.

    Quindi si contano i lessemi che combaciano davvero. Misurato sul corpus:

        'perche non vedo le over blade nei filtri'   3 lessemi su 5
        'che tempo fa domani a Milano'               1 lessema su 4

    La soglia e' `min(2, lessemi della query)`: due termini per una domanda
    normale, uno solo quando la query e' una parola sola. L'indice GIN continua
    a filtrare per primo, quindi il conteggio si applica a poche righe.
    """
    slugs = entities.slugs if entities else []
    rows = await session.execute(
        text(
            f"WITH q AS (SELECT tsvector_to_array(to_tsvector('{TS_CONFIG}', :query)) AS lex) "
            f"SELECT t.id, t.document_id, t.source_path, t.slug, t.heading, t.text, "
            f"       t.code_tokens, t.score FROM ( "
            f"  SELECT c.id, c.document_id, d.source_path, d.slug, c.heading, c.text, "
            f"         c.code_tokens, ts_rank_cd(c.tsv, {_OR_QUERY}) AS score, "
            f"         cardinality(ARRAY(SELECT unnest(tsvector_to_array(c.tsv)) "
            f"                           INTERSECT SELECT unnest(q.lex))) AS matched, "
            f"         cardinality(q.lex) AS total "
            f"  FROM kb_chunk c {_LIVE} CROSS JOIN q "
            f"  WHERE c.tsv @@ {_OR_QUERY} "
            f"    AND (:no_filter OR c.meta->>'slug' = ANY(:slugs)) "
            f") t WHERE t.matched >= least(2, t.total) "
            f"ORDER BY t.matched DESC, t.score DESC LIMIT :limit"
        ),
        {"query": query, "slugs": slugs, "no_filter": not slugs, "limit": limit},
    )
    return [_hit(row, "fulltext") for row in rows]


async def exact(
    session: AsyncSession, entities: Entities, *, limit: int = 20
) -> list[Hit]:
    """The branch that makes designations work. A containment test, so 9-60
    matches 9-60 and nothing else."""
    if not entities.codes:
        return []
    rows = await session.execute(
        text(
            f"SELECT c.id, c.document_id, d.source_path, d.slug, c.heading, c.text, c.code_tokens, "
            f"       1.0 AS score "
            f"FROM kb_chunk c {_LIVE} "
            f"WHERE c.code_tokens && CAST(:codes AS text[]) LIMIT :limit"
        ),
        {"codes": entities.codes, "limit": limit},
    )
    return [_hit(row, "exact") for row in rows]


# La costante di Reciprocal Rank Fusion. 60 e' il valore della pubblicazione
# originale e non e' stato tarato qui: tararlo richiederebbe un golden set che
# misura anche il ramo denso, e con l'embedder deterministico quel ramo e'
# rumore. Resta 60 finche' non c'e' un embedder vero con cui verificare.
RRF_K = 60


def rrf_fuse(branches: dict[str, list[Hit]], *, limit: int = 8) -> list[Hit]:
    """Fonde i rami sommando 1/(k + rango), non i punteggi.

    I punteggi non sono confrontabili fra loro: una distanza coseno, un
    ts_rank_cd e un match binario vivono su scale diverse, e normalizzarli
    richiederebbe pesi che sembrano funzionare sul set di prova e non
    generalizzano. Il rango invece e' la stessa cosa in tutti e tre.

    Un documento trovato da piu' rami sale, ed e' il comportamento voluto: la
    corroborazione fra un match semantico e uno lessicale e' il segnale piu'
    forte che questo sistema produce.
    """
    scores: dict[int, float] = {}
    best: dict[int, Hit] = {}
    origins: dict[int, list[str]] = {}

    for branch, hits in branches.items():
        for rank, hit in enumerate(hits, start=1):
            scores[hit.chunk_id] = scores.get(hit.chunk_id, 0.0) + 1.0 / (RRF_K + rank)
            origins.setdefault(hit.chunk_id, []).append(branch)
            # Si tiene la copia del ramo che l'ha piazzato piu' in alto.
            if hit.chunk_id not in best:
                best[hit.chunk_id] = hit

    fused: list[Hit] = []
    for chunk_id in sorted(scores, key=lambda c: scores[c], reverse=True)[:limit]:
        hit = best[chunk_id]
        fused.append(
            Hit(
                chunk_id=hit.chunk_id, document_id=hit.document_id,
                source_path=hit.source_path, slug=hit.slug, heading=hit.heading,
                text=hit.text, code_tokens=hit.code_tokens,
                score=scores[chunk_id], branch="+".join(sorted(set(origins[chunk_id]))),
            )
        )
    return fused


def should_abstain(entities: Entities, branches: dict[str, list[Hit]]) -> bool:
    """Vero quando l'unica prova e' la vicinanza semantica.

    Il ramo denso restituisce sempre k risultati: non ha una soglia, e non puo'
    averne una onesta finche' l'embedder non e' quello di produzione, perche' un
    taglio sul coseno va calibrato per modello. Quindi la regola qui non e' una
    soglia ma una richiesta di CORROBORAZIONE: se nessuna entita' e' stata
    riconosciuta, nessuna sigla combacia e il full-text non trova nulla, allora
    l'unico segnale e' "questi sono i chunk meno lontani del corpus" - che per
    una domanda fuori tema e' vero e privo di significato.

    Da sostituire con un taglio sul punteggio del re-ranker quando ci sara':
    quello e' confrontabile fra query, mentre il coseno non lo e'.
    """
    if entities.slugs or entities.codes:
        return False
    return not branches.get("fulltext") and not branches.get("exact")


# Sotto questo punteggio del re-ranker il miglior candidato non e' pertinente.
#
# Misurato con tools/calibrate_abstention.py su voyage-4 + rerank-2.5, non scelto.
#
#   pertinenti  0.633 - 0.914   (13 casi)
#   fuori tema  0.000 - 0.645   (7 casi)
#
# LE DUE POPOLAZIONI SI SOVRAPPONGONO, e questa e' la cosa da sapere. Il caso
# fuori tema piu' alto - "qual e' il miglior driver di Beyblade Burst", 0,645 -
# supera il pertinente piu' basso, 0,633. Nessuna soglia li separa entrambi.
#
# La ragione non e' un difetto del re-ranker: una domanda su Beyblade Burst usa
# il vocabolario del corpus e recupera chunk che parlano davvero di pezzi di
# Beyblade. Sono pertinenti; sono solo della generazione sbagliata. Distinguere
# "fuori tema" da "poco pertinente" e' un giudizio di AMBITO, non di pertinenza,
# e un cross-encoder misura la seconda cosa.
#
# 0,60 e' quindi il compromesso onesto, non una separazione:
#   - sta sotto il pertinente piu' basso (0,633), quindi non scarta nulla di buono
#   - sta sopra il secondo fuori tema piu' alto (0,527), quindi ne ferma 6 su 7
#   - il settimo, quello a dominio vicino, arriva alla generazione e li' va
#     gestito nel prompt: il corpus copre solo Beyblade X e il modello deve
#     dirlo invece di rispondere.
#
# Una calibrazione precedente su due soli casi fuori tema dava 0,53 con un
# margine apparente di 0,254. Era falsa sicurezza: i due casi erano entrambi
# facili. Allargare la base da 2 a 7 ha rivelato la sovrapposizione.
RERANK_FLOOR = 0.60


async def hybrid(
    session: AsyncSession,
    query: str,
    embedder: Embedder,
    *,
    per_branch: int = 20,
    limit: int = 8,
    reranker=None,
    fuse_limit: int = 20,
) -> Retrieval:
    """Il percorso completo: entita', tre rami, fusione, re-rank, astensione.

    L'ordine e' quello: si astiene DOPO il re-rank quando il re-rank c'e',
    perche' il suo punteggio e' confrontabile fra query e la corroborazione no.
    La regola per corroborazione resta come rete quando il re-ranker manca o
    fallisce, che e' anche il caso in cui il suo punteggio non esiste.
    """
    entities = await link_entities(session, query)
    branches = {
        "dense": await dense(session, query, embedder, limit=per_branch, entities=entities),
        "fulltext": await fulltext(session, query, limit=per_branch, entities=entities),
        "exact": await exact(session, entities, limit=per_branch),
    }
    counts = {name: len(hits) for name, hits in branches.items()}
    report = partial(Retrieval, entities=entities, branch_counts=counts)

    if should_abstain(entities, branches):
        return report(hits=[], abstained=True, reason="corroborazione insufficiente")

    fused = rrf_fuse(branches, limit=max(fuse_limit, limit))
    # Nessun candidato e' un'astensione, e va dichiarata come tale. Accade
    # quando la domanda nomina un pezzo la cui scheda non e' ancora scritta: il
    # filtro rigido restringe a quel pezzo, non c'e' nulla, e tutti i rami
    # tornano vuoti. Restituire una lista vuota con abstained=False direbbe a
    # chi sta sopra "ho cercato e non mi astengo", e il modello proverebbe a
    # rispondere con un contesto vuoto - cioe' a memoria.
    if not fused:
        return report(hits=[], abstained=True, fused_count=0,
                      reason="nessun candidato dopo il filtro rigido")

    report = partial(report, fused_count=len(fused))

    if reranker is None:
        return report(hits=fused[:limit], abstained=False,
                      top_score=fused[0].score if fused else None)

    ranked, ok = await reranker.rerank(query, fused, top_k=limit)
    if not ok:
        # Il re-ranker non ha dato punteggi utilizzabili. Non e' fatale - si
        # prosegue con l'ordine della fusione - ma va detto forte: la soglia di
        # astensione e' tarata sui punteggi del re-rank, e senza di essi il
        # sistema sta girando con una rete in meno.
        log.error("[recupero] re-ranker degradato: ordine della fusione, "
                  "soglia di astensione non applicabile")

    if not ranked or (ok and ranked[0].score < _floor_for(reranker)):
        return report(hits=[], abstained=True, reranked=ok,
                      top_score=ranked[0].score if ranked else None,
                      reason="sotto la soglia di pertinenza" if ranked
                             else "re-rank senza risultati")
    return report(hits=ranked, abstained=False, reranked=ok,
                  top_score=ranked[0].score if ranked else None)


_warned_about_calibration = False


def _floor_for(reranker) -> float:
    """La soglia, con un avviso una tantum se il modello non e' quello su cui
    e' stata misurata.

    Applicare una soglia calibrata su un modello ai punteggi di un altro e'
    esattamente l'errore gia' commesso confrontando RERANK_FLOOR con i punteggi
    RRF: due scale diverse trattate come una. Qui non si puo' correggere da
    soli - serve rieseguire la calibrazione - quindi almeno lo si dice.
    """
    global _warned_about_calibration
    from app.lib.rag.rerank import CALIBRATED_ON

    name = getattr(reranker, "name", "")
    if name and name != CALIBRATED_ON and not _warned_about_calibration:
        _warned_about_calibration = True
        logging.getLogger(__name__).warning(
            "RERANK_FLOOR=%.2f e' stato misurato su %s, ma il re-ranker in uso e' "
            "%s. La soglia potrebbe non trasferirsi: riesegui "
            "tools/calibrate_abstention.py --rerank %s",
            RERANK_FLOOR, CALIBRATED_ON, name, name,
        )
    return RERANK_FLOOR


def _hit(row, branch: str) -> Hit:
    return Hit(
        chunk_id=row[0],
        document_id=row[1],
        source_path=row[2],
        slug=row[3],
        heading=row[4],
        text=row[5],
        code_tokens=list(row[6] or []),
        score=float(row[7]),
        branch=branch,
    )
