import { useEffect, useState } from "react";

/**
 * Risolve i token di colore in stringhe hsl() utilizzabili da recharts.
 *
 * Serve un hook e non una classe CSS perche' recharts scrive `stroke` e `fill`
 * come attributi di presentazione SVG, e negli attributi var() non viene
 * risolta: passare "var(--chart-1)" darebbe una linea nera. Qui il valore lo
 * legge getComputedStyle, che var() la risolve eccome.
 *
 * Prima i grafici avevano i colori scritti a mano - "#8b5cf6", cioe' il viola
 * di shadcn - quindi restavano indietro a ogni cambio di palette e ignoravano
 * del tutto il tema chiaro.
 *
 * ORDINE DEGLI EVENTI, che qui e' tutto:
 *
 * ThemeProvider scambia la classe su <html> dentro un useEffect, cioe' DOPO
 * che i figli hanno gia' renderizzato. Leggere getComputedStyle durante il
 * render - o dentro un effetto di questo componente, che gira prima di quello
 * del genitore - restituisce quindi la palette del tema precedente, e il
 * grafico resta indietro di un cambio. E' successo davvero, in due versioni
 * diverse di questo file.
 *
 * L'unico segnale affidabile e' la modifica del DOM: quando il
 * MutationObserver scatta, la classe nuova c'e' gia' e getComputedStyle
 * risponde con i valori giusti (verificato in Chrome campionando dentro il
 * microtask dell'osservatore). Da li' un setState porta i colori al render
 * successivo.
 */

function leggi(nomi: string[]): string[] {
    if (typeof window === "undefined") return nomi.map(() => "currentColor");
    const stile = getComputedStyle(document.documentElement);
    return nomi.map((nome) => {
        const valore = stile.getPropertyValue(`--${nome}`).trim();
        return valore ? `hsl(${valore})` : "currentColor";
    });
}

export function useColoriToken(...nomi: string[]): string[] {
    const chiave = nomi.join(",");

    // Il primo valore e' gia' quello giusto: lo script inline in index.html
    // applica il tema prima del primo paint, quindi al montaggio la classe
    // sull'elemento radice e' definitiva.
    const [colori, setColori] = useState<string[]>(() => leggi(chiave.split(",")));

    useEffect(() => {
        const aggiorna = () => {
            const nuovi = leggi(chiave.split(","));
            // Confronto valore per valore: restituire sempre un array nuovo
            // farebbe renderizzare i grafici a ogni modifica di classe su
            // <html>, anche quelle che non c'entrano con il tema.
            setColori((precedenti) =>
                precedenti.length === nuovi.length && nuovi.every((c, i) => c === precedenti[i])
                    ? precedenti
                    : nuovi,
            );
        };

        // Il tema puo' essere cambiato fra il primo render e questo effetto.
        aggiorna();

        const osservatore = new MutationObserver(aggiorna);
        osservatore.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => osservatore.disconnect();
    }, [chiave]);

    return colori;
}

/** Comodita' per il caso piu' frequente: un colore solo. */
export function useColoreToken(nome: string): string {
    return useColoriToken(nome)[0];
}
