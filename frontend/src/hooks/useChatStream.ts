/**
 * Consuma il flusso SSE di /api/chat/stream.
 *
 * Tre decisioni che non sono di stile.
 *
 * **fetch e non EventSource.** EventSource sa fare solo GET, e qui la domanda
 * viaggia nel corpo di una POST. Leggere il flusso a mano costa una ventina di
 * righe di parsing e in cambio dà il controllo dell'annullamento.
 *
 * **I frammenti si accumulano in un ref, non nello stato.** Una risposta arriva
 * in una quarantina di pezzi; scriverli nello stato uno per uno vuol dire
 * quaranta render dell'intera lista dei messaggi. Si accumulano fuori da React
 * e si versano una volta per frame con requestAnimationFrame: un commit per
 * frame invece di uno per frammento, ed è la differenza fra fluido e a scatti
 * su un telefono.
 *
 * **AbortController legato allo smontaggio.** Cambiare pagina durante una
 * risposta deve chiudere il flusso, non lasciare una richiesta orfana che
 * continua a consumare quota e prova a scrivere su un componente che non c'è
 * più.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ChatSource = {
  source_path: string;
  heading: string | null;
  slug: string | null;
  score: number;
};

export type ChatToolCall = {
  name: string;
  sample_size: number | null;
  as_of?: string;
  notes?: string[];
};

export type ChatVerdict = {
  phantom_citations: string[];
  unknown_tools: string[];
  unsourced_numbers: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  toolCalls?: ChatToolCall[];
  abstained?: boolean;
  verdict?: ChatVerdict;
  messageId?: number;
  feedback?: -1 | 0 | 1;
};

type Phase = "idle" | "retrieval" | "generating" | "tool";

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusDetail, setStatusDetail] = useState("");
  const [liveSources, setLiveSources] = useState<ChatSource[]>([]);
  const [liveTools, setLiveTools] = useState<ChatToolCall[]>([]);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Il codice del guasto, generato dal server. Serve a chi lo segnala:
  // il messaggio e' volutamente generico, e senza questo non c'e' modo
  // di collegare la segnalazione alla riga giusta nei registri.
  const [errorReference, setErrorReference] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const busy = phase !== "idle";

  // Fuori da React: qui si accumulano i frammenti fra un frame e l'altro.
  const buffer = useRef("");
  const frame = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    setLiveText(buffer.current);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(flush);
  }, [flush]);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setPhase("idle");
  }, []);

  // Smontaggio o cambio pagina: il flusso si chiude.
  useEffect(() => () => stop(), [stop]);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      setError(null);
      setLiveSources([]);
      setLiveTools([]);
      setLiveText("");
      buffer.current = "";
      setPhase("retrieval");
      setStatusDetail("cerco fra le schede");
      setMessages((previous) => [
        ...previous,
        { id: `u-${Date.now()}`, role: "user", text: trimmed },
      ]);

      const controller = new AbortController();
      abort.current = controller;

      let finalMessage: ChatMessage | null = null;

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ question: trimmed, session_id: sessionId }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(
            response.status === 503
              ? "L'assistente non è configurato su questo server."
              : `Il server ha risposto ${response.status}.`,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        // Il flusso arriva a pacchetti di rete, che non coincidono con gli
        // eventi: un evento può essere spezzato fra due letture. `pending`
        // tiene l'avanzo finché non arriva la riga vuota che chiude l'evento.
        let pending = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });

          const blocks = pending.split("\n\n");
          pending = blocks.pop() ?? "";

          for (const block of blocks) {
            const line = block.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            let event: any;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            switch (event.event) {
              case "status":
                if (event.session_id) setSessionId(event.session_id);
                if (event.phase === "retrieval" || event.phase === "generating" ||
                    event.phase === "tool") {
                  setPhase(event.phase);
                }
                if (event.detail) setStatusDetail(event.detail);
                break;
              case "sources":
                setLiveSources(event.sources ?? []);
                break;
              case "tool":
                setLiveTools((previous) => [...previous, event]);
                break;
              case "delta":
                buffer.current += event.text ?? "";
                scheduleFlush();
                break;
              case "done":
                if (event.saved) {
                  // Il secondo `done` porta solo gli identificativi salvati.
                  if (finalMessage) finalMessage.messageId = event.message_id;
                  if (event.session_id) setSessionId(event.session_id);
                } else {
                  finalMessage = {
                    id: `a-${Date.now()}`,
                    role: "assistant",
                    text: event.text ?? buffer.current,
                    sources: event.sources ?? [],
                    toolCalls: event.tool_calls ?? [],
                    abstained: Boolean(event.abstained),
                    verdict: event.verdict,
                    feedback: 0,
                  };
                }
                break;
              case "error":
                // Il riferimento va messo da parte PRIMA di sollevare: dopo,
                // resta solo il messaggio dentro l'eccezione.
                if (event.reference) setErrorReference(event.reference);
                throw new Error(event.message || "Errore durante la risposta.");
            }
          }
        }
      } catch (exception: any) {
        // Un annullamento non è un errore: è l'utente che ha cambiato pagina.
        if (exception?.name !== "AbortError") {
          setError(exception?.message ?? "Qualcosa è andato storto.");
        }
      } finally {
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
        // La risposta finale sostituisce il testo in arrivo. Se il flusso si è
        // interrotto a metà si tiene comunque quello che era arrivato: mezza
        // risposta è più utile di niente, purché sia chiaro che è mezza.
        const text = finalMessage?.text ?? buffer.current;
        if (text) {
          setMessages((previous) => [
            ...previous,
            finalMessage ?? {
              id: `a-${Date.now()}`,
              role: "assistant",
              text,
              sources: [],
              toolCalls: [],
            },
          ]);
        }
        setLiveText("");
        buffer.current = "";
        setPhase("idle");
        abort.current = null;
      }
    },
    [busy, scheduleFlush, sessionId],
  );

  const rate = useCallback(async (messageId: number, value: -1 | 1) => {
    setMessages((previous) =>
      previous.map((message) =>
        message.messageId === messageId ? { ...message, feedback: value } : message,
      ),
    );
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message_id: messageId, value }),
      });
    } catch {
      // Il pollice è un di più: se non arriva, non vale la pena disturbare.
    }
  }, []);

  return {
    messages, phase, busy, statusDetail, liveSources, liveTools, liveText,
    error, errorReference, sessionId, send, stop, rate,
  };
}
