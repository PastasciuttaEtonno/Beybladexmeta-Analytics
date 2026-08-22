"""I fornitori del modello, dietro una forma comune.

## Perche' non basta un'interfaccia con un solo metodo

Il primo tentativo esponeva `respond(system, messages, tools)` e lasciava al
ciclo di generate.py il compito di leggere la risposta. Funzionava con un
fornitore solo, perche' il ciclo parlava il formato Anthropic: blocchi
`tool_use`, `content` da rimandare indietro, `tool_result` come blocchi dentro
un turno utente. Un fornitore compatibile OpenAI usa una forma diversa in ogni
punto - `choices[0].message.tool_calls`, argomenti come stringa JSON, i
risultati come messaggi di ruolo `tool` - e il ciclo si sarebbe riempito di
condizioni sul fornitore.

Quindi il confine e' spostato: **il fornitore possiede la conversazione**. Il
ciclo chiede e riceve `ModelReply`, che e' identica per tutti; la traduzione da
e verso il formato nativo resta dentro l'adattatore, dove appartiene.

## Cosa NON cambia cambiando fornitore

Il recupero, gli strumenti, guard.py e il golden set. E' il motivo per cui un
modello alternativo si puo' valutare invece che scegliere per fede: si collega
qui, si esegue la valutazione, e si contano le citazioni inventate.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Protocol
from app.lib.rag.env import env_str, env_int
from app.lib.rag.errors import (
    ProviderMisconfigured, ProviderRateLimited, ProviderUnavailable)


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class ModelReply:
    """La forma comune. Il ciclo di generazione non conosce altro."""

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0

    # Token scritti nella cache e riletti da essa. Restano a zero sui fornitori
    # che non la espongono, ed e' corretto: zero letture su un fornitore che
    # non ha cache non e' un guasto, mentre zero letture su Claude lo e'.
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0


# Chiamato per ogni frammento di testo mentre arriva. None = niente streaming.
OnDelta = Optional[Callable[[str], None]]


class Conversation(Protocol):
    async def ask(self, question: str, on_delta: OnDelta = None) -> ModelReply:
        ...

    async def give_tool_results(self, results: list[tuple[ToolCall, str]],
                                on_delta: OnDelta = None) -> ModelReply:
        ...


class LanguageModel(Protocol):
    name: str

    def conversation(self, *, system: str, tool_definitions: list[dict],
                     history: list[dict] | None = None) -> Conversation:
        ...


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------

class _ClaudeConversation:
    def __init__(self, client, model: str, system: str,
                 tool_definitions: list[dict], history: list[dict] | None):
        self._client = client
        self._model = model
        self._system = system
        self._tools = tool_definitions
        self._messages: list[dict] = list(history or [])

    async def _send(self, on_delta: OnDelta = None) -> ModelReply:
        if on_delta is not None:
            return await self._send_streaming(on_delta)
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=MAX_TOKENS,
            # Prompt di sistema e definizioni degli strumenti sono identici a
            # ogni richiesta: e' il blocco piu' grande e stabile, quindi e' li'
            # che la cache rende. Il contesto recuperato cambia sempre e resta
            # dopo il punto di taglio.
            system=[{"type": "text", "text": self._system,
                     "cache_control": {"type": "ephemeral"}}],
            messages=self._messages,
            tools=self._tools,
        )
        # Il turno dell'assistente si rimanda indietro intatto: i blocchi
        # tool_use devono tornare come li ha prodotti il modello.
        self._messages.append({"role": "assistant", "content": response.content})

        usage = getattr(response, "usage", None)
        return ModelReply(
            text="".join(b.text for b in response.content if b.type == "text").strip(),
            tool_calls=[ToolCall(id=b.id, name=b.name, arguments=dict(b.input))
                        for b in response.content if b.type == "tool_use"],
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            cache_write_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        )

    async def _send_streaming(self, on_delta) -> ModelReply:
        """Stesso identico percorso, con i frammenti consegnati mentre arrivano.

        get_final_message() restituisce il messaggio completo, quindi la
        ModelReply e' costruita dagli stessi dati della versione sincrona: e'
        cio' che rende le due strade equivalenti per costruzione.
        """
        async with self._client.messages.stream(
            model=self._model,
            max_tokens=MAX_TOKENS,
            system=[{"type": "text", "text": self._system,
                     "cache_control": {"type": "ephemeral"}}],
            messages=self._messages,
            tools=self._tools,
        ) as stream:
            async for fragment in stream.text_stream:
                on_delta(fragment)
            response = await stream.get_final_message()

        self._messages.append({"role": "assistant", "content": response.content})
        usage = getattr(response, "usage", None)
        return ModelReply(
            text="".join(b.text for b in response.content if b.type == "text").strip(),
            tool_calls=[ToolCall(id=b.id, name=b.name, arguments=dict(b.input))
                        for b in response.content if b.type == "tool_use"],
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            cache_write_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        )

    async def ask(self, question: str, on_delta: OnDelta = None) -> ModelReply:
        self._messages.append({"role": "user", "content": question})
        return await self._send(on_delta)

    async def give_tool_results(self, results: list[tuple[ToolCall, str]],
                                on_delta: OnDelta = None) -> ModelReply:
        # Tutti in UN solo messaggio: spezzarli su piu' messaggi insegna al
        # modello a non chiamare piu' strumenti in parallelo.
        self._messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": call.id, "content": payload}
            for call, payload in results
        ]})
        return await self._send(on_delta)


class ClaudeModel:
    def __init__(self, model: str, api_key: str | None = None):
        from anthropic import AsyncAnthropic

        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise ProviderMisconfigured(
                "ANTHROPIC_API_KEY non impostata. Mettila in .env accanto a "
                "VOYAGE_API_KEY, oppure usa --provider openrouter."
            )
        self.name = model
        self._client = AsyncAnthropic(api_key=key)

    def conversation(self, *, system, tool_definitions, history=None) -> Conversation:
        return _ClaudeConversation(self._client, self.name, system,
                                   tool_definitions, history)


# ---------------------------------------------------------------------------
# OpenRouter (compatibile OpenAI)
# ---------------------------------------------------------------------------

def to_openai_tools(definitions: list[dict]) -> list[dict]:
    """Traduce gli schemi da forma Anthropic a forma OpenAI.

    `strict` non viene propagato: e' supportato in modo disomogeneo dai modelli
    su OpenRouter, e un parametro rifiutato fa fallire l'intera richiesta.
    Perderlo significa che un argomento inventato puo' arrivare fino alla
    funzione - ma call_tool restituisce un errore invece di sollevarlo, quindi
    il modello puo' correggersi al giro dopo.
    """
    return [{
        "type": "function",
        "function": {
            "name": d["name"],
            "description": d["description"],
            "parameters": d["input_schema"],
        },
    } for d in definitions]


# OpenRouter riporta i guasti del fornitore a monte DENTRO un HTTP 200, con un
# campo `error` nel corpo. raise_for_status() non li vede, e senza controllarlo
# un sovraccarico temporaneo arriva fino al chiamante come "risposta inattesa".
#
# I modelli gratuiti sono i piu' caricati, quindi non e' un caso limite: e' il
# comportamento normale sotto carico. Questi codici si ritentano; 400, 401 e 402
# no - non migliorano aspettando, e ritentarli maschera una configurazione
# sbagliata facendola sembrare un problema di rete.
OPENROUTER_RETRY_CODES = {408, 429, 500, 502, 503, 504, 520, 524}
OPENROUTER_MAX_RETRIES = 5


class _OpenRouterConversation:
    def __init__(self, client, model: str, system: str,
                 tool_definitions: list[dict], history: list[dict] | None):
        self._client = client
        self._model = model
        self._tools = to_openai_tools(tool_definitions)
        # Qui il prompt di sistema e' il primo messaggio, non un parametro a
        # parte: e' la differenza di forma piu' visibile fra i due fornitori.
        self._messages: list[dict] = [{"role": "system", "content": system}]
        self._messages += list(history or [])

    async def _send(self, on_delta: OnDelta = None) -> ModelReply:
        if on_delta is not None:
            return await self._send_streaming(on_delta)
        payload = await self._post_with_retries()
        message = payload["choices"][0]["message"]
        self._messages.append(message)

        calls = []
        for raw in message.get("tool_calls") or []:
            function = raw["function"]
            try:
                # Gli argomenti arrivano come STRINGA JSON, non come oggetto:
                # e' l'altra differenza di forma che rende necessario questo
                # adattatore. Un modello piccolo puo' produrre JSON malformato,
                # e in quel caso conviene un dizionario vuoto - lo strumento
                # rispondera' con un errore e il modello riprovera'.
                arguments = json.loads(function.get("arguments") or "{}")
            except json.JSONDecodeError:
                arguments = {}
            calls.append(ToolCall(id=raw["id"], name=function["name"],
                                  arguments=arguments if isinstance(arguments, dict) else {}))

        usage = payload.get("usage") or {}
        return ModelReply(
            text=(message.get("content") or "").strip(),
            tool_calls=calls,
            input_tokens=usage.get("prompt_tokens", 0) or 0,
            output_tokens=usage.get("completion_tokens", 0) or 0,
        )

    async def _post_with_retries(self) -> dict:
        import asyncio

        import httpx

        delay = 3.0
        last = ""
        # L'ultimo stato visto decide come classificare la resa finale: un 429
        # ritentato e ancora 429 resta un limite di richieste, non un servizio
        # irraggiungibile - e i due meritano consigli diversi all'utente.
        last_status = 0
        for attempt in range(OPENROUTER_MAX_RETRIES):
            try:
                response = await self._client.post(
                    "/chat/completions",
                    json={"model": self._model, "messages": self._messages,
                          "tools": self._tools, "max_tokens": MAX_TOKENS},
                )
            except httpx.TransportError as exc:
                last = str(exc)
                if attempt == OPENROUTER_MAX_RETRIES - 1:
                    raise
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60.0)
                continue

            if response.status_code in OPENROUTER_RETRY_CODES:
                last = f"HTTP {response.status_code}"
                last_status = response.status_code
            else:
                if response.status_code >= 400:
                    # raise_for_status() solleverebbe httpx.HTTPStatusError, che
                    # nessuno intercetta: il router traduce RuntimeError in 503 e
                    # tutto il resto diventa un 500. Una chiave sbagliata non e'
                    # un errore interno del server, ed e' quello che 500 dice a
                    # chi guarda - mandandolo a cercare un bug che non c'e'.
                    raise _rejected(response.status_code, response.text)
                payload = response.json()
                if "choices" in payload:
                    return payload
                error = payload.get("error") or {}
                code = error.get("code")
                last = f"{code}: {error.get('message', '')}"
                if code not in OPENROUTER_RETRY_CODES:
                    raise _rejected(response.status_code, last)

            if attempt == OPENROUTER_MAX_RETRIES - 1:
                break
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60.0)

        raise _rejected(
            last_status,
            f"non risponde dopo {OPENROUTER_MAX_RETRIES} tentativi - {last}. "
            f"I modelli :free sono i piu' caricati: prova un modello diverso con "
            f"OPENROUTER_MODEL, oppure CHAT_PROVIDER=claude."
        )

    async def _send_streaming(self, on_delta) -> ModelReply:
        """SSE compatibile OpenAI.

        Le chiamate agli strumenti arrivano a PEZZI: un frammento porta l'id e
        il nome, i successivi aggiungono qualche carattere degli argomenti, che
        viaggiano come stringa JSON spezzata. Vanno riassemblati per indice
        prima di poterli leggere - e un JSON incompleto qui produrrebbe una
        chiamata con argomenti vuoti, che e' un errore difficile da attribuire.
        """
        import json as _json

        message: dict = {"role": "assistant", "content": ""}
        partial: dict[int, dict] = {}
        usage: dict = {}

        failure: str | None = None
        async with self._client.stream(
            "POST", "/chat/completions",
            json={"model": self._model, "messages": self._messages,
                  "tools": self._tools, "max_tokens": MAX_TOKENS, "stream": True},
        ) as response:
            if response.status_code >= 400:
                # Su una risposta in streaming il corpo non e' stato letto, e
                # raise_for_status() da solo non lo direbbe: senza aread() il
                # messaggio dell'errore andrebbe perso proprio quando serve.
                await response.aread()
                raise _rejected(response.status_code, response.text)

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                body = line[6:].strip()
                if body == "[DONE]":
                    break
                try:
                    event = _json.loads(body)
                except _json.JSONDecodeError:
                    continue
                # Anche in streaming i guasti arrivano dentro un evento, non
                # come stato HTTP. Senza guardarli, un fallimento a monte
                # diventava una risposta vuota e un `done` pulito.
                if event.get("error"):
                    error = event["error"]
                    failure = f"{error.get('code')}: {error.get('message', '')}"
                    break
                if event.get("usage"):
                    usage = event["usage"]
                for choice in event.get("choices") or []:
                    delta = choice.get("delta") or {}
                    if delta.get("content"):
                        message["content"] += delta["content"]
                        on_delta(delta["content"])
                    for raw in delta.get("tool_calls") or []:
                        index = raw.get("index", 0)
                        slot = partial.setdefault(
                            index, {"id": "", "function": {"name": "", "arguments": ""}})
                        if raw.get("id"):
                            slot["id"] = raw["id"]
                        function = raw.get("function") or {}
                        if function.get("name"):
                            slot["function"]["name"] = function["name"]
                        if function.get("arguments"):
                            slot["function"]["arguments"] += function["arguments"]

        if failure:
            raise ProviderUnavailable(
                f"OpenRouter non ha completato la risposta - {failure}")

        calls = []
        assembled = []
        for index in sorted(partial):
            slot = partial[index]
            assembled.append({"id": slot["id"], "type": "function",
                              "function": dict(slot["function"])})
            try:
                arguments = _json.loads(slot["function"]["arguments"] or "{}")
            except _json.JSONDecodeError:
                arguments = {}
            calls.append(ToolCall(id=slot["id"], name=slot["function"]["name"],
                                  arguments=arguments if isinstance(arguments, dict) else {}))
        if assembled:
            message["tool_calls"] = assembled
        self._messages.append(message)

        return ModelReply(
            text=(message.get("content") or "").strip(),
            tool_calls=calls,
            input_tokens=usage.get("prompt_tokens", 0) or 0,
            output_tokens=usage.get("completion_tokens", 0) or 0,
        )

    async def ask(self, question: str, on_delta: OnDelta = None) -> ModelReply:
        self._messages.append({"role": "user", "content": question})
        return await self._send(on_delta)

    async def give_tool_results(self, results: list[tuple[ToolCall, str]],
                                on_delta: OnDelta = None) -> ModelReply:
        # Un messaggio per risultato, con ruolo `tool`: la forma OpenAI. La
        # regola "tutti insieme" del formato Anthropic qui non si applica -
        # sono comunque consecutivi e precedono un solo turno dell'assistente.
        for call, content in results:
            self._messages.append({"role": "tool", "tool_call_id": call.id,
                                   "content": content})
        return await self._send(on_delta)


class OpenRouterModel:
    """Qualunque modello su OpenRouter, comprese le varianti :free.

    Serve OPENROUTER_API_KEY. I modelli gratuiti richiedono che il saldo non sia
    negativo e hanno un tetto giornaliero di richieste.
    """

    def __init__(self, model: str, api_key: str | None = None, timeout: float = 120.0):
        import httpx

        key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        if not key:
            raise ProviderMisconfigured(
                "OPENROUTER_API_KEY non impostata. Prendine una su "
                "https://openrouter.ai/keys e mettila in .env."
            )
        self.name = model
        self._client = httpx.AsyncClient(
            base_url="https://openrouter.ai/api/v1",
            headers={
                "Authorization": f"Bearer {key}",
                # OpenRouter li usa per le classifiche pubbliche; sono
                # facoltativi ma e' buona educazione dichiararsi.
                "HTTP-Referer": "https://github.com/PastasciuttaEtonno/Beybladexmeta-Analytics",
                "X-Title": "Beybladexmeta-Analytics",
            },
            timeout=timeout,
        )

    def conversation(self, *, system, tool_definitions, history=None) -> Conversation:
        return _OpenRouterConversation(self._client, self.name, system,
                                       tool_definitions, history)


# Il tetto e' un limite, non una spesa: si paga cio' che si genera. Tenerlo
# basso non fa risparmiare, fa troncare le risposte a meta'.
def _rejected(status: int, detail: str) -> ProviderUnavailable | ProviderRateLimited:
    """Il tipo giusto per un rifiuto del fornitore.

    Il 429 va distinto perche' e' l'unico in cui "riprova fra qualche minuto"
    e' un consiglio vero invece che una formula. Sul piano gratuito di
    OpenRouter arriva a 20 richieste al minuto o a 50 al giorno (1000 con
    almeno 10 dollari di credito storico), e il contatore giornaliero si azzera
    a mezzanotte UTC.

    `detail` conserva il corpo della risposta per il registro; non esce mai
    verso l'utente.
    """
    text = f"HTTP {status}: {detail[:300]}"
    if status == 429:
        return ProviderRateLimited(text)
    return ProviderUnavailable(text)


MAX_TOKENS = env_int("CHAT_MAX_TOKENS", 16000)

# Opus 5 sbaglia meno sulle regole che questo sistema verifica. Non e' il piu'
# economico, e la scelta resta aperta: si cambia da .env.
DEFAULT_CLAUDE = "claude-opus-5"

# Il piu' capace fra i gratuiti con tool calling, verificato sull'API di
# OpenRouter. Le varianti :free cambiano nel tempo: se sparisce, l'elenco
# aggiornato e' su https://openrouter.ai/models?max_price=0
DEFAULT_OPENROUTER = "nvidia/nemotron-3-ultra-550b-a55b:free"


def get_model(provider: str = "claude", model: str | None = None) -> LanguageModel:
    if provider == "claude":
        return ClaudeModel(model or env_str("CHAT_MODEL", DEFAULT_CLAUDE))
    if provider == "openrouter":
        return OpenRouterModel(model or env_str("OPENROUTER_MODEL", DEFAULT_OPENROUTER))
    raise ValueError(f"fornitore sconosciuto: {provider!r}; usa 'claude' o 'openrouter'")
