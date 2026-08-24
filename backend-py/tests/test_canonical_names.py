"""Un pezzo entra negli aggregati con il nome che il registro gli da'.

E' la meta' mancante delle fusioni 0017 e 0018. Quelle hanno riunito le righe
gia' scritte sotto due nomi diversi; senza questo, il primo torneo importato con
il nome ritirato ne rifa' una nuova, e il seeder gli ricrea pure la voce di
registry. Una migrazione ripara il passato una volta sola: qui si chiude la
porta da cui il difetto rientra.

I test che toccano il database si saltano da soli senza DATABASE_URL:

    DATABASE_URL=postgresql://postgres:postgres@localhost:5433/beyblade_tracker \
      python -m pytest tests/test_canonical_names.py -v
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.lib.rag.env import came_from_dotenv, load_env
from app.lib.rag.search import _normalise
from app.lib.scoring import ComboResult, canonical_combo, normalise_name

load_env()
DATABASE_URL = os.environ.get("DATABASE_URL", "")
_USABLE = bool(DATABASE_URL) and not came_from_dotenv("DATABASE_URL")


def test_la_normalizzazione_e_la_stessa_del_recupero():
    """Tre implementazioni della stessa regola - kb_norm() in SQL, _normalise()
    nel recupero, normalise_name() qui - e una che si scosta silenziosamente
    significa cercare in un indice costruito con un'altra chiave."""
    for valore in ("T.Rex", "Wizard Rod", "9-60", "  LowRush ", "Beat Tyranno"):
        assert normalise_name(valore) == _normalise(valore)


def _async_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return url.replace(prefix, "postgresql+asyncpg://", 1)
    return url


@pytest.fixture
async def session():
    engine = create_async_engine(_async_url(DATABASE_URL), pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s
    await engine.dispose()


def _combo(**kwargs) -> ComboResult:
    base = dict(blade="TyrannoBeat", assist_blade="NONE", ratchet="3-60",
                bit="Rush", lock_chip="NONE", season="Off Season 2025",
                placement=1, total_participants=10)
    return ComboResult(**{**base, **kwargs})


@pytest.mark.skipif(not _USABLE, reason="serve un DATABASE_URL raggiungibile da questo processo")
async def test_il_nome_ritirato_diventa_quello_canonico(session):
    """'T.Rex' e' l'alias localizzato di TyrannoBeat dopo la 0018."""
    risultato = await canonical_combo(session, _combo(blade="T.Rex"))
    assert risultato.blade == "TyrannoBeat"
    # Tutto il resto passa intatto: non e' una riscrittura generale della combo.
    assert (risultato.ratchet, risultato.bit) == ("3-60", "Rush")


@pytest.mark.skipif(not _USABLE, reason="serve un DATABASE_URL raggiungibile da questo processo")
async def test_un_pezzo_che_il_registro_non_conosce_resta_com_e(session):
    """Riconciliare sinonimi noti non e' validare: un pezzo appena uscito deve
    poter entrare il giorno stesso, sotto il nome con cui lo si registra."""
    risultato = await canonical_combo(session, _combo(blade="BladeCheNonEsiste"))
    assert risultato.blade == "BladeCheNonEsiste"


@pytest.mark.skipif(not _USABLE, reason="serve un DATABASE_URL raggiungibile da questo processo")
async def test_l_alias_di_un_altro_slot_non_rinomina(session):
    """'Rush' e' un bit. Un blade chiamato cosi' non deve diventarlo: la ricerca
    e' per (alias, slot), non per alias soltanto."""
    risultato = await canonical_combo(session, _combo(blade="Rush"))
    assert risultato.blade == "Rush"


@pytest.mark.skipif(not _USABLE, reason="serve un DATABASE_URL raggiungibile da questo processo")
async def test_i_segnaposto_non_vengono_cercati(session):
    """'NONE' e '-' vogliono dire "in questo slot non c'e' niente"."""
    risultato = await canonical_combo(session, _combo(assist_blade="NONE", lock_chip="-"))
    assert risultato.assist_blade == "NONE"
    assert risultato.lock_chip == "-"


@pytest.mark.skipif(not _USABLE, reason="serve un DATABASE_URL raggiungibile da questo processo")
async def test_anche_le_grafie_spaziate_tornano_al_nome_del_registro(session):
    """'Beat Tyranno' e' l'alias occidentale, 'Wizard Rod' la grafia spaziata:
    due modi diversi di scrivere un pezzo che il registro conosce."""
    assert (await canonical_combo(session, _combo(blade="Beat Tyranno"))).blade == "TyrannoBeat"
    assert (await canonical_combo(session, _combo(blade="Wizard Rod"))).blade == "WizardRod"
