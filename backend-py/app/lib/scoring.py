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
from dataclasses import dataclass

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
