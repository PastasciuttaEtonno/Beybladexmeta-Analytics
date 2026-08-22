/**
 * L'attribuzione reCAPTCHA, obbligatoria quando il badge e' nascosto.
 *
 * Le condizioni di Google consentono di togliere il badge fluttuante a una
 * condizione: che il riconoscimento resti visibile nel flusso dell'utente, con
 * i collegamenti alle norme sulla privacy e ai termini di servizio. Nasconderlo
 * e basta violerebbe i termini d'uso di reCAPTCHA, quindi questo componente e
 * la regola che nasconde il badge in index.css vanno tenuti insieme: uno senza
 * l'altro e' un difetto legale, non estetico.
 *
 * Va messo dove reCAPTCHA viene effettivamente eseguito - oggi solo il form di
 * registrazione. Se un domani venisse invocato altrove, l'attribuzione deve
 * seguirlo li'.
 */

import { cn } from "@/lib/utils";

export function RecaptchaNotice({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Questo sito è protetto da reCAPTCHA e si applicano le{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Norme sulla privacy
      </a>{" "}
      e i{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Termini di servizio
      </a>{" "}
      di Google.
    </p>
  );
}
