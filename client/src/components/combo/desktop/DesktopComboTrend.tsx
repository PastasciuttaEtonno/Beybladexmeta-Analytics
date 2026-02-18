import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO, isValid } from "date-fns";
import { TrendingUp, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DesktopComboTrendProps {
    tournaments: any[];
    season?: string;
}

export function DesktopComboTrendSkeleton() {
    return (
        <Card className="w-full relative overflow-hidden border-border/50 bg-card/30 backdrop-blur-xl">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Skeleton className="w-7 h-7 rounded-md" />
                    <Skeleton className="h-5 w-40" />
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full pt-4">
                    <Skeleton className="w-full h-full rounded-lg" />
                </div>
            </CardContent>
        </Card>
    );
}

export function DesktopComboTrend({ tournaments, season }: DesktopComboTrendProps) {
    const chartData = useMemo(() => {
        if (!tournaments || tournaments.length === 0) return [];

        // 1. Sort and Group by Month
        const monthlyCounts: Record<string, { date: Date; count: number }> = {};

        tournaments.forEach((t) => {
            if (!t.date) return;
            const date = typeof t.date === 'string' ? parseISO(t.date) : new Date(t.date);
            if (!isValid(date)) return;

            const key = format(date, "MMM yyyy"); // e.g., "Oct 2025"

            if (!monthlyCounts[key]) {
                monthlyCounts[key] = { date, count: 0 };
            }
            monthlyCounts[key].count += 1;
        });

        // 2. Convert to Array and Sort by Date
        const result = Object.entries(monthlyCounts).map(([key, value]) => ({
            name: key,
            date: value.date,
            count: value.count
        })).sort((a, b) => a.date.getTime() - b.date.getTime());

        return result;
    }, [tournaments]);

    // Show the chart if there is at least one month of data
    const hasEnoughData = tournaments && tournaments.length > 0 && chartData.length >= 1;

    if (!tournaments || tournaments.length === 0) {
        return null;
    }

    return (
        <Card className="w-full relative overflow-hidden border-border/50 bg-card/30 backdrop-blur-xl group">
            {/* Background Glow Effect */}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-md">
                        <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    Popolarità nel Tempo
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full flex items-center justify-center">
                    {hasEnoughData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTrendCombo" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="name"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: 'currentColor', opacity: 0.5 }}
                                    minTickGap={30}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: 'currentColor', opacity: 0.5 }}
                                    width={30}
                                />
                                <Tooltip
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
                                    dataKey="count"
                                    stroke="#8b5cf6"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorTrendCombo)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#8b5cf6' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="text-center text-muted-foreground flex flex-col items-center gap-2">
                            <AlertCircle className="w-8 h-8 opacity-50" />
                            <p>Dati insufficienti per mostrare il trend</p>
                            <p className="text-xs opacity-50">Servono dati di almeno 1 mese</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
