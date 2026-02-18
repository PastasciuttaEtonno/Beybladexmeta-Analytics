import { Card } from "@/components/ui/card";
import { Trophy, Medal, Award } from "lucide-react";
import { BeybladeImage } from "@/components/common/BeybladeImage";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComboStats } from "@/hooks/useComboDetails";

interface DesktopComboVisualsProps {
    combo: ComboStats;
    rank: number;
}

export function DesktopComboVisualsSkeleton() {
    return (
        <Card className="relative overflow-hidden border-border/50 bg-card/30 backdrop-blur-xl h-full min-h-[270px] flex flex-col items-center justify-center p-4">
            <div className="absolute top-4 right-4 z-20 flex items-center gap-3 bg-background/60 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="w-8 h-8 rounded-full" />
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-x-8 gap-y-2 w-full max-w-sm mx-auto">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-3">
                        <Skeleton className="w-14 h-14 md:w-20 md:h-20 rounded-full" />
                        <div className="text-center space-y-1">
                            <Skeleton className="h-2 w-12 mx-auto" />
                            <Skeleton className="h-4 w-20 mx-auto" />
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

export function DesktopComboVisuals({ combo, rank }: DesktopComboVisualsProps) {
    const getRankIcon = (r: number) => {
        if (r === 1) return <Trophy className="w-8 h-8 text-yellow-500 drop-shadow-[0_2px_4px_rgba(234,179,8,0.5)]" />;
        if (r === 2) return <Medal className="w-8 h-8 text-slate-300 drop-shadow-[0_2px_4px_rgba(203,213,225,0.5)]" />;
        if (r === 3) return <Award className="w-8 h-8 text-amber-700 drop-shadow-[0_2px_4px_rgba(180,83,9,0.5)]" />;
        return <span className="text-xl font-black text-muted-foreground/50">#{r}</span>;
    };

    const components = [
        { label: "Blade", value: combo.blade, folder: "blades" },
        { label: "Assist Blade", value: combo.assistBlade, folder: "assist-blades" },
        { label: "Ratchet", value: combo.ratchet, folder: "ratchets" },
        { label: "Bit", value: combo.bit, folder: "bits" },
    ].filter(c => c.value && c.value.toLowerCase() !== "none" && c.value !== "-" && c.value !== undefined);

    const lockChip = combo.lockChip && combo.lockChip.toLowerCase() !== "none" ? combo.lockChip : null;

    return (
        <Card className="relative overflow-hidden border-border/50 bg-card/30 backdrop-blur-xl h-full min-h-[270px] flex flex-col items-center justify-center p-4 group">
            {/* Background Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-50 pointer-events-none" />

            {/* Rank & Lock Chip Indicator */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-3 bg-background/60 backdrop-blur-md rounded-full px-3 py-1.5 shadow-lg border border-white/10 ring-1 ring-black/5">
                {lockChip && (
                    <div className="w-10 h-10 filter drop-shadow-sm">
                        <BeybladeImage
                            folder="chips"
                            name={lockChip}
                            className="w-full h-full"
                        />
                    </div>
                )}
                <div className="flex items-center justify-center min-w-[32px]">
                    {getRankIcon(rank)}
                </div>
            </div>

            {/* Exploded View Container */}
            <div className={`relative z-10 grid grid-cols-2 gap-x-8 gap-y-2 w-full max-w-sm mx-auto perspective-[1000px] ${components.length === 3 ? "justify-items-center" : ""
                }`}>
                {components.map((component, index) => (
                    <div
                        key={`${component.label}-${index}`}
                        className={`flex flex-col items-center gap-3 group/item ${components.length === 3 && index === 2 ? "col-span-2" : ""
                            }`}
                        style={{
                            animationDelay: `${index * 100}ms`
                        }}
                    >
                        <div className="relative">
                            {/* Component Glow */}
                            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover/item:opacity-70 transition-opacity duration-500" />

                            <div className="relative w-14 h-14 md:w-20 md:h-20 filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)] group-hover/item:drop-shadow-[0_20px_40px_rgba(0,0,0,0.4)] transition-all duration-300">
                                <BeybladeImage
                                    folder={component.folder}
                                    name={component.value}
                                    className="w-full h-full"
                                />
                            </div>
                        </div>

                        <div className="text-center space-y-0.5 opacity-70 group-hover/item:opacity-100 transition-opacity duration-300">
                            <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{component.label}</p>
                            <p className="text-base font-bold text-foreground leading-none">{component.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Connection Lines (Decorative) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-5 z-0">
                <defs>
                    <linearGradient id="lineResult" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="transparent" />
                        <stop offset="50%" stopColor="currentColor" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                </defs>
                <path d="M0,50% H100%" stroke="url(#lineResult)" strokeWidth="1" className="text-primary" />
            </svg>
        </Card>
    );
}
