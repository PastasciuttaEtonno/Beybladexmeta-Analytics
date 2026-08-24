"""Embedding providers, behind one interface.

Two exist. `voyage` is the real one, chosen for the corpus being Italian.
`deterministic` produces vectors from a hash: it is not an embedding in any
useful sense and retrieves nothing sensible, but it lets the ingest pipeline,
the deduplication and the SQL be exercised end to end without an API key and
without spending anything. Every test runs on it.

The provider name is written into kb_chunk.embedding_model on every row, so a
database that has been through both is never ambiguous about which vectors came
from where. Cosine distances from different models are not comparable, and a
corpus that silently mixes them ranks badly in a way nothing reports.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import os
from typing import Protocol

import httpx
from app.lib.rag.env import env_str, env_int, env_float

# Ogni modello Voyage attuale emette 1024 dimensioni per default, che e' cio'
# che dichiara la migrazione 0010. Un provider che non concorda e' un
# disallineamento di schema, quindi si verifica invece di darlo per buono. A
# provider that disagrees is a schema mismatch, not a configuration detail, so
# it is checked rather than assumed.
DIMENSIONS = 1024

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"

# voyage-4: 1024 dimensioni come lo schema, 32k di contesto. Non la variante
# lite, e la ragione non e' il costo: l'account ha 200 milioni di token gratuiti
# per gli embedding, e il corpus intero ne vale 81.000. Ci stanno dentro 2.469
# reindicizzazioni complete, quindi a parita' di spesa - zero - l'unico criterio
# rimasto e' la qualita' del recupero.
#
# voyage-4-lite resta il ripiego per una chiave senza metodo di pagamento: e'
# l'unico che risponde, mentre voyage-4 restituisce 429 con "you have not yet
# added your payment method".
VOYAGE_MODEL = env_str("VOYAGE_MODEL", "voyage-4")

# Tarati per il Tier 1 (metodo di pagamento registrato): 8M token/minuto e 2.000
# richieste/minuto per voyage-4. Il corpus intero - 512 chunk, ~81.000 token -
# entra in 8 richieste e si indicizza in meno di un minuto.
#
# SENZA metodo di pagamento i limiti scendono a circa 3.000 token/minuto, e
# questi valori vanno abbassati o ogni lotto sbatte contro un 429. Misurato su
# questa knowledge base:
#
#   16 chunk = 2.528 token -> passa
#   32 chunk               -> 429 immediato
#
# Il ripiego da mettere in .env, che porta l'indicizzazione a ~30 minuti:
#
#   VOYAGE_MODEL=voyage-4-lite
#   VOYAGE_BATCH=16
#   VOYAGE_PAUSE=60
BATCH = env_int("VOYAGE_BATCH", 64)
PAUSE = env_float("VOYAGE_PAUSE", 1.5)
MAX_RETRIES = 8

# Codici da ritentare: il rate limit e i guasti temporanei lato server. Un 400 o
# un 401 no - quelli non migliorano aspettando, e ritentarli maschera un errore
# di configurazione facendolo sembrare un problema di rete.
RETRY_STATUS = {429, 500, 502, 503, 504}


class Embedder(Protocol):
    name: str
    dimensions: int

    async def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        ...


class DeterministicEmbedder:
    """Hash-derived unit vectors. Same text in, same vector out, no network.

    Useful for exactly one thing: proving the plumbing works. Similarity between
    two of these vectors means nothing, so a search run against them tells you
    the query executed, not that the answer is good.
    """

    name = "deterministic-v1"
    dimensions = DIMENSIONS

    async def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        return [self._one(text) for text in texts]

    def _one(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values: list[float] = []
        counter = 0
        while len(values) < self.dimensions:
            block = hashlib.sha256(digest + counter.to_bytes(4, "big")).digest()
            values.extend((byte - 127.5) / 127.5 for byte in block)
            counter += 1
        values = values[: self.dimensions]
        norm = math.sqrt(sum(value * value for value in values)) or 1.0
        return [value / norm for value in values]


class VoyageEmbedder:
    """Voyage over plain HTTP — httpx is already a dependency, and a vendor
    SDK would add one for a single endpoint.

    Documents and queries are embedded with different input types, which is what
    the provider asks for and what makes asymmetric retrieval work: passing
    `is_query` through is not optional politeness.
    """

    name = VOYAGE_MODEL
    dimensions = DIMENSIONS

    def __init__(self, api_key: str | None = None, timeout: float = 30.0):
        self.api_key = api_key or os.environ.get("VOYAGE_API_KEY", "")
        if not self.api_key:
            raise RuntimeError(
                "VOYAGE_API_KEY is not set. Export it, or run with "
                "--provider deterministic to exercise the pipeline without one."
            )
        self.timeout = timeout

    async def _post(self, client: httpx.AsyncClient, payload: dict) -> dict:
        """Una richiesta, con attesa e ritentativo sul rate limit.

        Il 429 non e' un errore da propagare: e' il servizio che chiede di
        rallentare. Un ingest completo del corpus lo incontra di sicuro, e
        senza questo l'intera transazione viene annullata dopo aver gia' pagato
        le chiamate andate a buon fine.
        """
        delay = 2.0
        last: Exception | None = None
        for attempt in range(MAX_RETRIES):
            try:
                response = await client.post(
                    VOYAGE_URL,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
            except httpx.TransportError as exc:
                # DNS che non risolve, connessione rifiutata, timeout di lettura.
                # Un ingest completo dura minuti: trattare un singolo intoppo di
                # rete come definitivo significa annullare tutto il lavoro fatto
                # e ripagare le chiamate gia' andate a buon fine.
                last = exc
                if attempt == MAX_RETRIES - 1:
                    raise
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60.0)
                continue

            if response.status_code not in RETRY_STATUS:
                response.raise_for_status()
                return response.json()
            # Un 429 per metodo di pagamento mancante non e' un limite
            # temporaneo: aspettare non lo risolve, e propagarlo come errore HTTP
            # generico dopo mezz'ora di ritentativi nasconde l'unica cosa utile
            # da sapere. Si distingue subito e si dice cosa fare.
            if response.status_code == 429 and "payment method" in response.text:
                raise RuntimeError(
                    f"Voyage rifiuta {VOYAGE_MODEL}: la chiave non ha un metodo di "
                    f"pagamento registrato, quindi resta sotto il Tier 1.\n"
                    f"Registralo su https://dashboard.voyageai.com per sbloccare "
                    f"8M token/minuto (i 200 milioni gratuiti restano), oppure metti "
                    f"in .env il ripiego:\n"
                    f"  VOYAGE_MODEL=voyage-4-lite\n"
                    f"  VOYAGE_BATCH=16\n"
                    f"  VOYAGE_PAUSE=60"
                )
            # Retry-After quando c'e', altrimenti raddoppio.
            wait = float(response.headers.get("retry-after", delay))
            if attempt == MAX_RETRIES - 1:
                response.raise_for_status()
            await asyncio.sleep(wait)
            delay = min(delay * 2, 60.0)
        raise last or RuntimeError("irraggiungibile")

    async def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        vectors: list[list[float]] = []
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for start in range(0, len(texts), BATCH):
                batch = texts[start : start + BATCH]
                if start:
                    # Spaziatura fra i lotti: costa qualche secondo su un ingest
                    # completo ed evita di andare a sbattere contro il limite,
                    # che e' piu' lento da recuperare che da prevenire.
                    await asyncio.sleep(PAUSE)
                payload = await self._post(client, {
                    "input": batch,
                    "model": VOYAGE_MODEL,
                    "input_type": "query" if is_query else "document",
                    "output_dimension": DIMENSIONS,
                })
                # The API documents the order as matching the input, but a
                # mismatch here would attach every chunk to the wrong vector and
                # look like a quality problem rather than a bug.
                items = sorted(payload["data"], key=lambda item: item["index"])
                vectors.extend(item["embedding"] for item in items)
        return vectors


def get_embedder(provider: str) -> Embedder:
    if provider in ("deterministic", "fake"):
        return DeterministicEmbedder()
    if provider == "voyage":
        return VoyageEmbedder()
    raise ValueError(f"unknown embedding provider {provider!r}: use 'voyage' or 'deterministic'")


def to_pgvector(vector: list[float]) -> str:
    """pgvector's text input form. Bound as a parameter and cast in SQL, which
    keeps it a value rather than something concatenated into a statement."""
    if len(vector) != DIMENSIONS:
        raise ValueError(f"expected {DIMENSIONS} dimensions, got {len(vector)}")
    return "[" + ",".join(f"{value:.7g}" for value in vector) + "]"
