import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Why a linking attempt failed, shown next to the Connect buttons.
 *
 * The OAuth handlers report failures by redirecting to /profile?error=..., and
 * Profile.tsx already raises a toast for that. A toast is the wrong place for
 * this one: the page it lands on looks exactly like "you are not signed in",
 * so the reader is looking at the account rows, not at a corner of the screen —
 * and once the toast is dismissed the reason is gone for good. This says it
 * where the reader already is, and stays until they dismiss it.
 */
export function AccountLinkingAlert({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss: () => void;
}) {
  if (!error) return null;

  return (
    <Alert variant="destructive" className="relative pr-10">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Collegamento non riuscito</AlertTitle>
      <AlertDescription>
        {error}
        <span className="mt-1 block text-xs opacity-80">
          L'account non è stato collegato. Riprova con Connect; se l'errore si ripete, è
          il messaggio qui sopra che dice cosa è andato storto.
        </span>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-7 w-7"
        onClick={onDismiss}
        aria-label="Chiudi l'avviso"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
