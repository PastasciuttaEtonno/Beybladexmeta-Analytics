import { Card } from "@/components/ui/card";
import { Trophy, Medal, Award } from "lucide-react";
import { BeybladeImage } from "@/components/common/BeybladeImage";
import type { ComboStats } from "@/hooks/useComboDetails";

interface DesktopComboVisualsProps {
    combo: ComboStats;
    rank: number;
}

export function DesktopComboVisuals({ combo, rank }: DesktopComboVisualsProps) {
    const getRankIcon = (r: number) => {
        if (r === 1) return <Trophy className="w-8 h-8 text-yellow-500 drop-shadow-[0_2px_4px_rgba(234,179,8,0.5)]" />;
        if (r === 2) return <Medal className="w-8 h-8 text-slate-300 drop-shadow-[0_2px_4px_rgba(203,213,225,0.5)]" />;
        if (r === 3) return <Award className="w-8 h-8 text-amber-700 drop-shadow-[0_2px_4px_rgba(180,83,9,0.5)]" />;
        return <span className="text-xl font-black text-muted-foreground/50">#{r}</span>;
    };

    const components = [
        { label: "Lock Chip", value: combo.lockChip, folder: "chips" },
        { label: "Blade", value: combo.blade, folder: "blades" },
        { label: "Assist Blade", value: combo.assistBlade, folder: "assist-blades" },
        { label: "Ratchet", value: combo.ratchet, folder: "ratchets" },
        { label: "Bit", value: combo.bit, folder: "bits" },
    ].filter(c => c.value && c.value.toLowerCase() !== "none" && c.value !== "-" && c.value !== undefined);

    return (
        <Card className="relative overflow-hidden border-border/50 bg-card/30 backdrop-blur-xl h-full min-h-[500px] flex flex-col items-center justify-center p-8 group">
            {/* Background Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 opacity-50 pointer-events-none" />

            {/* Rank Indicator */}
            <div className="absolute top-6 right-6 z-20 flex items-center justify-center bg-background/60 backdrop-blur-md rounded-full w-16 h-16 shadow-lg border border-white/10 ring-1 ring-black/5">
                {getRankIcon(rank)}
            </div>

            {/* Exploded View Container */}
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-8 w-full perspective-[1000px]">
                {components.map((component, index) => (
                    <div
                        key={`${component.label}-${index}`}
                        className="flex flex-col items-center gap-4 group/item hover:scale-110 transition-transform duration-500 ease-out"
                        style={{
                            animationDelay: `${index * 100}ms`
                        }}
                    >
                        <div className="relative">
                            {/* Component Glow */}
                            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover/item:opacity-70 transition-opacity duration-500" />

                            <div className="relative w-24 h-24 md:w-32 md:h-32 filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)] group-hover/item:drop-shadow-[0_20px_40px_rgba(0,0,0,0.4)] transition-all duration-300">
                                <BeybladeImage
                                    folder={component.folder}
                                    name={component.value}
                                    className="w-full h-full"
                                />
                            </div>
                        </div>

                        <div className="text-center space-y-1 opacity-70 group-hover/item:opacity-100 transition-opacity duration-300">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{component.label}</p>
                            <p className="text-lg font-bold text-foreground leading-none">{component.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Connection Lines (Decorative) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-10 z-0">
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
