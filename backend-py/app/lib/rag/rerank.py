"""Re-ranking cross-encoder sui candidati usciti dalla fusione.

Il ramo denso e quello lessicale producono candidati guardando query e documento
separatamente. Un cross-encoder li legge insieme, e per questo ordina molto
meglio - al prezzo di una chiamata di rete nel percorso critico.

Due proprieta' che contano piu' della qualita' dell'ordinamento:

  * Degradazione morbida. Su errore o timeout si prosegue con l'ordine RRF
    invece di far fallire la richiesta. Il servizio e' esterno e il resto del
    sistema non deve dipendere dalla sua disponibilita'.
  * Un punteggio confrontabile fra query. E' cio' che rende possibile una soglia
    di astensione onesta: la distanza coseno non e' confrontabile fra query
    diverse, il punteggio di un cross-encoder si', perche' misura la pertinenza
    di quella coppia e non una posizione in uno spazio.
"""

from __future__ import annotations

import os
from dataclasses import replace
from typing import Protocol

import httpx
from app.lib.rag.env import env_str, env_int

VOYAGE_URL = "https://api.voyageai.com/v1/rerank"

# Come per gli embedding, l'account ha 200 milioni di token gratuiti anche per
# il rerank - una allowance separata - e una query ne consuma ~2.600. Sono circa
# 77.000 domande prima di pagare qualcosa, quindi il costo non e' il criterio e
# si sceglie il modello migliore.
#
# ATTENZIONE: cambiare questo valore invalida RERANK_FLOOR in search.py. La
# soglia e' calibrata sulla distribuzione dei punteggi di UN modello, e modelli
# diversi non la condividono. Dopo un cambio va rieseguito
# tools/calibrate_abstention.py - il modello con cui e' stata misurata e'
# registrato in CALIBRATED_ON, e search.py avvisa se i due divergono.
DEFAULT_MODEL = env_str("VOYAGE_RERANK_MODEL", "rerank-2.5")

# Due limiti diversi, che prima erano confusi in uno solo.
#
# MAX_CHARS e' il tetto dell'API: query + singolo documento non possono superare
# 32.000 token su rerank-2.5-lite (16.000 su rerank-2, 8.000 su rerank-2-lite).
# E' una rete di sicurezza contro un 400, non una scelta di progetto.
MAX_CHARS = 24000

# RERANK_CHARS e' quanto testo si spedisce davvero. Al Tier 1 (2M token/minuto
# per rerank-2.5) una query da ~4.000 token e' irrilevante, quindi si manda il
# chunk intero: il chunker lo limita comunque a ~600 token.
#
# SENZA metodo di pagamento il tetto scende a ~3.000 token/minuto e una singola
# query da 20 documenti interi consuma piu' del budget di un minuto. Il ripiego,
# da mettere in .env insieme a quelli degli embedding:
#
#   VOYAGE_RERANK_MODEL=rerank-2.5-lite
#   VOYAGE_RERANK_WINDOW=8
#   VOYAGE_RERANK_CHARS=1200
RERANK_CHARS = env_int("VOYAGE_RERANK_CHARS", 4000)
RERANK_WINDOW = env_int("VOYAGE_RERANK_WINDOW", 20)

# Il modello con cui RERANK_FLOOR e' stato misurato. search.py lo confronta con
# quello effettivamente in uso e avvisa se divergono: una soglia calibrata su un
# modello applicata a un altro e' lo stesso errore, di nuovo, che confrontare
# punteggi di scale diverse.
CALIBRATED_ON = "rerank-2.5"

# L'API tronca da sola quando serve, e il default e' gia' True. Passarlo esplicito
# rende la scelta dichiarata invece che ereditata: senza, un cambio di default
# lato fornitore trasformerebbe un documento lungo in un 400 in produzione.
TRUNCATION = True


class Reranker(Protocol):
    name: str

    async def rerank(self, query: str, hits: list, *, top_k: int) -> tuple[list, bool]:
        ...


class NullReranker:
    """Nessun re-rank: restituisce l'ordine RRF. E' il comportamento quando non
    c'e' chiave, ed e' anche il baseline con cui si misura se il re-rank serve."""

    name = "none"

    async def rerank(self, query: str, hits: list, *, top_k: int) -> tuple[list, bool]:
        # False, non True: il secondo valore significa "esiste un punteggio di
        # re-ranking utilizzabile", non "la chiamata non e' esplosa". Qui i
        # punteggi restano quelli di RRF, che stanno su tutt'altra scala -
        # intorno a 0,016 contro una soglia di 0,30 - e trattarli come
        # confrontabili faceva astenere il sistema su ogni domanda.
        return hits[:top_k], False


class VoyageReranker:
    def __init__(self, model: str = DEFAULT_MODEL, api_key: str | None = None,
                 timeout: float = 10.0):
        self.name = model
        self.api_key = api_key or os.environ.get("VOYAGE_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("VOYAGE_API_KEY non impostata")
        self.timeout = timeout

    async def rerank(self, query: str, hits: list, *, top_k: int) -> tuple[list, bool]:
        """(risultati riordinati, punteggi_utilizzabili).

        Il secondo valore dice se i punteggi restituiti sono quelli del
        cross-encoder. A False si sta guardando l'ordine RRF, i cui punteggi
        vivono su una scala diversa: applicarci una soglia calibrata sul
        re-ranker significa scartare tutto.
        """
        if not hits:
            return [], True
        # La finestra si applica qui e non a monte: la fusione RRF puo' produrre
        # tutti i candidati che vuole, e' spedirli che costa.
        hits = hits[:RERANK_WINDOW]
        documents = [
            f"{h.heading + '. ' if h.heading else ''}{h.text}"[:min(RERANK_CHARS, MAX_CHARS)]
            for h in hits
        ]
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    VOYAGE_URL,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={"query": query, "documents": documents,
                          "model": self.name, "top_k": min(top_k, len(documents)),
                          "truncation": TRUNCATION},
                )
                response.raise_for_status()
                payload = response.json()
        except Exception:
            # Volutamente silenzioso verso l'utente e rumoroso verso la
            # telemetria: una risposta un po' peggiore e' preferibile a nessuna
            # risposta. Il flag e' come il chiamante se ne accorge.
            return hits[:top_k], False

        ordered = []
        for item in payload["data"]:
            hit = hits[item["index"]]
            ordered.append(replace(hit, score=float(item["relevance_score"]),
                                   branch=f"{hit.branch}>rerank"))
        return ordered, True


def get_reranker(name: str) -> Reranker:
    if name in ("none", "off"):
        return NullReranker()
    return VoyageReranker(model=name)
