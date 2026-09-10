/**
 * Riduce a testo semplice il markdown che arriva dagli organizzatori.
 *
 * Le descrizioni dei tornei su Challengermode sono scritte in markdown, e nella
 * lista finivano dentro un <p> come stringa grezza: gli utenti leggevano
 * "## **TORNEO STANDARD RANKED**" con i cancelletti e gli asterischi a schermo.
 *
 * Qui non si rende il markdown, lo si spoglia: l'anteprima nella card e' di due
 * righe tagliate da line-clamp, dove grassetti e titoli non avrebbero comunque
 * spazio per significare qualcosa. Serve il testo, e serve leggibile. Montare
 * un renderer markdown completo per due righe costerebbe piu' bundle di quanto
 * valga - e il bundle e' gia' il problema numero uno di questo frontend.
 *
 * Se un giorno la descrizione completa verra' mostrata da qualche parte, quella
 * schermata vorra' un vero renderer, non questa funzione.
 */
export function markdownATestoSemplice(input: string | null | undefined): string {
  if (!input) return "";

  return input
    // Blocchi di codice e codice inline: tengono il contenuto, perdono i backtick.
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/`([^`]+)`/g, "$1")
    // Immagini prima dei link, altrimenti resta il "!" orfano.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Titoli, citazioni e marcatori di elenco a inizio riga.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    // Righe orizzontali.
    .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, "")
    // Enfasi. Il grassetto prima del corsivo: ** e' due volte *.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    // Gli a capo diventano spazi: l'anteprima e' un paragrafo unico troncato.
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Lo stato di un torneo, in italiano.
 *
 * Le due piattaforme usano vocabolari diversi per la stessa cosa -
 * Challengermode dice "COMPLETED", Challonge dice "ended" - e finivano
 * entrambi a schermo cosi' com'erano, in maiuscolo e in inglese, sotto
 * l'etichetta "Stato".
 *
 * Uno stato sconosciuto viene restituito com'e': meglio una parola strana che
 * un campo vuoto, e cosi' si vede subito che ne e' arrivato uno nuovo da
 * mappare.
 */
const STATI_TORNEO: Record<string, string> = {
  completed: "Concluso",
  complete: "Concluso",
  ended: "Concluso",
  finished: "Concluso",
  in_progress: "In corso",
  underway: "In corso",
  running: "In corso",
  scheduled: "In programma",
  pending: "In programma",
  upcoming: "In programma",
  cancelled: "Annullato",
  canceled: "Annullato",
  awaiting_review: "In revisione",
};

export function statoTorneoInItaliano(stato: string | null | undefined): string {
  if (!stato) return "";
  return STATI_TORNEO[stato.trim().toLowerCase()] ?? stato;
}
