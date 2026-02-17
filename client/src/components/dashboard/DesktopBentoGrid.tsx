import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Shield, Cog, Zap, TrendingUp, Activity } from "lucide-react";
import { ComponentImage } from "@/components/ComponentImage";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DesktopTrendWidget } from "@/components/dashboard/widgets/DesktopTrendWidget";

interface DesktopBentoGridProps {
    selectedSeason: string;
}

export function DesktopBentoGrid({ selectedSeason }: DesktopBentoGridProps) {
    const { topBlade, topRatchet, topBit, isLoading } = useDashboardData(selectedSeason);

    if (isLoading) {
        return <DesktopBentoSkeleton />;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 auto-rows-[minmax(35vh,auto)]">
            {/* Hero Card - Top Blade */}
            <Card className="md:col-span-2 lg:col-span-2 row-span-2 p-0 overflow-hidden relative border-purple-500/20 bg-background/60 backdrop-blur-sm hover:border-purple-500/40 transition-all group shadow-lg shadow-purple-900/10">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-blue-500/5 z-0" />
                <div className="p-8 relative z-10 h-full flex flex-col justify-between">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-purple-500/20 rounded-lg backdrop-blur-md border border-purple-500/10">
                            <Trophy className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">Top Blade</h2>
                            <p className="text-sm text-muted-foreground font-medium">{selectedSeason}</p>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center py-4 w-full relative">
                        {topBlade ? (
                            <div className="relative z-10 w-full h-full flex items-center justify-center group-hover:scale-105 transition-transform duration-700 ease-out">
                                <div className="hidden md:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500/20 blur-[100px] rounded-full pointer-events-none" />
                                <div className="w-56 h-56 lg:w-64 lg:h-64 drop-shadow-[0_0_25px_rgba(168,85,247,0.5)] animate-float flex items-center justify-center">
                                    <ComponentImage
                                        name={topBlade.blade}
                                        type="blades"
                                        fallbackIcon={<Shield className="w-24 h-24 text-muted-foreground" />}
                                        testId="desktop-top-blade"
                                        priority={true}
                                        className="w-full h-full bg-transparent"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground">No data</div>
                        )}
                    </div>

                    <div className="space-y-4 relative z-20">
                        <h3 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter transparent-text bg-clip-text bg-gradient-to-r from-foreground to-foreground/70 drop-shadow-sm">
                            {topBlade?.blade || "N/A"}
                        </h3>
                        <div className="flex gap-3">
                            <Badge variant="secondary" className="px-3 py-1.5 text-sm bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/10 transition-colors">
                                {topBlade?.primiPosti || 0} Wins
                            </Badge>
                            <Badge variant="outline" className="px-3 py-1.5 text-sm border-white/10 bg-black/20 backdrop-blur-sm">
                                Score: {topBlade?.punteggioTotale.toLocaleString() || 0}
                            </Badge>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Top Ratchet */}
            <Card className="md:col-span-1 p-6 relative overflow-hidden border-white/10 bg-background/60 backdrop-blur-sm hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-900/10 transition-all group h-full flex flex-col">
                <div className="flex items-center justify-between mb-4 relative z-10">
                    <h3 className="font-semibold flex items-center gap-2">
                        <div className="p-1.5 bg-blue-500/10 rounded-md">
                            <Cog className="w-4 h-4 text-blue-400" />
                        </div>
                        Ratchet
                    </h3>
                </div>

                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Cog className="w-24 h-24" />
                </div>

                <div className="flex flex-col items-center gap-4 py-2 relative z-10 flex-1 justify-center">
                    {topRatchet && (
                        <div className="w-32 h-32 flex items-center justify-center drop-shadow-[0_0_15px_rgba(59,130,246,0.3)] group-hover:scale-110 transition-transform duration-500">
                            <ComponentImage
                                name={topRatchet.ratchet}
                                type="ratchets"
                                fallbackIcon={<Cog className="w-12 h-12 text-muted-foreground" />}
                                testId="desktop-top-ratchet"
                                className="w-full h-full bg-transparent"
                            />
                        </div>
                    )}
                    <div className="text-center mt-auto">
                        <p className="font-bold text-lg leading-tight">{topRatchet?.ratchet || "N/A"}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">{topRatchet?.punteggioTotale} pts</p>
                    </div>
                </div>
            </Card>

            {/* Top Bit */}
            <Card className="md:col-span-1 p-6 relative overflow-hidden border-white/10 bg-background/60 backdrop-blur-sm hover:border-yellow-500/30 hover:shadow-lg hover:shadow-yellow-900/10 transition-all group h-full flex flex-col">
                <div className="flex items-center justify-between mb-4 relative z-10">
                    <h3 className="font-semibold flex items-center gap-2">
                        <div className="p-1.5 bg-yellow-500/10 rounded-md">
                            <Zap className="w-4 h-4 text-yellow-400" />
                        </div>
                        Bit
                    </h3>
                </div>

                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Zap className="w-24 h-24" />
                </div>

                <div className="flex flex-col items-center gap-4 py-2 relative z-10 flex-1 justify-center">
                    {topBit && (
                        <div className="w-32 h-32 flex items-center justify-center drop-shadow-[0_0_15px_rgba(234,179,8,0.3)] group-hover:scale-110 transition-transform duration-500">
                            <ComponentImage
                                name={topBit.bit}
                                type="bits"
                                fallbackIcon={<Zap className="w-12 h-12 text-muted-foreground" />}
                                testId="desktop-top-bit"
                                className="w-full h-full bg-transparent"
                            />
                        </div>
                    )}
                    <div className="text-center mt-auto">
                        <p className="font-bold text-lg leading-tight">{topBit?.bit || "N/A"}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">{topBit?.punteggioTotale} pts</p>
                    </div>
                </div>
            </Card>

            {/* Trend Analysis Widget */}
            <Card className="md:col-span-2 lg:col-span-2 p-6 border-white/10 bg-background/60 backdrop-blur-sm flex flex-col hover:border-green-500/20 transition-all h-full">
                <DesktopTrendWidget selectedSeason={selectedSeason} />
            </Card>
        </div>
    );
}

function DesktopBentoSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <Skeleton className="md:col-span-2 row-span-2 h-[70vh]" />
            <Skeleton className="h-[35vh]" />
            <Skeleton className="h-[35vh]" />
            <Skeleton className="md:col-span-2 h-[35vh]" />
        </div>
    )
}
