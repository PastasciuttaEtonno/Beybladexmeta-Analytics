/**
 * La diagnostica dell'assistente, per chi deve ripararlo.
 *
 * All'utente arriva un messaggio fisso e un codice di otto cifre; il dettaglio
 * - quale fornitore, quale limite, il traceback - resta nel database. Finora
 * per leggerlo servivano una sessione da amministratore e curl. Questa pagina
 * e' lo stesso dato, dietro la stessa guardia, ma raggiungibile.
 *
 * Due elenchi, perche' un assistente delude in modi diversi e solo uno lancia
 * un'eccezione: i GUASTI stanno in chat_error, le risposte deludenti
 * (astensioni, pollici giu', citazioni inventate) stanno nelle conversazioni.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MessageSquare, RefreshCw, ThumbsDown } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ChatError = {
  reference: string;
  kind: string;
  detail: string;
  traceback: string | null;
  endpoint: string | null;
  session_id: number | null;
  client_ip: string | null;
  created_at: string;
};

type Attivita = {
  id: number;
  session_id: number;
  created_at: string;
  abstained: boolean;
  feedback: number;
  model: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  phantom_citations: string[];
  tool_calls: { name?: string }[];
  retrieval: {
    branch_counts?: Record<string, number>;
    reason?: string | null;
    top_score?: number | null;
    slugs?: string[];
  };
  answer: string;
  question: string | null;
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "medium" });

async function leggi<T>(url: string): Promise<T> {
  const risposta = await fetch(url, { credentials: "include" });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
  return risposta.json();
}

export default function ChatLogs() {
  const { user } = useAuth();
  const [soloProblemi, setSoloProblemi] = useState(true);

  const errori = useQuery({
    queryKey: ["admin-chat-errors"],
    queryFn: () => leggi<{ errors: ChatError[] }>("/api/admin/chat-errors?limit=50"),
    enabled: !!user?.isAdmin,
  });
  const attivita = useQuery({
    queryKey: ["admin-chat-activity", soloProblemi],
    queryFn: () =>
      leggi<{ activity: Attivita[] }>(
        `/api/admin/chat-activity?limit=50&problemi=${soloProblemi}`,
      ),
    enabled: !!user?.isAdmin,
  });

  if (!user || !user.isAdmin) {
    return (
      <div className="container py-8">
        <h1 className="text-2xl font-bold text-destructive">Accesso negato</h1>
        <p className="text-muted-foreground">
          Questa pagina e' riservata agli amministratori.
        </p>
      </div>
    );
  }

  const righeErrori = errori.data?.errors ?? [];
  const righeAttivita = attivita.data?.activity ?? [];

  return (
    <div className="container space-y-6 py-6">
      <PageHeader
        title="Diagnostica dell'assistente"
        description="I guasti col loro codice, e le risposte che non hanno soddisfatto."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Guasti ({righeErrori.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => errori.refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Aggiorna
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {errori.isError && (
            <p className="text-sm text-destructive">
              Non sono riuscito a leggere i guasti: {String(errori.error)}
            </p>
          )}
          {!errori.isLoading && righeErrori.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nessun guasto registrato.
            </p>
          )}
          {righeErrori.map((e) => (
            <details key={e.reference + e.created_at} className="rounded border p-3">
              <summary className="cursor-pointer text-sm">
                <span className="font-mono text-xs">{e.reference}</span>
                <Badge variant="destructive" className="ml-2">
                  {e.kind}
                </Badge>
                <span className="ml-2 text-muted-foreground">{quando(e.created_at)}</span>
                {e.endpoint && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {e.endpoint}
                  </span>
                )}
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs">{e.detail}</p>
              {e.traceback && (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-tight">
                  {e.traceback}
                </pre>
              )}
            </details>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Conversazioni ({righeAttivita.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={soloProblemi ? "default" : "outline"}
              size="sm"
              onClick={() => setSoloProblemi((v) => !v)}
            >
              {soloProblemi ? "Solo quelle da guardare" : "Tutte"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => attivita.refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {attivita.isError && (
            <p className="text-sm text-destructive">
              Non sono riuscito a leggere le conversazioni: {String(attivita.error)}
            </p>
          )}
          {!attivita.isLoading && righeAttivita.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {soloProblemi
                ? "Nessuna risposta problematica: nessuna astensione, nessun pollice giu', nessuna citazione inventata."
                : "Nessuna conversazione ancora."}
            </p>
          )}
          {righeAttivita.map((a) => {
            const rami = Object.entries(a.retrieval?.branch_counts ?? {})
              .map(([nome, quanti]) => `${nome}=${quanti}`)
              .join(" ");
            return (
              <details key={a.id} className="rounded border p-3">
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">
                    {a.question ?? "(domanda non trovata)"}
                  </span>
                  {a.abstained && (
                    <Badge variant="secondary" className="ml-2">
                      astenuto
                    </Badge>
                  )}
                  {a.feedback < 0 && (
                    <Badge variant="destructive" className="ml-2">
                      <ThumbsDown className="mr-1 h-3 w-3" />
                      pollice giu'
                    </Badge>
                  )}
                  {a.phantom_citations?.length > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      citazioni inventate
                    </Badge>
                  )}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {quando(a.created_at)}
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs">{a.answer}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>sessione {a.session_id}</span>
                  {a.model && <span>{a.model}</span>}
                  {a.latency_ms != null && <span>{(a.latency_ms / 1000).toFixed(1)} s</span>}
                  {a.input_tokens != null && (
                    <span>
                      {a.input_tokens} in / {a.output_tokens} out
                    </span>
                  )}
                  {rami && <span>rami {rami}</span>}
                  {a.retrieval?.top_score != null && (
                    <span>punteggio {a.retrieval.top_score.toFixed(3)}</span>
                  )}
                  {a.retrieval?.reason && <span>{a.retrieval.reason}</span>}
                  {a.retrieval?.slugs?.length ? (
                    <span>entita' {a.retrieval.slugs.join(", ")}</span>
                  ) : null}
                  {a.tool_calls?.length ? (
                    <span>strumenti {a.tool_calls.map((t) => t.name).join(", ")}</span>
                  ) : null}
                  {a.phantom_citations?.length ? (
                    <span className="text-destructive">
                      inventate: {a.phantom_citations.join(", ")}
                    </span>
                  ) : null}
                </div>
              </details>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
