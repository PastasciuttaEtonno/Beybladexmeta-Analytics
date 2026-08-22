"""Porta il .env nell'ambiente del processo, per chi legge con os.environ.

## Perche' esiste

config.py dice, giustamente, di leggere la configurazione da Settings e non da
os.environ: pydantic-settings analizza il .env per conto suo e NON lo esporta
nell'ambiente, quindi un os.environ.get non vedrebbe niente.

Le chiavi del RAG pero' servono anche fuori dall'applicazione - agli strumenti
in tools/, che girano da soli e non costruiscono un oggetto Settings (che
richiederebbe DATABASE_URL anche quando l'URL arriva da --url). Avere due
percorsi di configurazione per le stesse chiavi e' peggio di averne uno
imperfetto.

Quindi: questa funzione esporta il .env in os.environ, e viene chiamata sia
all'avvio dell'applicazione sia dagli strumenti. Da li' in poi c'e' un solo
posto da cui le chiavi arrivano.

## L'ambiente reale vince sempre

Una variabile gia' presente non viene sovrascritta. In Docker il .env della repo
non esiste e le variabili arrivano dal container: la precedenza e' quella
giusta, e in produzione questa funzione non fa nulla.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

# backend-py/app/lib/rag/env.py -> backend-py -> radice della repo
BACKEND = Path(__file__).resolve().parents[3]
REPO = BACKEND.parent

CANDIDATES = (REPO / ".env", BACKEND / ".env")

_loaded = False

# Quali chiavi sono state messe da qui e non erano gia' nell'ambiente.
#
# Serve a distinguere due cose che altrimenti si confondono. Il .env alla radice
# e' il file di docker-compose: il suo DATABASE_URL punta a `db:5432`, l'host
# interno della rete Docker, che dall'host non si risolve. Un consumatore che
# abbia bisogno di un valore VALIDO PER IL PROCESSO CORRENTE - i test di
# integrazione, per esempio - deve poter dire "questo me l'hai messo tu dal
# file, non me l'ha dato chi mi ha lanciato" e comportarsi di conseguenza.
_injected: set[str] = set()


def load_env(force: bool = False) -> None:
    """Idempotente: chiamarla piu' volte non rilegge i file."""
    global _loaded
    if _loaded and not force:
        return
    _loaded = True

    for path in CANDIDATES:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            # setdefault e non assegnazione: l'ambiente reale ha la precedenza.
            if key and key not in os.environ:
                os.environ[key] = value.strip().strip('"').strip("'")
                _injected.add(key)


def came_from_dotenv(name: str) -> bool:
    """Vero se il valore lo ha messo load_env() leggendo un file."""
    load_env()
    return name in _injected


def missing(*names: str) -> list[str]:
    """Quali fra queste chiavi mancano. Serve a dirlo una volta sola all'avvio,
    invece che alla prima richiesta di un utente."""
    load_env()
    return [name for name in names if not os.environ.get(name)]


def env_str(name: str, default: str) -> str:
    """Il valore della variabile, trattando la stringa vuota come assente.

    os.environ.get(name, default) restituisce "" quando la variabile ESISTE ed
    e' vuota, e il default non si applica mai. Non e' teoria: docker compose
    scrive `OPENROUTER_MODEL: ${OPENROUTER_MODEL:-}`, che DEFINISCE sempre la
    variabile - vuota se non c'e' nel .env. Il container a mano non la definiva
    affatto, quindi il default funzionava; passando a compose e' sparito, e
    OpenRouter ha risposto "No models provided" a una richiesta senza modello.

    Il modo di sbagliare peggiore e' quello numerico: int("") solleva
    ValueError durante l'import del modulo, e l'applicazione non parte affatto.
    """
    value = os.environ.get(name)
    return value.strip() if value and value.strip() else default


def env_int(name: str, default: int) -> int:
    try:
        return int(env_str(name, str(default)))
    except ValueError:
        # Un valore illeggibile non deve impedire l'avvio: si torna al default e
        # lo si dice, invece di morire durante l'import con un traceback che non
        # nomina la variabile responsabile.
        log.warning("[env] %s non e' un intero, uso %s", name, default)
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(env_str(name, str(default)))
    except ValueError:
        log.warning("[env] %s non e' un numero, uso %s", name, default)
        return default
