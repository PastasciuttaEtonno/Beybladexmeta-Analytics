/**
 * La pagina /chat.
 *
 * Il pannello e' lo stesso componente usato dal lanciatore globale: una sola
 * implementazione, due modi di aprirla. Duplicarla significherebbe correggere
 * ogni cosa due volte, e accorgersene solo quando le due divergono.
 *
 * L'import e' dinamico anche qui, e non e' ridondanza. Il lanciatore lo carica
 * gia' in ritardo, ma se QUESTA pagina lo importasse in modo statico il modulo
 * finirebbe comunque nel bundle principale e il caricamento in ritardo
 * dell'altro non separerebbe piu' niente: basta un solo import statico per
 * annullarlo. E' quello che succedeva, e si vedeva solo guardando i chunk
 * prodotti dalla build.
 */

import { lazy, Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

const ChatPanel = lazy(() =>
  import("@/components/chat/ChatPanel").then((m) => ({ default: m.ChatPanel })),
);

export default function Chat() {
  return (
    <main className="container mx-auto flex h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Assistente</h1>
        <p className="text-sm text-muted-foreground">
          Risponde dalle schede dei pezzi e dai dati dei tornei. Ogni
          affermazione porta la sua fonte.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="h-full w-full" />}>
        <ChatPanel className="flex-1 min-h-0" />
      </Suspense>
    </main>
  );
}
