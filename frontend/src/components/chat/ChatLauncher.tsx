/**
 * Il lanciatore globale: apre il pannello senza lasciare la pagina.
 *
 * E' il motivo per cui il pannello esiste oltre alla rotta /chat. La domanda
 * nasce mentre si guarda una combo - "ma questo bit perche' si usa tanto?" - e
 * obbligare a cambiare pagina spezza esattamente il momento in cui serve.
 *
 * Il componente e' caricato in ritardo: il pannello porta con se' il codice
 * dello streaming e non deve pesare sul primo caricamento di chi non lo apre.
 */

import { lazy, Suspense, useState } from "react";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

const ChatPanel = lazy(() =>
  import("@/components/chat/ChatPanel").then((m) => ({ default: m.ChatPanel })),
);

export function ChatLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Il posizionamento sta sul contenitore, non sul pulsante.
          `hover-elevate` del design system dichiara `position: relative` per
          piazzare il suo overlay ::after, e quella regola batte `.fixed` per
          specificita': il pulsante NON era fisso: restava nel flusso in fondo
          al documento, con bottom/right letti come scostamenti relativi, e
          finiva fuori dallo schermo in basso a sinistra. Separare i ruoli
          tiene sia la posizione sia l'effetto al passaggio del mouse.

          Su schermo stretto sta sopra la BottomNav, che e' alta ~65px ed e'
          fissa in basso; su schermo largo la barra non c'e' e il pulsante
          scende. Il badge reCAPTCHA occupava questo stesso angolo ed e' ora
          nascosto (index.css), con l'attribuzione spostata nel form. */}
      <div className="fixed bottom-20 right-4 z-40 md:bottom-6">
        <SheetTrigger asChild>
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            aria-label="Apri l'assistente"
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
        </SheetTrigger>
      </div>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle>Assistente</SheetTitle>
          <SheetDescription>
            Solo Beyblade X. Ogni affermazione porta la sua fonte.
          </SheetDescription>
        </SheetHeader>
        {/* Il pannello si monta solo all'apertura, cosi' il codice dello
            streaming non entra nel primo caricamento della pagina. */}
        {open && (
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <ChatPanel className="flex-1 min-h-0 pt-2" />
          </Suspense>
        )}
      </SheetContent>
    </Sheet>
  );
}
