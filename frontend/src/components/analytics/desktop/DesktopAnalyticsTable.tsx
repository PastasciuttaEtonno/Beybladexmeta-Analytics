import { Link } from "wouter";
import { Trophy, Medal, Award, ArrowDown, ArrowUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ComboStats } from "@/types/api";
import { DesktopComponentImage } from "./DesktopComponentImage";

/**
 * La classifica delle combo, come tabella.
 *
 * Prima erano card da 375px in una griglia a capo: sei combo per schermata, e
 * per ordinare bisognava aprire una finestra di dialogo. Ma la domanda che
 * porta qui e' "cosa sta vincendo, e di quanto" - una domanda di confronto, che
 * si risponde mettendo le righe una sotto l'altra e potendo riordinare
 * cliccando l'intestazione della colonna che interessa.
 *
 * Le foto dei componenti restano, piccole, DENTRO la riga: in questo gioco un
 * blade si riconosce a colpo d'occhio molto prima di leggerne il nome, quindi
 * sono l'identificatore piu' veloce, non una decorazione.
 */

type ChiaveOrdinamento = "score" | "first" | "second" | "third" | "fourth";

interface DesktopAnalyticsTableProps {
    combos: ComboStats[];
    currentPage: number;
    itemsPerPage: number;
    getComboId: (combo: ComboStats) => string;
    season: string;
    isLoading?: boolean;
    sortBy: string;
    sortOrder: "asc" | "desc";
    onSort: (chiave: ChiaveOrdinamento) => void;
}

const VUOTO = (valore: string | null | undefined) =>
    !valore || valore.trim().toLowerCase() === "none" || valore === "-";

/** Le posizioni sul podio hanno un'icona propria; dalla quarta in poi, il numero. */
function IconaPosizione({ posizione }: { posizione: number }) {
    if (posizione === 1) return <Trophy className="h-4 w-4 text-rank-1" aria-hidden />;
    if (posizione === 2) return <Medal className="h-4 w-4 text-rank-2" aria-hidden />;
    if (posizione === 3) return <Award className="h-4 w-4 text-rank-3" aria-hidden />;
    return null;
}

/**
 * Uno zero non e' un risultato: e' l'assenza di un risultato.
 *
 * Nelle card veniva stampato come "0" nello stesso peso dei valori veri, e in
 * una griglia di numeri quelli erano la maggioranza - si leggevano prima gli
 * zeri delle vittorie. Un trattino spento lo dice senza occupare l'attenzione.
 */
function Conteggio({ valore, classe }: { valore: number; classe: string }) {
    if (!valore) {
        return (
            <span className="text-muted-foreground" aria-label="nessuno">
                –
            </span>
        );
    }
    return <span className={cn("font-medium tabular-nums", classe)}>{valore}</span>;
}

function IntestazioneOrdinabile({
    etichetta,
    descrizione,
    chiave,
    sortBy,
    sortOrder,
    onSort,
    className,
}: {
    etichetta: string;
    descrizione: string;
    chiave: ChiaveOrdinamento;
    sortBy: string;
    sortOrder: "asc" | "desc";
    onSort: (chiave: ChiaveOrdinamento) => void;
    className?: string;
}) {
    const attiva = sortBy === chiave;
    return (
        <TableHead className={cn("p-0", className)}>
            <button
                type="button"
                onClick={() => onSort(chiave)}
                aria-label={`Ordina per ${descrizione}`}
                // aria-sort andrebbe sul <th>, ma qui basta comunicare lo stato:
                // il bordo colorato lo dice a chi vede, questo a chi ascolta.
                aria-pressed={attiva}
                className={cn(
                    "flex h-full w-full items-center gap-1 px-3 py-2 text-xs font-medium transition-colors",
                    "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                    className?.includes("text-right") ? "justify-end" : "justify-start",
                    attiva ? "text-foreground" : "text-muted-foreground",
                )}
            >
                {etichetta}
                {attiva &&
                    (sortOrder === "desc" ? (
                        <ArrowDown className="h-3 w-3" aria-hidden />
                    ) : (
                        <ArrowUp className="h-3 w-3" aria-hidden />
                    ))}
            </button>
        </TableHead>
    );
}

export function DesktopAnalyticsTable({
    combos,
    currentPage,
    itemsPerPage,
    getComboId,
    season,
    isLoading,
    sortBy,
    sortOrder,
    onSort,
}: DesktopAnalyticsTableProps) {
    if (isLoading) {
        return (
            <div className="space-y-px rounded-lg border border-border overflow-hidden">
                {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-none" />
                ))}
            </div>
        );
    }

    if (!combos || combos.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border bg-card/20 py-16 text-center">
                <p className="text-muted-foreground">Nessuna combo corrisponde ai filtri scelti.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Prova ad allargare la ricerca o a cambiare stagione.
                </p>
            </div>
        );
    }

    /**
     * Coppa, medaglia e nastro dicono "podio del meta". Hanno senso solo nella
     * classifica canonica - punti, dal piu' alto: riordinando per secondi posti
     * la prima riga e' semplicemente la prima di quell'ordine, e mostrarci una
     * coppa direbbe una cosa falsa. Fuori da li' resta il numero di riga.
     */
    const classificaCanonica = sortBy === "score" && sortOrder === "desc";

    return (
        <div className="rounded-lg border border-border overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-14 px-3 text-xs font-medium text-muted-foreground">#</TableHead>
                        <TableHead className="px-3 text-xs font-medium text-muted-foreground">Combo</TableHead>
                        <IntestazioneOrdinabile
                            etichetta="Punti"
                            descrizione="punteggio totale"
                            chiave="score"
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            onSort={onSort}
                            className="w-24 text-right"
                        />
                        <IntestazioneOrdinabile
                            etichetta="1°"
                            descrizione="primi posti"
                            chiave="first"
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            onSort={onSort}
                            className="w-16 text-right"
                        />
                        <IntestazioneOrdinabile
                            etichetta="2°"
                            descrizione="secondi posti"
                            chiave="second"
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            onSort={onSort}
                            className="w-16 text-right"
                        />
                        <IntestazioneOrdinabile
                            etichetta="3°"
                            descrizione="terzi posti"
                            chiave="third"
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            onSort={onSort}
                            className="w-16 text-right"
                        />
                        <IntestazioneOrdinabile
                            etichetta="4°"
                            descrizione="quarti posti"
                            chiave="fourth"
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            onSort={onSort}
                            className="w-16 text-right"
                        />
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {combos.map((combo, indice) => {
                        const posizione = (currentPage - 1) * itemsPerPage + indice + 1;
                        const id = getComboId(combo);
                        const sulPodio = classificaCanonica && posizione <= 3;

                        return (
                            <TableRow
                                key={id}
                                className={cn(
                                    // Il filo colorato a sinistra dice "podio" senza aggiungere
                                    // una colonna: e' informazione, non ornamento. Ce l'hanno
                                    // tutte le righe, trasparente fuori dal podio, altrimenti le
                                    // prime tre slitterebbero di 2px rispetto alle altre.
                                    "group border-l-2 border-l-transparent",
                                    sulPodio && posizione === 1 && "border-l-rank-1",
                                    sulPodio && posizione === 2 && "border-l-rank-2",
                                    sulPodio && posizione === 3 && "border-l-rank-3",
                                )}
                            >
                                <TableCell className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                        {sulPodio && <IconaPosizione posizione={posizione} />}
                                        <span
                                            className={cn(
                                                "tabular-nums text-sm",
                                                sulPodio ? "font-semibold text-foreground" : "text-muted-foreground",
                                            )}
                                        >
                                            {posizione}
                                        </span>
                                    </div>
                                </TableCell>

                                <TableCell className="px-3 py-2">
                                    <Link href={`/combo/${id}?season=${encodeURIComponent(season)}`} asChild>
                                        <a className="flex items-center gap-3 no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                                            <div className="flex shrink-0 items-center gap-1">
                                                {!VUOTO(combo.lockChip) && (
                                                    <DesktopComponentImage folder="chips" name={combo.lockChip} className="h-7 w-7" />
                                                )}
                                                {!VUOTO(combo.assistBlade) && (
                                                    <DesktopComponentImage folder="assist-blades" name={combo.assistBlade} className="h-7 w-7" />
                                                )}
                                                <DesktopComponentImage folder="blades" name={combo.blade} className="h-9 w-9" />
                                                {!VUOTO(combo.ratchet) && (
                                                    <DesktopComponentImage folder="ratchets" name={combo.ratchet} className="h-7 w-7" />
                                                )}
                                                {!VUOTO(combo.bit) && (
                                                    <DesktopComponentImage folder="bits" name={combo.bit} className="h-7 w-7" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                                                    {!VUOTO(combo.lockChip) && `${combo.lockChip} `}
                                                    {combo.blade}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {[combo.assistBlade, combo.ratchet, combo.bit]
                                                        .filter((v) => !VUOTO(v))
                                                        .join(" · ")}
                                                </p>
                                            </div>
                                        </a>
                                    </Link>
                                </TableCell>

                                <TableCell className="px-3 py-2 text-right">
                                    <span className="tabular-nums font-semibold text-primary">
                                        {combo.punteggioTotale.toLocaleString("it-IT")}
                                    </span>
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right">
                                    <Conteggio valore={combo.primiPosti} classe="text-rank-1" />
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right">
                                    <Conteggio valore={combo.secondiPosti} classe="text-rank-2" />
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right">
                                    <Conteggio valore={combo.terziPosti} classe="text-rank-3" />
                                </TableCell>
                                <TableCell className="px-3 py-2 text-right">
                                    <Conteggio valore={combo.quartiPosti} classe="text-rank-4" />
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
