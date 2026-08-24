"""Aggregate scoring, ported from backend/src/scoreExternalCombo.ts.

Recording a top-4 finish increments six aggregate tables at once: the full combo
and each of its five components. Everything the site ranks is built on these, so
an error here does not produce a wrong response — it corrupts stored data.

Both directions are here: `process_external_combo` adds a result,
`revert_external_combo` takes it back out, which is what editing a combo does
before writing the replacement.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, replace

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

# Points for a placement, multiplied by the number of participants. Only the
# top four score at all.
# Punti per piazzamento. Pubblico e non privato perche' non e' solo di questo
# modulo: lo usano le tabelle aggregate qui, il calcolo del meta in
# routers/analytics.py, e i tool quantitativi in lib/rag/tools.py. Prima era
# duplicato fra i primi due, con lo stesso valore scritto due volte: se uno
# fosse cambiato, i dati archiviati e la classifica mostrata sarebbero
# divergiti in silenzio.
BASE_POINTS = {1: 10, 2: 7, 3: 5, 4: 3}
_BASE_POINTS = BASE_POINTS  # nome storico, usato piu' sotto in questo file

# Component names reach SQL as bound parameters, but the check is kept because
# it also rejects nonsense before it can be written into the aggregates.
_SAFE_NAME = re.compile(r"^[a-zA-Z0-9\s\-\(\)\.]+$")

# (table, key column) for the five component tables plus the combo table.
_COMPONENT_TABLES = (
    ("blade_stats", "blade"),
    ("assist_blade_stats", "assist_blade"),
    ("ratchet_stats", "ratchet"),
    ("bit_stats", '"bit"'),
    ("lock_chip_stats", "lock_chip"),
)


@dataclass(frozen=True)
class ComboResult:
    blade: str
    assist_blade: str
    ratchet: str
    bit: str
    lock_chip: str
    season: str
    placement: int
    total_participants: int

    @property
    def component_values(self) -> dict[str, str]:
        return {
            "blade_stats": self.blade,
            "assist_blade_stats": self.assist_blade,
            "ratchet_stats": self.ratchet,
            "bit_stats": self.bit,
            "lock_chip_stats": self.lock_chip,
        }


# Lo slot di ogni campo di ComboResult. Serve a non rinominare un pezzo con
# l'alias di un altro slot: 'Rush' e' un bit, e un blade che si chiamasse cosi'
# non deve diventarlo.
_SLOT_OF = {
    "blade": "blade",
    "assist_blade": "assist_blade",
    "ratchet": "ratchet",
    "bit": "bit",
    "lock_chip": "lock_chip",
}

# I segnaposto che le tabelle usano per "in questo slot non c'e' niente". Non
# sono nomi e non vanno cercati nel registro.
_PLACEHOLDERS = {"", "NONE", "-"}


def normalise_name(value: str) -> str:
    """Come kb_norm() nella migrazione 0010 e _normalise() in rag/search.py.

    Le tre devono restare d'accordo: una indicizza, le altre cercano.
    """
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


async def canonical_combo(db: AsyncSession, result: ComboResult) -> ComboResult:
    """Riporta ogni pezzo al nome con cui il registro lo conosce.

    Il problema che risolve e' quello che le migrazioni 0017 e 0018 hanno dovuto
    riparare a mano: uno stesso Blade registrato una volta come 'T.Rex' e una
    come 'TyrannoBeat' finisce in due righe diverse di blade_stats, e nessuna
    delle due e' giusta. Le fusioni sistemano il passato; senza questo passaggio
    il primo torneo importato con il nome ritirato ricrea il doppione, e il
    seeder gli rifa' pure la voce di registry.

    Qui, e non nei singoli importatori, perche' questa e' l'unica porta da cui
    si scrive negli aggregati: la sincronizzazione ChallengerMode, l'import
    Challonge e l'inserimento manuale passano tutti di qua. Vale anche per la
    revoca, altrimenti si sommerebbe sotto un nome e si sottrarrebbe sotto un
    altro.

    Un nome che il registro non conosce resta com'e': questa funzione riconcilia
    sinonimi noti, non valida i dati - rifiutare un pezzo nuovo il giorno che
    esce sarebbe peggio del doppione che evita.
    """
    voluti = {
        campo: getattr(result, campo)
        for campo in _SLOT_OF
        if (getattr(result, campo) or "").strip().upper() not in _PLACEHOLDERS
    }
    if not voluti:
        return result

    norme = {campo: normalise_name(valore) for campo, valore in voluti.items()}
    rows = (
        await db.execute(
            text(
                "SELECT a.alias_norm, r.slot, r.canonical_name "
                "FROM component_alias a JOIN component_registry r ON r.slug = a.slug "
                "WHERE a.alias_norm = ANY(:norms)"
            ),
            {"norms": sorted(set(norme.values()))},
        )
    ).all()

    # (alias, slot) -> nomi canonici. Se sono piu' di uno il registro e'
    # ambiguo e non si sceglie a caso: si lascia stare e lo si dice.
    trovati: dict[tuple[str, str], set[str]] = {}
    for alias_norm, slot, canonical in rows:
        trovati.setdefault((alias_norm, slot), set()).add(canonical)

    cambi = {}
    for campo, valore in voluti.items():
        nomi = trovati.get((norme[campo], _SLOT_OF[campo]))
        if not nomi:
            continue
        if len(nomi) > 1:
            log.warning(
                "alias ambiguo %r nello slot %s: %s - nome lasciato invariato",
                valore, _SLOT_OF[campo], sorted(nomi),
            )
            continue
        canonico = next(iter(nomi))
        if canonico != valore:
            cambi[campo] = canonico

    if not cambi:
        return result
    log.info("nomi ricondotti al registro: %s", cambi)
    return replace(result, **cambi)


def calculate_points(placement: int, total_participants: int) -> int:
    """Points earned by one combo. Zero outside the top four."""
    base = _BASE_POINTS.get(placement, 0)
    return base * total_participants if base else 0


def _placement_counts(placement: int) -> dict[str, int]:
    return {
        "primi": 1 if placement == 1 else 0,
        "secondi": 1 if placement == 2 else 0,
        "terzi": 1 if placement == 3 else 0,
        "quarti": 1 if placement == 4 else 0,
    }


async def process_external_combo(
    db: AsyncSession, result: ComboResult, *, commit: bool = True
) -> None:
    """Add one top-4 finish to the aggregates, in a single transaction."""
    points = calculate_points(result.placement, result.total_participants)
    if not points:
        return

    result = await canonical_combo(db, result)

    if not all(_SAFE_NAME.match(v or "") for v in (result.blade, result.ratchet, result.bit)):
        log.warning("Potential injection detected in combo update: %s", result)
        raise ValueError("Invalid characters in component names")

    counts = _placement_counts(result.placement)
    args = {
        "blade": result.blade,
        "assist_blade": result.assist_blade,
        "ratchet": result.ratchet,
        "bit": result.bit,
        "lock_chip": result.lock_chip,
        "season": result.season,
        "points": points,
        **counts,
    }

    await db.execute(
        text(
            "INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season, "
            "primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale, data_creazione) "
            "VALUES (:blade, :assist_blade, :ratchet, :bit, :lock_chip, :season, "
            ":primi, :secondi, :terzi, :quarti, :points, NOW()) "
            "ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip, season) DO UPDATE SET "
            "primi_posti = combo_stats.primi_posti + :primi, "
            "secondi_posti = combo_stats.secondi_posti + :secondi, "
            "terzi_posti = combo_stats.terzi_posti + :terzi, "
            "quarti_posti = combo_stats.quarti_posti + :quarti, "
            "punteggio_totale = combo_stats.punteggio_totale + :points"
        ),
        args,
    )

    # The five component tables take the same upsert with a different key column.
    for table, column in _COMPONENT_TABLES:
        await db.execute(
            text(
                f"INSERT INTO {table} ({column}, season, primi_posti, secondi_posti, "
                "terzi_posti, quarti_posti, punteggio_totale) "
                "VALUES (:value, :season, :primi, :secondi, :terzi, :quarti, :points) "
                f"ON CONFLICT ({column}, season) DO UPDATE SET "
                f"primi_posti = {table}.primi_posti + :primi, "
                f"secondi_posti = {table}.secondi_posti + :secondi, "
                f"terzi_posti = {table}.terzi_posti + :terzi, "
                f"quarti_posti = {table}.quarti_posti + :quarti, "
                f"punteggio_totale = {table}.punteggio_totale + :points"
            ),
            {**args, "value": result.component_values[table]},
        )

    if commit:
        await db.commit()


async def revert_external_combo(
    db: AsyncSession, result: ComboResult, *, commit: bool = True
) -> None:
    """Remove one previously recorded finish from the aggregates.

    Every subtraction is floored at zero, exactly as the SQL does, so a double
    revert cannot drive a counter negative.
    """
    points = calculate_points(result.placement, result.total_participants)
    if not points:
        return

    # Anche qui: la riga da scalare e' quella scritta, e quella e' stata scritta
    # sotto il nome canonico.
    result = await canonical_combo(db, result)

    counts = _placement_counts(result.placement)
    args = {
        "blade": result.blade,
        "assist_blade": result.assist_blade,
        "ratchet": result.ratchet,
        "bit": result.bit,
        "lock_chip": result.lock_chip,
        "season": result.season,
        "points": points,
        **counts,
    }

    decrements = (
        "primi_posti = GREATEST(primi_posti - :primi, 0), "
        "secondi_posti = GREATEST(secondi_posti - :secondi, 0), "
        "terzi_posti = GREATEST(terzi_posti - :terzi, 0), "
        "quarti_posti = GREATEST(quarti_posti - :quarti, 0), "
        "punteggio_totale = GREATEST(punteggio_totale - :points, 0)"
    )

    await db.execute(
        text(
            f"UPDATE combo_stats SET {decrements} "
            "WHERE blade = :blade AND assist_blade = :assist_blade AND ratchet = :ratchet "
            'AND bit = :bit AND lock_chip = :lock_chip AND season = :season'
        ),
        args,
    )

    for table, column in _COMPONENT_TABLES:
        await db.execute(
            text(f"UPDATE {table} SET {decrements} WHERE {column} = :value AND season = :season"),
            {**args, "value": result.component_values[table]},
        )

    if commit:
        await db.commit()
