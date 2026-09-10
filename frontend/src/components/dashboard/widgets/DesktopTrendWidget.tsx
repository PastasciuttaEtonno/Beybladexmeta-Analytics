import { useState, useEffect } from "react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer } from "recharts";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useColoreToken } from "@/hooks/useColoriToken";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDataAsse, formatDataBreve } from "@/lib/date";
import { TrendingUp, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DesktopComponentImage } from "@/components/analytics/desktop/DesktopComponentImage";

interface DesktopTrendWidgetProps {
    selectedSeason: string;
}

export function DesktopTrendWidget({ selectedSeason }: DesktopTrendWidgetProps) {
    const coloreLinea = useColoreToken("chart-1");
    const [selectedComponentType, setSelectedComponentType] = useState("blade");
    const [selectedName, setSelectedName] = useState<string | null>(null);

    const { trendsLoading, availableNames, getChartData } = useAnalyticsData(selectedComponentType, selectedSeason);

    // Auto-select the first available name when data loads if none selected
    useEffect(() => {
        if (!selectedName && availableNames.length > 0) {
            setSelectedName(availableNames[0]);
        } else if (selectedName && !availableNames.includes(selectedName) && availableNames.length > 0) {
            setSelectedName(availableNames[0]);
        }
    }, [availableNames, selectedName]);

    const chartData = getChartData(selectedName);

    // Calculate max value manually because YAxis function domains are unsupported in this Recharts version
    const maxValue = chartData.reduce((max: number, item: any) => {
        const val = selectedName ? item[selectedName] : 0;
        const numVal = Number(val);
        return Math.max(max, isNaN(numVal) ? 0 : numVal);
    }, 0);
    const yAxisMax = Math.max(4, Math.ceil(maxValue * 1.15));

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-chart-3/10 rounded-md">
                        <TrendingUp className="w-4 h-4 text-chart-3" />
                    </div>
                    <span className="font-semibold text-sm">Utilizzi nel tempo</span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px] text-xs">
                            Quante volte il componente scelto compare nelle combo registrate, torneo dopo torneo.
                        </TooltipContent>
                    </Tooltip>
                </div>

                <div className="flex gap-2 items-center">
                    {/* Component Type Selector - Compact */}
                    <Select value={selectedComponentType} onValueChange={setSelectedComponentType}>
                        <SelectTrigger className="h-7 w-[90px] text-xs bg-background/40 border-white/10" aria-label="Tipo di componente">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="blade">Blade</SelectItem>
                            <SelectItem value="ratchet">Ratchet</SelectItem>
                            <SelectItem value="bit">Bit</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Component Name Selector - Compact */}
                    {trendsLoading ? (
                        <Skeleton className="h-7 w-[120px]" />
                    ) : (
                        <Select
                            value={selectedName || ""}
                            onValueChange={setSelectedName}
                            disabled={availableNames.length === 0}
                        >
                            <SelectTrigger className="h-7 w-[130px] text-xs bg-background/40 border-white/10" aria-label="Componente da mostrare">
                                <SelectValue placeholder="Scegli..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableNames.map(name => (
                                    <SelectItem key={name} value={name} className="text-xs">
                                        {name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <div className="w-full h-[18rem] relative">
                {/* La sagoma del componente scelto, dietro la curva.
                 *
                 * Sta sotto (z-0) e non intercetta il puntatore, cosi' assi,
                 * griglia e tooltip restano davanti e leggibili. L'inset la
                 * tiene dentro l'area del tracciato: centrata sull'intero
                 * riquadro finirebbe sopra le etichette delle date.
                 *
                 * L'opacita' cambia col tema perche' le foto dei componenti
                 * sono chiare: al 25% su una card quasi bianca sparivano del
                 * tutto. In chiaro servono piu' opacita' e un abbassamento di
                 * luminosita' per staccarle dal fondo; in scuro bastano cosi'
                 * come sono. */}
                {selectedName && (
                    <div className="absolute inset-x-8 inset-y-0 bottom-6 flex items-center justify-center pointer-events-none z-0 overflow-hidden grayscale opacity-[0.38] brightness-[0.55] dark:opacity-[0.25] dark:brightness-100">
                        <DesktopComponentImage
                            key={`${selectedComponentType}-${selectedName}`}
                            folder={selectedComponentType === "blade" ? "blades" : selectedComponentType === "ratchet" ? "ratchets" : "bits"}
                            name={selectedName}
                            className="w-[70%] h-[70%] object-contain"
                        />
                    </div>
                )}

                {trendsLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <Skeleton className="w-full h-full" />
                    </div>
                ) : chartData.length > 0 && selectedName ? (
                    <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                        <AreaChart data={chartData} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={coloreLinea} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={coloreLinea} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="month"
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                tickLine={false}
                                axisLine={{ stroke: "hsl(var(--border))" }}
                                minTickGap={24}
                                tickFormatter={(valore) => formatDataAsse(valore)}
                            />
                            <YAxis
                                domain={[0, yAxisMax]}
                                allowDecimals={false}
                                width={32}
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <ChartTooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-background/90 backdrop-blur-md border border-border p-3 rounded-lg shadow-xl">
                                                <p className="text-xs text-muted-foreground font-medium mb-1">{formatDataBreve(String(label), String(label))}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-primary" />
                                                    <span className="text-sm font-bold text-foreground">
                                                        {payload[0].value} {payload[0].value === 1 ? "utilizzo" : "utilizzi"}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey={selectedName}
                                stroke={coloreLinea}
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorTrend)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-xs z-10 relative">
                        Nessun dato disponibile
                    </div>
                )}
            </div>
        </div>
    );
}
