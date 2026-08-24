/**
 * Il pannello di conversazione.
 *
 * Due scelte di interfaccia che vengono da numeri misurati, non da gusto.
 *
 * **Le fonti compaiono prima del testo.** Nel flusso reale l'evento `sources`
 * arriva a 985 ms e il primo frammento di risposta a 36 secondi. Mostrarle
 * subito trasforma l'attesa in informazione: chi legge vede su cosa si baserà
 * la risposta mentre viene scritta, e può già aprire una scheda.
 *
 * **La numerosità campionaria si vede.** Il prompt obbliga il modello a
 * dichiararla, ma un'istruzione può essere disattesa; il dato arriva anche
 * nell'evento `tool`, quindi si mostra accanto al risultato comunque. Su un
 * sito di statistiche "la combo migliore" su tre risultati è un'affermazione
 * diversa da "la combo migliore" su duecento.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Loader2, Send, Square, ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnswerText } from "./answer";
import { useChatStream, type ChatSource, type ChatToolCall } from "@/hooks/useChatStream";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Come si comporta il ratchet 9-60?",
  "Qual è la combo più usata adesso?",
  "Meglio 1-60 o 9-60?",
  "Perché non vedo le Over Blade nei filtri?",
];

/** `knowledge/blades/wizard-rod.md` → `wizard-rod`. */
function slugOf(source: ChatSource): string | null {
  if (source.slug) return source.slug;
  const match = source.source_path.match(/([^/]+)\.md$/);
  return match ? match[1] : null;
}

function SourceChips({ sources }: { sources: ChatSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((source) => {
        const slug = slugOf(source);
        const label = slug ?? source.source_path;
        // Il collegamento alla scheda del pezzo è ciò che rende la risposta
        // verificabile senza fidarsi: chi legge può controllare da solo.
        return slug ? (
          <Link key={source.source_path + source.heading} href={`/combo/${slug}`}>
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/70">
              {label}
              {source.heading ? ` · ${source.heading}` : ""}
            </Badge>
          </Link>
        ) : (
          <Badge key={source.source_path} variant="outline">
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

function ToolChips({ calls }: { calls: ChatToolCall[] }) {
  if (!calls.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {calls.map((call, index) => {
        const thin = typeof call.sample_size === "number" && call.sample_size < 10;
        return (
          <Badge
            key={`${call.name}-${index}`}
            variant={thin ? "destructive" : "outline"}
            title={call.notes?.join(" ")}
          >
            {call.name}
            {typeof call.sample_size === "number" ? ` · n=${call.sample_size}` : ""}
          </Badge>
        );
      })}
    </div>
  );
}

export function ChatPanel({ className }: { className?: string }) {
  const {
    messages, phase, busy, statusDetail, liveSources, liveTools, liveText,
    error, errorReference, send, stop, rate,
  } = useChatStream();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, liveText]);

  const submit = () => {
    send(draft);
    setDraft("");
  };

  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && !busy && (
          <div className="space-y-3 py-6">
            <p className="text-sm text-muted-foreground">
              Chiedimi come funziona un pezzo, o cosa dicono i dati dei tornei.
              Rispondo solo su Beyblade X, e se non lo so lo dico.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => send(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            {message.role === "user" ? (
              <div className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                {message.text}
              </div>
            ) : (
              <div className="max-w-full space-y-2">
                <AnswerText text={message.text} />
                <ToolChips calls={message.toolCalls ?? []} />
                <SourceChips sources={message.sources ?? []} />
                {message.messageId && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost" size="icon" aria-label="Risposta utile"
                      className={cn("h-7 w-7", message.feedback === 1 && "text-primary")}
                      onClick={() => rate(message.messageId!, 1)}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" aria-label="Risposta sbagliata"
                      className={cn("h-7 w-7", message.feedback === -1 && "text-destructive")}
                      onClick={() => rate(message.messageId!, -1)}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="space-y-2">
            {/* La riga di stato: informazione vera al posto di uno spinner. */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
              {statusDetail || "sto lavorando"}
            </div>
            <ToolChips calls={liveTools} />
            <SourceChips sources={liveSources} />
            {liveText && (
              <div aria-live="polite">
                <AnswerText text={liveText} />
              </div>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="space-y-1">
            <p className="text-sm text-destructive">{error}</p>
            {errorReference && (
              // Discreto: a chi legge non interessa, ma se segnala il problema
              // e' l'unica cosa che rende la segnalazione utile.
              <p className="text-xs text-muted-foreground">
                Codice errore: <code className="font-mono">{errorReference}</code>
              </p>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="flex items-end gap-2 border-t pt-3">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Invio manda, Maiusc+Invio va a capo: la convenzione che la gente
            // si aspetta da una chat.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Fai una domanda…"
          rows={1}
          maxLength={500}
          className="min-h-[40px] resize-none"
          disabled={busy}
          aria-label="La tua domanda"
        />
        {busy ? (
          <Button onClick={stop} variant="outline" size="icon" aria-label="Ferma">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={!draft.trim()} size="icon" aria-label="Invia">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
