import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer } from "recharts";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DesktopComponentImage } from "@/components/analytics/desktop/DesktopComponentImage";

interface DesktopTrendWidgetProps {
    selectedSeason: string;
}

export function DesktopTrendWidget({ selectedSeason }: DesktopTrendWidgetProps) {
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

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-green-500/10 rounded-md">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="font-semibold text-sm lg:hidden xl:inline">Trend Monitor</span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px] text-xs">
                            Visualizza l'utilizzo del componente selezionato nel tempo.
                        </TooltipContent>
                    </Tooltip>
                </div>

                <div className="flex gap-2 items-center">
                    {/* Component Type Selector - Compact */}
                    <Select value={selectedComponentType} onValueChange={setSelectedComponentType}>
                        <SelectTrigger className="h-7 w-[90px] text-xs bg-background/40 border-white/10">
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
                            <SelectTrigger className="h-7 w-[130px] text-xs bg-background/40 border-white/10">
                                <SelectValue placeholder="Select..." />
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

            <div className="flex-1 w-full min-h-[100px] relative group">
                {/* Background Image */}
                {selectedName && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.25] pointer-events-none z-0 grayscale overflow-hidden">
                        <DesktopComponentImage
                            key={`${selectedComponentType}-${selectedName}`}
                            folder={selectedComponentType === "blade" ? "blades" : selectedComponentType === "ratchet" ? "ratchets" : "bits"}
                            name={selectedName}
                            className="w-[80%] h-[80%] object-contain"
                        />
                    </div>
                )}

                {trendsLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <Skeleton className="w-full h-full" />
                    </div>
                ) : chartData.length > 0 && selectedName ? (
                    <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                        <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="month" hide />
                            <YAxis hide domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2) + 10]} />
                            <ChartTooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-background/90 backdrop-blur-md border border-border p-3 rounded-lg shadow-xl">
                                                <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-primary" />
                                                    <span className="text-sm font-bold text-foreground">
                                                        {payload[0].value} Utilizzi
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
                                stroke="#8b5cf6"
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
