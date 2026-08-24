/**
 * La risposta come la legge una persona.
 *
 * Il modello scrive markdown perche' glielo chiede il prompt, e cita ogni
 * affermazione con l'identificatore del documento fra doppie parentesi. Nessuna
 * delle due cose e' fatta per essere letta cosi' com'e': in pagina finivano
 * `**parola**` invece del grassetto, e `[[knowledge/ratchets/9-60.md]]` in mezzo
 * alle frasi.
 *
 * **Le citazioni si tolgono qui, non nel prompt.** Sono il meccanismo con cui
 * `guard.verify()` accorge se il modello ha inventato una fonte: se sparissero
 * dalla generazione, il controllo anti-allucinazione non avrebbe piu' niente da
 * controllare. Restano nel testo salvato, spariscono dalla vista. Le stesse
 * fonti sono gia' elencate sotto la risposta, dove si possono anche aprire.
 *
 * **Niente HTML.** Si costruiscono elementi React, non si passa una stringa a
 * dangerouslySetInnerHTML: il testo arriva da un modello, che a sua volta ha
 * letto documenti, ed e' esattamente il percorso lungo cui si propaga
 * un'iniezione. Cio' che non e' riconosciuto resta testo.
 */

import { Fragment, type ReactNode } from "react";

const CITAZIONE = /\s*\[\[[^\]]*\]\]/g;
// Una citazione a meta' mentre la risposta e' ancora in arrivo: senza questa,
// per un istante si legge `[[knowl` in fondo alla frase.
const CITAZIONE_MOZZA = /\s*\[\[[^\]]*$/;

// Cosa resta quando si toglie la citazione da "(dal documento [[...]])": una
// parentesi che non dice piu' niente. L'elenco e' corto e mirato di proposito -
// solo le formule che il prompt fa usare al modello per introdurre una fonte.
// Regex letterale e non `new RegExp(\`...\`)`: in un template literal `\(` e
// `\s` sono escape di STRINGA, non di espressione regolare, quindi diventano
// "(" e "s" e il risultato cancella le esse dal testo. Costruire una regex
// concatenando stringhe sembra piu' leggibile e non lo e'.
const PARENTESI_VUOTA =
  /\(\s*(?:(?:dal|dai|dallo|dalla|nel|nei|nello|nella|stesso|stessa|sopra|citato|citata|vedi|cfr\.?|fonte:?|documento|documenti|scheda)[\s,;:]*)*\)/gi;

export function stripCitations(text: string): string {
  return text
    .replace(CITAZIONE, "")
    .replace(CITAZIONE_MOZZA, "")
    .replace(PARENTESI_VUOTA, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+$/gm, "");
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\n]+\*(?!\w)|(?<![_\w])_[^_\n]+_(?!\w))/g;

function inline(text: string, chiave: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((pezzo, i) => {
    const k = `${chiave}-${i}`;
    if (pezzo.startsWith("**") && pezzo.endsWith("**")) {
      return <strong key={k}>{pezzo.slice(2, -2)}</strong>;
    }
    if (pezzo.startsWith("`") && pezzo.endsWith("`")) {
      return (
        <code key={k} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {pezzo.slice(1, -1)}
        </code>
      );
    }
    if (
      (pezzo.startsWith("*") && pezzo.endsWith("*")) ||
      (pezzo.startsWith("_") && pezzo.endsWith("_"))
    ) {
      return <em key={k}>{pezzo.slice(1, -1)}</em>;
    }
    return <Fragment key={k}>{pezzo}</Fragment>;
  });
}

const PUNTO_ELENCO = /^\s*[-*•]\s+/;
const NUMERO_ELENCO = /^\s*(\d+)[.)]\s+/;
const TITOLO = /^\s*#{1,6}\s+/;
const RIGA_TABELLA = /^\s*\|.*\|\s*$/;
// La riga di separazione di una tabella markdown: |---|:--:|. Non e' contenuto,
// dice solo dove finisce l'intestazione.
const SEPARATORE_TABELLA = /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/;

/** I blocchi separati da una riga vuota: e' l'unico confine che il modello
 * segna sempre, e serve a non fondere due elenchi distinti in uno. */
export function blocks(text: string): string[][] {
  const righe = stripCitations(text).split("\n");
  const risultato: string[][] = [];
  let corrente: string[] = [];
  for (const riga of righe) {
    if (riga.trim() === "") {
      if (corrente.length) risultato.push(corrente);
      corrente = [];
    } else {
      corrente.push(riga);
    }
  }
  if (corrente.length) risultato.push(corrente);
  return risultato;
}

type Gruppo =
  | { tipo: "punti" | "numeri" | "paragrafo" | "tabella"; righe: string[] };

/**
 * Le righe si raggruppano per FORMA, non per blocco.
 *
 * Prima si guardava se un blocco fosse tutto un elenco, e un blocco che
 * cominciava con una frase e proseguiva con i trattini non lo era: restava un
 * paragrafo, trattini compresi, che e' come il difetto si e' visto in pagina.
 * Il modello scrive cosi' quasi sempre - una riga che introduce, poi la lista.
 */
export function groups(text: string): Gruppo[] {
  const risultato: Gruppo[] = [];
  const spingi = (tipo: Gruppo["tipo"], riga: string) => {
    const ultimo = risultato[risultato.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.righe.push(riga);
    else risultato.push({ tipo, righe: [riga] });
  };

  for (const blocco of blocks(text)) {
    for (const riga of blocco) {
      if (RIGA_TABELLA.test(riga)) spingi("tabella", riga);
      else if (PUNTO_ELENCO.test(riga)) spingi("punti", riga);
      else if (NUMERO_ELENCO.test(riga)) spingi("numeri", riga);
      else spingi("paragrafo", riga);
    }
    // Il blocco successivo non continua l'elenco precedente: la riga vuota che
    // li separava e' un confine, e senza questo due elenchi distinti si
    // fonderebbero in uno.
    risultato.push({ tipo: "paragrafo", righe: [] });
  }
  return risultato.filter((g) => g.righe.length > 0);
}

function celle(riga: string): string[] {
  return riga.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function Tabella({ righe, chiave }: { righe: string[]; chiave: string }) {
  const corpo = righe.filter((r) => !SEPARATORE_TABELLA.test(r));
  if (!corpo.length) return null;
  const [intestazione, ...resto] = corpo;
  const haIntestazione = righe.length > corpo.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        {haIntestazione && (
          <thead>
            <tr className="border-b">
              {celle(intestazione).map((c, i) => (
                <th key={i} className="px-2 py-1 text-left font-semibold">
                  {inline(c, `${chiave}-h-${i}`)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(haIntestazione ? resto : corpo).map((r, ri) => (
            <tr key={ri} className="border-b border-muted last:border-0">
              {celle(r).map((c, ci) => (
                <td key={ci} className="px-2 py-1 align-top">
                  {inline(c, `${chiave}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnswerText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {groups(text).map((gruppo, g) => {
        if (gruppo.tipo === "punti") {
          return (
            <ul key={g} className="ml-4 list-disc space-y-1">
              {gruppo.righe.map((r, i) => (
                <li key={i}>{inline(r.replace(PUNTO_ELENCO, ""), `${g}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (gruppo.tipo === "numeri") {
          return (
            <ol key={g} className="ml-4 list-decimal space-y-1">
              {gruppo.righe.map((r, i) => (
                <li key={i}>{inline(r.replace(NUMERO_ELENCO, ""), `${g}-${i}`)}</li>
              ))}
            </ol>
          );
        }
        if (gruppo.tipo === "tabella") {
          return <Tabella key={g} righe={gruppo.righe} chiave={String(g)} />;
        }
        if (gruppo.righe.length === 1 && TITOLO.test(gruppo.righe[0])) {
          return (
            <p key={g} className="font-semibold">
              {inline(gruppo.righe[0].replace(TITOLO, ""), `${g}-0`)}
            </p>
          );
        }
        return (
          <p key={g} className="whitespace-pre-wrap">
            {gruppo.righe.map((r, i) => (
              <Fragment key={i}>
                {i > 0 && "\n"}
                {inline(r, `${g}-${i}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
