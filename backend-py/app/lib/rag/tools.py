"""I tool quantitativi: come il modello raggiunge i numeri.

Nessuna statistica passa dal recupero semantico. Un indice vettoriale non sa
ordinare, sommare ne' confrontare, quindi "qual e' la combo con piu' vittorie"
non e' una domanda di similarita' - e' una query. Qui ci sono le query, chiuse
in funzioni tipizzate.

Il modello non scrive SQL: sceglie QUALE funzione chiamare e con quali
argomenti, e il codice esegue. La differenza non e' stilistica. Con SQL generato
la superficie da validare e' l'intero linguaggio; cosi' e' un insieme finito di
funzioni che si testano come qualunque altro endpoint, e nessun input del
modello raggiunge il database se non come parametro legato.

## Due invarianti che il prompt di M4 dara' per garantite

  * `sample_size` in ogni risposta. Nel foglio meta la prima combo ha 218
    vittorie e l'ottava ne ha 31: confrontarle senza dire la numerosita' e'
    formalmente vero e sostanzialmente fuorviante. La numerosita' non e'
    opzionale, e' parte del dato.
  * `as_of` in ogni risposta. I numeri cambiano a ogni import di torneo; una
    risposta senza data invecchia senza che nessuno se ne accorga.

## Perche' il punteggio si calcola qui e non in SQL

`BASE_POINTS` moltiplicato per il numero di partecipanti e' la stessa formula
che usa /api/analytics/meta. Viene importata, non riscritta: se i tool
calcolassero il punteggio a modo loro, il modello risponderebbe numeri diversi
da quelli che l'utente legge sul sito, e nessuno dei due sarebbe evidentemente
sbagliato.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.scoring import BASE_POINTS

SLOT_COLUMN = {
    "blade": "blade",
    "assist_blade": "assist_blade",
    "ratchet": "ratchet",
    "bit": "bit",
    "lock_chip": "lock_chip",
}

# I valori segnaposto delle tabelle stats: "nessun componente in questa
# posizione". Contarli come un pezzo falserebbe ogni classifica.
PLACEHOLDERS = {"NONE", "-", ""}

ALL_TIME = {"", "all", "all time", "all-time", "sempre", "tutte"}

# Sotto questa soglia una percentuale non e' un'informazione. Non filtra i
# risultati - li accompagna: il payload lo dichiara e il prompt obbliga a dirlo.
THIN_SAMPLE = 10


@dataclass
class ToolResult:
    """Il contratto di ritorno, identico per ogni tool."""

    rows: list[dict[str, Any]]
    sample_size: int
    as_of: str
    source: str
    season: str | None = None
    notes: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.sample_size == 0:
            self.notes.append(
                "Nessun piazzamento corrisponde a questi criteri: il dato non "
                "esiste, non e' zero."
            )
        elif self.sample_size < THIN_SAMPLE:
            self.notes.append(
                f"Campione ridotto: {self.sample_size} piazzamenti. Le percentuali "
                f"su questa base non sono affidabili e vanno riportate con la "
                f"numerosita' accanto."
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "rows": self.rows,
            "sample_size": self.sample_size,
            "as_of": self.as_of,
            "source": self.source,
            "season": self.season,
            "notes": self.notes,
        }


def _real(name: str | None) -> bool:
    return bool(name) and name.strip().upper() not in PLACEHOLDERS


def _season_filter(season: str | None) -> tuple[str, dict]:
    if not season or season.strip().lower() in ALL_TIME:
        return "", {}
    return " AND season = :season", {"season": season.strip()}


async def known_seasons(session: AsyncSession) -> list[str]:
    rows = await session.execute(text(
        "SELECT DISTINCT season FROM unified_meta_view "
        "WHERE season IS NOT NULL ORDER BY season"))
    return [row[0] for row in rows]


async def _season_note(session: AsyncSession, season: str | None) -> str | None:
    """Avvisa quando il filtro sulla stagione azzera tutto, e spiega perche'.

    Il caso reale: il modello ha dedotto "Season 2026" dalla data odierna e
    l'ha passata come filtro. Il risultato e' stato sample_size 0, riferito come
    "nessun piazzamento registrato per WizardRod" - che e' falso, ne ha 29.

    La distinzione che serve NON e' fra stagione esistente e inesistente.
    Season 2026 esiste eccome: determine_season la produce per ogni data dal 1
    febbraio 2026, e oggi ci siamo dentro. Quello che manca sono i TORNEI: in
    unified_meta_view c'e' solo Off Season 2025, perche' l'import dei
    piazzamenti si ferma a gennaio.

    Chiamarla "inesistente" sarebbe quindi scorretto quanto lo zero: farebbe
    concludere al modello che la stagione non e' valida invece che non ancora
    popolata. Sono due cose diverse, e per il meta corrente esiste un'altra
    fonte - il foglio - che va indicata invece di lasciar rispondere "niente".
    """
    if not season or season.strip().lower() in ALL_TIME:
        return None
    seasons = await known_seasons(session)
    if season.strip() in seasons:
        return None

    row = await session.execute(text(
        "SELECT min(date)::date, max(date)::date FROM unified_meta_view"))
    first, last = row.first() or (None, None)
    snapshot = await session.execute(text(
        "SELECT max(captured_at)::text FROM meta_snapshot"))
    captured = snapshot.scalar_one_or_none()

    parts = [
        f"Nessun torneo importato per '{season}'. Non significa che la stagione "
        f"non esista: significa che i piazzamenti registrati coprono solo "
        f"{', '.join(seasons) or 'nessuna stagione'}"
    ]
    if first and last:
        parts.append(f" (dal {first} al {last})")
    parts.append(". Lo zero qui e' un vuoto di dati, non un risultato.")
    if captured:
        parts.append(
            f" Per il meta ATTUALE usa current_meta, che legge una fotografia "
            f"del {captured} e non ha stagioni."
        )
    return "".join(parts)


async def _as_of(session: AsyncSession) -> str:
    """La data del piazzamento piu' recente. Non oggi: il dato e' vecchio quanto
    l'ultimo torneo importato, e dire 'oggi' sarebbe una data inventata."""
    row = await session.execute(text("SELECT max(date)::date FROM unified_meta_view"))
    value = row.scalar_one_or_none()
    return value.isoformat() if isinstance(value, date) else "sconosciuta"


def _label(row) -> str:
    parts = [row.blade]
    if _real(row.assist_blade):
        parts.append(f"({row.assist_blade})")
    parts += [row.ratchet, row.bit]
    if _real(row.lock_chip):
        parts.append(f"({row.lock_chip})")
    return " ".join(p for p in parts if p)


async def top_combos(
    session: AsyncSession,
    *,
    season: str | None = None,
    platform: str | None = None,
    limit: int = 10,
) -> ToolResult:
    """Le combo che hanno raccolto piu' punti, con la stessa formula del sito."""
    limit = max(1, min(limit, 20))
    where, args = _season_filter(season)
    if platform and platform.lower() != "all":
        where += " AND platform = :platform"
        args["platform"] = platform.lower()

    rows = await session.execute(
        text(
            f"SELECT blade, assist_blade, ratchet, bit, lock_chip, rank, "
            f"       participant_count, platform "
            f"FROM unified_meta_view "
            f"WHERE rank BETWEEN 1 AND 4 AND blade IS NOT NULL{where}"
        ),
        args,
    )

    tally: dict[str, dict[str, Any]] = {}
    counted = 0
    for row in rows:
        earned = BASE_POINTS.get(row.rank, 0) * (row.participant_count or 0)
        if earned == 0:
            continue
        counted += 1
        key = _label(row)
        entry = tally.setdefault(
            key, {"combo": key, "punti": 0, "piazzamenti": 0, "primi_posti": 0}
        )
        entry["punti"] += earned
        entry["piazzamenti"] += 1
        entry["primi_posti"] += 1 if row.rank == 1 else 0

    ranked = sorted(tally.values(), key=lambda e: -e["punti"])[:limit]
    return ToolResult(
        rows=ranked,
        sample_size=counted,
        as_of=await _as_of(session),
        source="unified_meta_view",
        season=None if not season or season.lower() in ALL_TIME else season,
    )


async def component_ranking(
    session: AsyncSession,
    *,
    slot: str,
    season: str | None = None,
    limit: int = 10,
) -> ToolResult:
    """Classifica dei pezzi di una posizione, per punti raccolti."""
    if slot not in SLOT_COLUMN:
        raise ValueError(f"slot sconosciuto: {slot!r}; usa uno di {sorted(SLOT_COLUMN)}")
    limit = max(1, min(limit, 20))
    column = SLOT_COLUMN[slot]
    where, args = _season_filter(season)

    rows = await session.execute(
        text(
            f'SELECT "{column}" AS name, rank, participant_count '
            f"FROM unified_meta_view "
            f'WHERE rank BETWEEN 1 AND 4 AND "{column}" IS NOT NULL{where}'
        ),
        args,
    )

    tally: dict[str, dict[str, Any]] = {}
    counted = 0
    for row in rows:
        if not _real(row.name):
            continue
        earned = BASE_POINTS.get(row.rank, 0) * (row.participant_count or 0)
        if earned == 0:
            continue
        counted += 1
        entry = tally.setdefault(row.name, {"nome": row.name, "punti": 0, "piazzamenti": 0})
        entry["punti"] += earned
        entry["piazzamenti"] += 1

    total = sum(e["punti"] for e in tally.values()) or 1
    ranked = sorted(tally.values(), key=lambda e: -e["punti"])[:limit]
    for entry in ranked:
        entry["quota_pct"] = round(entry["punti"] / total * 100, 1)

    return ToolResult(
        rows=ranked,
        sample_size=counted,
        as_of=await _as_of(session),
        source="unified_meta_view",
        season=None if not season or season.lower() in ALL_TIME else season,
    )


async def component_usage(
    session: AsyncSession,
    *,
    slot: str,
    name: str,
    season: str | None = None,
) -> ToolResult:
    """Quanto e come compare un pezzo, e con cosa viene montato piu' spesso."""
    if slot not in SLOT_COLUMN:
        raise ValueError(f"slot sconosciuto: {slot!r}; usa uno di {sorted(SLOT_COLUMN)}")
    column = SLOT_COLUMN[slot]
    where, args = _season_filter(season)
    args["name"] = name

    rows = await session.execute(
        text(
            f"SELECT blade, assist_blade, ratchet, bit, lock_chip, rank, "
            f"       participant_count "
            f"FROM unified_meta_view "
            f'WHERE "{column}" = :name AND rank BETWEEN 1 AND 4{where}'
        ),
        args,
    )

    placements = {1: 0, 2: 0, 3: 0, 4: 0}
    points = 0
    partners: dict[str, dict[str, int]] = {s: {} for s in SLOT_COLUMN if s != slot}
    counted = 0
    for row in rows:
        counted += 1
        placements[row.rank] = placements.get(row.rank, 0) + 1
        points += BASE_POINTS.get(row.rank, 0) * (row.participant_count or 0)
        for other in partners:
            value = getattr(row, SLOT_COLUMN[other])
            if _real(value):
                partners[other][value] = partners[other].get(value, 0) + 1

    top_partners = {
        other: [
            {"nome": n, "insieme": c, "quota_pct": round(c / counted * 100, 1)}
            for n, c in sorted(counts.items(), key=lambda kv: -kv[1])[:3]
        ]
        for other, counts in partners.items()
        if counts
    }

    return ToolResult(
        rows=[{
            "pezzo": name,
            "slot": slot,
            "punti": points,
            "piazzamenti": counted,
            "primi_posti": placements.get(1, 0),
            "secondi_posti": placements.get(2, 0),
            "terzi_posti": placements.get(3, 0),
            "quarti_posti": placements.get(4, 0),
            "montato_piu_spesso_con": top_partners,
        }] if counted else [],
        sample_size=counted,
        as_of=await _as_of(session),
        source="unified_meta_view",
        season=None if not season or season.lower() in ALL_TIME else season,
    )


async def combo_detail(
    session: AsyncSession,
    *,
    blade: str,
    ratchet: str,
    bit: str,
    assist_blade: str | None = None,
    lock_chip: str | None = None,
    season: str | None = None,
) -> ToolResult:
    """Il record di una combo precisa."""
    where, args = _season_filter(season)
    args |= {"blade": blade, "ratchet": ratchet, "bit": bit}
    clauses = 'blade = :blade AND ratchet = :ratchet AND "bit" = :bit'
    if assist_blade is not None:
        clauses += " AND assist_blade = :assist"
        args["assist"] = assist_blade
    if lock_chip is not None:
        clauses += " AND lock_chip = :chip"
        args["chip"] = lock_chip

    rows = await session.execute(
        text(
            f"SELECT rank, participant_count, platform, date::date AS date, season "
            f"FROM unified_meta_view WHERE {clauses} AND rank BETWEEN 1 AND 4{where} "
            f"ORDER BY date DESC"
        ),
        args,
    )
    records = list(rows)
    points = sum(BASE_POINTS.get(r.rank, 0) * (r.participant_count or 0) for r in records)

    return ToolResult(
        rows=[{
            "combo": " ".join(x for x in [blade, assist_blade, ratchet, bit, lock_chip] if _real(x)),
            "punti": points,
            "piazzamenti": len(records),
            "primi_posti": sum(1 for r in records if r.rank == 1),
            "ultimo_piazzamento": records[0].date.isoformat() if records else None,
            "tornei": [
                {"rank": r.rank, "partecipanti": r.participant_count,
                 "piattaforma": r.platform, "data": r.date.isoformat() if r.date else None}
                for r in records[:10]
            ],
        }] if records else [],
        sample_size=len(records),
        as_of=await _as_of(session),
        source="unified_meta_view",
        season=None if not season or season.lower() in ALL_TIME else season,
    )


async def compare_components(
    session: AsyncSession,
    *,
    slot: str,
    names: list[str],
    season: str | None = None,
) -> ToolResult:
    """Due o piu' pezzi della stessa posizione, affiancati."""
    if slot not in SLOT_COLUMN:
        raise ValueError(f"slot sconosciuto: {slot!r}; usa uno di {sorted(SLOT_COLUMN)}")
    if not 2 <= len(names) <= 5:
        raise ValueError("compare_components confronta da 2 a 5 pezzi")

    compared, total = [], 0
    for name in names:
        result = await component_usage(session, slot=slot, name=name, season=season)
        total += result.sample_size
        row = result.rows[0] if result.rows else {"pezzo": name, "punti": 0, "piazzamenti": 0}
        compared.append({k: row.get(k) for k in
                         ("pezzo", "punti", "piazzamenti", "primi_posti")})

    compared.sort(key=lambda e: -(e.get("punti") or 0))
    result = ToolResult(
        rows=compared,
        sample_size=total,
        as_of=await _as_of(session),
        source="unified_meta_view",
        season=None if not season or season.lower() in ALL_TIME else season,
    )
    thin = [c["pezzo"] for c in compared if (c.get("piazzamenti") or 0) < THIN_SAMPLE]
    if thin:
        result.notes.append(
            f"Confronto sbilanciato: {', '.join(thin)} ha meno di {THIN_SAMPLE} "
            f"piazzamenti, quindi il paragone non e' alla pari."
        )
    return result


# ---------------------------------------------------------------------------
# Le definizioni che vedra' il modello
# ---------------------------------------------------------------------------
#
# `strict: true` con `additionalProperties: false` non e' pignoleria: garantisce
# che `input` validi esattamente contro lo schema, quindi il dispatcher qui sotto
# non deve difendersi da argomenti inventati. Senza, un parametro allucinato
# arriverebbe fino alla funzione.
#
# Le descrizioni sono in italiano perche' lo sono il corpus e le domande, e
# dicono anche QUANDO usare il tool: e' li' che si decide il routing, e una
# descrizione vaga produce chiamate sbagliate piu' di qualunque errore di codice.

_SLOT_ENUM = sorted(SLOT_COLUMN)

TOOL_DEFINITIONS = [
    {
        "name": "top_combos",
        "description": (
            "Le combo che hanno raccolto piu' punti nei tornei. Usalo per "
            "'qual e' la combo migliore', 'cosa si vede ai tornei', 'top combo "
            "della stagione'. NON usarlo per sapere come funziona un pezzo: "
            "quello sta nelle schede."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "season": {"type": ["string", "null"],
                           "description": "Usa null se la domanda non nomina una "
                                          "stagione precisa. NON dedurla dalla data "
                                          "odierna: una stagione che non esiste nei "
                                          "dati non filtra, azzera."},
                "platform": {"type": ["string", "null"],
                             "description": "challengermode o challonge. null = tutte"},
                "limit": {"type": "integer", "description": "quante combo, 1-20"},
            },
            "required": ["season", "platform", "limit"],
        },
    },
    {
        "name": "component_ranking",
        "description": (
            "Classifica dei pezzi di una posizione per punti raccolti. Usalo per "
            "'qual e' il miglior blade/ratchet/bit', 'i bit piu' usati'."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "slot": {"type": "string", "enum": _SLOT_ENUM},
                "season": {"type": ["string", "null"]},
                "limit": {"type": "integer", "description": "1-20"},
            },
            "required": ["slot", "season", "limit"],
        },
    },
    {
        "name": "component_usage",
        "description": (
            "Quanto e come compare UN pezzo preciso, e con cosa viene montato "
            "piu' spesso. Usalo per 'quanto vince X', 'quante volte e' stato "
            "usato X', 'con cosa si monta X'. Il nome deve essere quello "
            "canonico: WizardRod, non Wizard Rod."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "slot": {"type": "string", "enum": _SLOT_ENUM},
                "name": {"type": "string", "description": "nome canonico del pezzo"},
                "season": {"type": ["string", "null"]},
            },
            "required": ["slot", "name", "season"],
        },
    },
    {
        "name": "combo_detail",
        "description": (
            "Il record di una combo precisa. Usalo quando la domanda nomina "
            "insieme blade, ratchet e bit: 'WizardRod su 1-60 con Hexa quanto "
            "ha fatto?'."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "blade": {"type": "string"},
                "ratchet": {"type": "string"},
                "bit": {"type": "string"},
                "assist_blade": {"type": ["string", "null"]},
                "lock_chip": {"type": ["string", "null"]},
                "season": {"type": ["string", "null"]},
            },
            "required": ["blade", "ratchet", "bit", "assist_blade", "lock_chip", "season"],
        },
    },
    {
        "name": "compare_components",
        "description": (
            "Due o piu' pezzi della stessa posizione, affiancati. Usalo per "
            "'meglio 1-60 o 9-60?', 'differenza fra Hexa e Rush'. Da 2 a 5 nomi."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "slot": {"type": "string", "enum": _SLOT_ENUM},
                "names": {"type": "array", "items": {"type": "string"},
                          "description": "da 2 a 5 nomi canonici"},
                "season": {"type": ["string", "null"]},
            },
            "required": ["slot", "names", "season"],
        },
    },
]

_DISPATCH = {
    "top_combos": top_combos,
    "component_ranking": component_ranking,
    "component_usage": component_usage,
    "combo_detail": combo_detail,
    "compare_components": compare_components,
}


async def call_tool(session: AsyncSession, name: str, arguments: dict) -> dict:
    """Esegue il tool scelto dal modello.

    Gli argomenti arrivano come li ha prodotti il modello e finiscono come
    parametri legati: nessuna stringa raggiunge il database come SQL. Un nome di
    tool sconosciuto e' un errore da restituire, non da sollevare - in un ciclo
    agentico deve poter essere corretto al giro successivo.
    """
    handler = _DISPATCH.get(name)
    if handler is None:
        return {"error": f"tool sconosciuto: {name}",
                "disponibili": sorted(_DISPATCH)}
    # I null espliciti dello schema strict sono "non specificato".
    kwargs = {k: v for k, v in arguments.items() if v is not None}
    try:
        result = await handler(session, **kwargs)
    except (ValueError, TypeError) as exc:
        return {"error": str(exc)}

    # In un solo punto, cosi' vale per ogni tool presente e futuro.
    warning = await _season_note(session, kwargs.get("season"))
    if warning:
        result.notes.insert(0, warning)
    return result.to_dict()


# ---------------------------------------------------------------------------
# Il meta corrente, dal foglio
# ---------------------------------------------------------------------------
#
# unified_meta_view e' l'archivio dei tornei importati, e si ferma al 16 gennaio
# 2026. meta_snapshot e' una fotografia del meta corrente, catturata il 21
# agosto 2026. Sono due fonti che rispondono a domande diverse:
#
#   "cosa ha vinto"  -> unified_meta_view, piazzamenti verificati, con stagione
#   "cosa si usa"    -> meta_snapshot, classifica aggregata da terzi, con data
#
# Senza questo strumento una domanda sul meta di oggi riceveva dati di sette
# mesi fa, o uno zero. Le due fonti non si sommano MAI - misurano cose diverse -
# e ogni payload dichiara da quale viene.

async def current_meta(
    session: AsyncSession,
    *,
    slot: str | None = None,
    limit: int = 10,
) -> ToolResult:
    """Il meta corrente secondo la fotografia piu' recente del foglio."""
    limit = max(1, min(limit, 20))
    captured = await session.execute(
        text("SELECT max(captured_at) FROM meta_snapshot"))
    as_of = captured.scalar_one_or_none()
    if not as_of:
        return ToolResult(rows=[], sample_size=0, as_of="nessuna",
                          source="meta_snapshot")

    if slot and slot not in SLOT_COLUMN:
        raise ValueError(f"slot sconosciuto: {slot!r}; usa uno di {sorted(SLOT_COLUMN)}")

    if slot:
        column = SLOT_COLUMN[slot]
        rows = await session.execute(
            text(
                f'SELECT {column} AS nome, sum(coalesce(win_count, 0))::bigint AS vittorie '  # noqa: S608
                f"FROM meta_snapshot WHERE captured_at = :as_of AND {column} IS NOT NULL "
                f"GROUP BY 1 ORDER BY vittorie DESC NULLS LAST LIMIT :limit"
            ),
            {"as_of": as_of, "limit": limit},
        )
        entries = [{"nome": r.nome, "vittorie": r.vittorie}
                   for r in rows if _real(r.nome) and r.vittorie]
    else:
        rows = await session.execute(
            text(
                "SELECT blade, assist_blade, ratchet, \"bit\", lock_chip, "
                "       coalesce(win_count, 0) AS vittorie, combo_rank, rank_change "
                "FROM meta_snapshot WHERE captured_at = :as_of AND win_count > 0 "
                "ORDER BY win_count DESC LIMIT :limit"
            ),
            {"as_of": as_of, "limit": limit},
        )
        entries = [{
            "combo": " ".join(x for x in [r.blade, r.assist_blade, r.ratchet,
                                          r.bit, r.lock_chip] if _real(x)),
            "vittorie": r.vittorie,
            "posizione": r.combo_rank,
            "variazione": r.rank_change,
        } for r in rows]

    total = await session.execute(
        text("SELECT coalesce(sum(win_count), 0)::bigint FROM meta_snapshot "
             "WHERE captured_at = :as_of"),
        {"as_of": as_of})

    result = ToolResult(
        rows=entries,
        sample_size=total.scalar_one(),
        as_of=as_of.isoformat(),
        source="meta_snapshot",
    )
    result.notes.insert(0,
        "Fonte diversa dagli altri strumenti: e' una classifica gia' aggregata "
        "da terzi, fotografata a quella data, non piazzamenti di torneo "
        "verificati. Va citata come tale e non sommata ai risultati di "
        "top_combos o component_ranking.")
    return result


TOOL_DEFINITIONS.append({
    "name": "current_meta",
    "description": (
        "Il meta ATTUALE: cosa si usa adesso, secondo una fotografia del foglio "
        "meta. Usalo quando la domanda riguarda l'oggi - 'cosa si gioca ora', "
        "'il meta attuale', 'la combo piu' usata adesso' - perche' gli altri "
        "strumenti leggono i tornei importati, che si fermano a gennaio 2026. "
        "Non ha stagioni: e' una fotografia con una data. I suoi numeri NON si "
        "sommano a quelli degli altri strumenti."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "slot": {"type": ["string", "null"], "enum": _SLOT_ENUM + [None],
                     "description": "null per le combo intere, oppure una posizione"},
            "limit": {"type": "integer", "description": "1-20"},
        },
        "required": ["slot", "limit"],
    },
})
_DISPATCH["current_meta"] = current_meta
