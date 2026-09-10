import { format, isValid, parseISO } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Le date mostrate a schermo, in italiano.
 *
 * date-fns usa l'inglese se non gli si passa un locale, quindi ogni chiamata a
 * format() sparsa nelle pagine stampava "30 Aug 2026" dentro un'interfaccia
 * interamente italiana. Il locale sta qui una volta sola: un nuovo punto di
 * visualizzazione che importa queste funzioni non puo' dimenticarselo.
 *
 * NON usare per i valori di <input type="date"> o per i parametri di query:
 * quelli vogliono "yyyy-MM-dd" grezzo, che e' indipendente dal locale e non
 * deve seguire la lingua dell'utente.
 */

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** "30 ago 2026" - per liste, righe di tabella, card. */
export function formatDataBreve(
  value: string | Date | null | undefined,
  fallback = "Data sconosciuta",
): string {
  const date = toDate(value);
  return date ? format(date, "d MMM yyyy", { locale: it }) : fallback;
}

/** "30 agosto 2026" - per le intestazioni, dove c'e' spazio. */
export function formatDataEstesa(
  value: string | Date | null | undefined,
  fallback = "Data sconosciuta",
): string {
  const date = toDate(value);
  return date ? format(date, "d MMMM yyyy", { locale: it }) : fallback;
}

/** "ago 2026" - per le etichette degli assi nei grafici temporali. */
export function formatMeseAnno(value: string | Date | null | undefined, fallback = ""): string {
  const date = toDate(value);
  return date ? format(date, "MMM yyyy", { locale: it }) : fallback;
}

/**
 * "3 ott" - per le tacche degli assi, dove l'anno si ripete su ogni etichetta
 * e ruba spazio senza distinguere niente. Il tooltip mostra la data completa.
 */
export function formatDataAsse(value: string | Date | null | undefined, fallback = ""): string {
  const date = toDate(value);
  return date ? format(date, "d MMM", { locale: it }) : fallback;
}
