import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Rete di sicurezza per i chunk caricati con lazy().
 *
 * Da quando le rotte sono divise in file separati esiste un modo nuovo di
 * rompersi: chi ha una scheda aperta durante un deploy si ritrova un
 * index.html che punta a chunk con hash vecchi, spariti dal server. L'import
 * dinamico va in errore, React smonta l'albero e l'utente resta davanti a una
 * pagina bianca senza spiegazione - verificato in locale ricostruendo il
 * container con una scheda aperta.
 *
 * Il rimedio giusto e' ricaricare: il nuovo index.html porta gli hash nuovi.
 * Il ricaricamento e' automatico ma una volta sola per finestra temporale,
 * altrimenti un chunk davvero mancante manderebbe la pagina in un ciclo.
 */

const CHIAVE_TENTATIVO = "chunk_reload_tentativo";
const ATTESA_FRA_TENTATIVI_MS = 15000;

function eErroreDiChunk(errore: unknown): boolean {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    return (
        messaggio.includes("Failed to fetch dynamically imported module") ||
        messaggio.includes("Importing a module script failed") ||
        messaggio.includes("error loading dynamically imported module")
    );
}

function ricaricaSePossibile(): boolean {
    try {
        const ultimo = Number(sessionStorage.getItem(CHIAVE_TENTATIVO) || 0);
        if (Date.now() - ultimo < ATTESA_FRA_TENTATIVI_MS) return false;
        sessionStorage.setItem(CHIAVE_TENTATIVO, String(Date.now()));
    } catch {
        // sessionStorage puo' lanciare in navigazione privata: senza memoria
        // del tentativo il ricaricamento automatico e' troppo rischioso, e
        // l'utente vede comunque il messaggio con il pulsante.
        return false;
    }
    window.location.reload();
    return true;
}

interface Props {
    children: ReactNode;
    /** Messaggio mostrato quando il ricaricamento automatico non e' partito. */
    descrizione?: string;
}

interface State {
    inErrore: boolean;
}

export class ChunkErrorBoundary extends Component<Props, State> {
    state: State = { inErrore: false };

    static getDerivedStateFromError(): State {
        return { inErrore: true };
    }

    componentDidCatch(errore: Error, info: ErrorInfo) {
        if (eErroreDiChunk(errore)) {
            ricaricaSePossibile();
            return;
        }
        // Un errore che non riguarda i chunk non lo si nasconde: resta in
        // console, dove chi sviluppa lo trova con lo stack completo.
        console.error("Errore non gestito nell'albero React:", errore, info.componentStack);
    }

    render() {
        if (!this.state.inErrore) return this.props.children;

        return (
            <div className="flex min-h-[16rem] w-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground max-w-sm">
                    {this.props.descrizione ??
                        "Questa parte della pagina non si è caricata. Di solito succede quando il sito viene aggiornato mentre lo stai usando."}
                </p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    Ricarica la pagina
                </Button>
            </div>
        );
    }
}
