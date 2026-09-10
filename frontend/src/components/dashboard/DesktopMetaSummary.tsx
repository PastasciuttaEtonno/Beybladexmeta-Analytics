import { lazy, Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Eye, Shield, Cog, Zap } from "lucide-react";
import { ComponentImage } from "@/components/ComponentImage";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";

/**
 * Il grafico dei trend, in un chunk a parte.
 *
 * Tirava dentro recharts, che da solo pesa piu' di tutte le altre dipendenze
 * della home messe insieme, e lo faceva sul percorso critico del primo
 * caricamento. Le tre card dei componenti - il motivo per cui si apre questa
 * pagina - non lo aspettano piu'.
 */
const DesktopTrendWidget = lazy(() =>
    import("@/components/dashboard/widgets/DesktopTrendWidget").then((m) => ({
        default: m.DesktopTrendWidget,
    })),
);

/**
 * Blade, ratchet e bit: le tre parti di una combo, mostrate alla pari.
 *
 * Prima era una griglia asimmetrica in cui il blade occupava quattro volte lo
 * spazio degli altri due. Ma non e' piu' importante: sono i tre assi della
 * stessa scelta, e chi arriva qui vuole sapere cosa sta vincendo su ognuno.
 * L'asimmetria diceva una gerarchia che nei dati non c'e', e per giunta
 * lasciava un buco di 150px in fondo alla pagina.
 *
 * L'elemento che si ricorda sono le fotografie dei componenti: grandi, uguali,
 * su una superficie zitta. Sono l'unica cosa satura a schermo, e sono anche il
 * modo in cui un giocatore riconosce un pezzo prima di leggerne il nome.
 */

interface DesktopMetaSummaryProps {
    selectedSeason: string;
    onSelectType: (type: "blade" | "ratchet" | "bit") => void;
}

interface SchedaComponenteProps {
    tipo: "blade" | "ratchet" | "bit";
    etichetta: string;
    nome: string | undefined;
    punti: number | undefined;
    primiPosti: number | undefined;
    cartella: "blades" | "ratchets" | "bits";
    onClick: () => void;
}

/** Se la foto non arriva, l'icona dice comunque di che pezzo si tratta. */
const RIPIEGO: Record<string, JSX.Element> = {
    blades: <Shield className="h-16 w-16 text-muted-foreground" />,
    ratchets: <Cog className="h-16 w-16 text-muted-foreground" />,
    bits: <Zap className="h-16 w-16 text-muted-foreground" />,
};

function SchedaComponente({
    etichetta,
    nome,
    punti,
    primiPosti,
    cartella,
    onClick,
}: SchedaComponenteProps) {
    if (!nome) {
        return (
            <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-8 text-center">
                <p className="text-sm font-medium text-muted-foreground">{etichetta}</p>
                <p className="text-sm text-muted-foreground">Nessun dato per questa stagione</p>
            </Card>
        );
    }

    return (
        <Card
            className="group flex cursor-pointer flex-col p-6 transition-colors hover:border-primary/40 focus-within:border-primary/40"
            onClick={onClick}
        >
            <button
                type="button"
                onClick={onClick}
                className="flex flex-1 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                aria-label={`Apri la classifica completa dei ${etichetta.toLowerCase()}`}
            >
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{etichetta}</span>
                    <Eye
                        className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                    />
                </div>

                <div className="flex flex-1 items-center justify-center py-6">
                    <div className="h-40 w-40 drop-shadow-[0_12px_24px_hsl(var(--foreground)/0.18)] lg:h-48 lg:w-48">
                        <ComponentImage
                            name={nome}
                            type={cartella}
                            fallbackIcon={RIPIEGO[cartella]}
                            testId={`meta-top-${cartella}`}
                            priority
                            className="h-full w-full bg-transparent"
                        />
                    </div>
                </div>

                <div>
                    <p className="text-2xl font-bold leading-tight tracking-tight text-foreground">{nome}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        <span className="tabular-nums font-medium text-primary">
                            {(punti ?? 0).toLocaleString("it-IT")}
                        </span>{" "}
                        punti
                        {primiPosti ? (
                            <>
                                {" · "}
                                <span className="tabular-nums font-medium text-rank-1">{primiPosti}</span>
                                {primiPosti === 1 ? " primo posto" : " primi posti"}
                            </>
                        ) : null}
                    </p>
                </div>
            </button>
        </Card>
    );
}

function SchedaComponenteScheletro() {
    return (
        <Card className="flex flex-col p-6">
            <Skeleton className="mb-4 h-5 w-20" />
            <div className="flex flex-1 items-center justify-center py-6">
                <Skeleton className="h-40 w-40 rounded-full lg:h-48 lg:w-48" />
            </div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-2 h-4 w-40" />
        </Card>
    );
}

export function DesktopMetaSummary({ selectedSeason, onSelectType }: DesktopMetaSummaryProps) {
    const { topBlade, topRatchet, topBit, isLoading } = useDashboardData(selectedSeason);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <SchedaComponenteScheletro key={i} />
                    ))}
                </div>
                <Card className="p-6">
                    <Skeleton className="h-[18rem] w-full" />
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <SchedaComponente
                    tipo="blade"
                    etichetta="Blade"
                    nome={topBlade?.blade}
                    punti={topBlade?.punteggioTotale}
                    primiPosti={topBlade?.primiPosti}
                    cartella="blades"
                    onClick={() => onSelectType("blade")}
                />
                <SchedaComponente
                    tipo="ratchet"
                    etichetta="Ratchet"
                    nome={topRatchet?.ratchet}
                    punti={topRatchet?.punteggioTotale}
                    primiPosti={topRatchet?.primiPosti}
                    cartella="ratchets"
                    onClick={() => onSelectType("ratchet")}
                />
                <SchedaComponente
                    tipo="bit"
                    etichetta="Bit"
                    nome={topBit?.bit}
                    punti={topBit?.punteggioTotale}
                    primiPosti={topBit?.primiPosti}
                    cartella="bits"
                    onClick={() => onSelectType("bit")}
                />
            </div>

            <Card className="p-6">
                <ChunkErrorBoundary descrizione="Il grafico degli utilizzi non si è caricato.">
                    <Suspense fallback={<Skeleton className="h-[18rem] w-full rounded-lg" />}>
                        <DesktopTrendWidget selectedSeason={selectedSeason} />
                    </Suspense>
                </ChunkErrorBoundary>
            </Card>
        </div>
    );
}
