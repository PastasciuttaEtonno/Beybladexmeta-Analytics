import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Eye } from "lucide-react";
import type { ComboStats } from "@shared/schema";
import { useState, useMemo, useEffect } from "react";

const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

import { Skeleton } from "@/components/ui/skeleton";
import { DesktopComponentImage } from "./DesktopComponentImage";

interface DesktopComboCardProps {
    combo: ComboStats;
    index: number;
    rank: number;
    onClick?: () => void;
}

export function DesktopComboCard({ combo, index, rank, onClick }: DesktopComboCardProps) {
    const getRankIcon = (r: number) => {
        if (r === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
        if (r === 2) return <Medal className="w-5 h-5 text-gray-400" />;
        if (r === 3) return <Award className="w-5 h-5 text-amber-600" />;
        return <span className="text-sm font-bold text-muted-foreground">#{r}</span>;
    };

    const componentsList = useMemo(() => {
        const items = [];
        if (combo.assistBlade && combo.assistBlade.trim().toLowerCase() !== "none" && combo.assistBlade !== "-") items.push(combo.assistBlade);
        if (combo.ratchet && combo.ratchet.trim().toLowerCase() !== "none" && combo.ratchet !== "-") items.push(combo.ratchet);
        if (combo.bit && combo.bit.trim().toLowerCase() !== "none" && combo.bit !== "-") items.push(combo.bit);
        return items;
    }, [combo.assistBlade, combo.ratchet, combo.bit]);

    const hasRatchet = useMemo(() => {
        return combo.ratchet && combo.ratchet.trim().toLowerCase() !== "none" && combo.ratchet !== "-";
    }, [combo.ratchet]);

    const hasBit = useMemo(() => {
        return combo.bit && combo.bit.trim().toLowerCase() !== "none" && combo.bit !== "-";
    }, [combo.bit]);

    return (
        <Card
            className="group relative overflow-hidden border-border bg-card/40 backdrop-blur-md hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-300 cursor-pointer h-full"
            onClick={onClick}
        >
            {/* Absolute Rank Badge & Lock Chip */}
            {/* Absolute Rank Badge & Icons */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                {combo.lockChip && combo.lockChip.trim().toLowerCase() !== "none" && combo.lockChip !== "-" && (
                    <div className="w-8 h-8 flex items-center justify-center drop-shadow-sm filter">
                        <DesktopComponentImage folder="chips" name={combo.lockChip} className="w-full h-full" />
                    </div>
                )}
                {combo.assistBlade && combo.assistBlade.trim().toLowerCase() !== "none" && combo.assistBlade !== "-" && (
                    <div className="w-8 h-8 flex items-center justify-center drop-shadow-sm filter">
                        <DesktopComponentImage folder="assist-blades" name={combo.assistBlade} className="w-full h-full" />
                    </div>
                )}
                <div className="flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-full w-7 h-7 shadow-sm border border-border">
                    {getRankIcon(rank)}
                </div>
            </div>

            <div className="p-4 flex flex-col h-full relative z-0">

                {/* Header: Combo Name & Components */}
                <div className="mb-4 pr-8">
                    <h3 className="font-black text-lg tracking-tight leading-tight text-foreground/90 group-hover:text-primary transition-colors truncate"
                        title={`${combo.lockChip && combo.lockChip.trim().toLowerCase() !== "none" && combo.lockChip !== "-" ? combo.lockChip + "" : ""}${combo.blade}`}>
                        {combo.lockChip && combo.lockChip.trim().toLowerCase() !== "none" && combo.lockChip !== "-" && (
                            <span className="opacity-90 mr-1">{combo.lockChip}</span>
                        )}
                        {combo.blade}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground font-medium">
                        {componentsList.map((item, i) => (
                            <div key={i} className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate" title={item}>{item}</span>
                                {i < componentsList.length - 1 && <span className="text-muted-foreground/30 shrink-0">/</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Visuals: Overlapping Components - Trading Card Style */}
                <div className="flex items-center justify-center h-24 w-full relative mb-4 select-none pointer-events-none">
                    {!hasRatchet ? (
                        /* Layout for Missing Ratchet: Side-by-Side */
                        <div className="flex flex-row items-center justify-center gap-4 w-full h-full">
                            <div className="relative z-20 scale-100 transition-transform duration-500">
                                <DesktopComponentImage folder="blades" name={combo.blade} className="w-24 h-24" />
                            </div>
                            {hasBit && (
                                <div className="relative z-10 scale-90 transition-transform duration-500">
                                    <DesktopComponentImage folder="bits" name={combo.bit} className="w-20 h-20" />
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Default Layout: Overlapping */
                        <div className="relative w-full h-full flex items-center justify-center">
                            {/* Ratchet (Background Left) */}
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-100 scale-75 transition-transform duration-500 z-0">
                                <DesktopComponentImage folder="ratchets" name={combo.ratchet} className="w-20 h-20" />
                            </div>

                            {/* Blade (Foreground Center) */}
                            <div className="relative z-20 scale-100 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-500">
                                <DesktopComponentImage folder="blades" name={combo.blade} className="w-24 h-24" />
                            </div>

                            {/* Bit (Background Right) */}
                            {hasBit && (
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-100 scale-75 transition-transform duration-500 z-0">
                                    <DesktopComponentImage folder="bits" name={combo.bit} className="w-20 h-20" />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Stats Grid - Bottom */}
                <div className="flex items-stretch gap-2 mt-auto pt-3 border-t border-border">
                    {/* Score Section */}
                    <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-muted/40 backdrop-blur-sm group-hover:bg-muted/60 transition-colors w-20 shrink-0">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-bold mb-0.5">Score</span>
                        <span className="text-sm font-black text-primary truncate w-full text-center" title={combo.punteggioTotale.toLocaleString()}>{combo.punteggioTotale.toLocaleString()}</span>
                    </div>

                    {/* Placements Section */}
                    <div className="flex-1 grid grid-cols-4 gap-1 p-1 rounded-lg bg-muted/40 backdrop-blur-sm group-hover:bg-muted/60 transition-colors text-center">
                        <div className="flex flex-col items-center justify-center">
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/70 font-bold mb-0.5">1st</span>
                            <span className="text-xs font-bold text-yellow-500">{combo.primiPosti || 0}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/70 font-bold mb-0.5">2nd</span>
                            <span className="text-xs font-bold text-gray-500">{combo.secondiPosti || 0}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/70 font-bold mb-0.5">3rd</span>
                            <span className="text-xs font-bold text-amber-700">{combo.terziPosti || 0}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/70 font-bold mb-0.5">4th</span>
                            <span className="text-xs font-bold text-slate-500">{combo.quartiPosti || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Overlay Action (Visible on Hover) */}
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-200">
                        Vedi
                    </Badge>
                </div>
            </div>
        </Card>
    );
}

export function DesktopComboCardSkeleton() {
    return (
        <Card className="relative overflow-hidden border-border bg-card/40 backdrop-blur-md transition-all duration-300 h-full">
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                <Skeleton className="w-8 h-8 rounded-md" />
                <Skeleton className="w-8 h-8 rounded-md" />
                <Skeleton className="w-7 h-7 rounded-full" />
            </div>

            <div className="p-4 flex flex-col h-full relative z-0">
                {/* Header Skeleton */}
                <div className="mb-4 pr-8">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                </div>

                {/* Visuals Skeleton */}
                <div className="flex items-center justify-center h-24 w-full relative mb-4">
                    <div className="relative w-full h-full flex items-center justify-center">
                        <Skeleton className="absolute left-0 w-20 h-20 rounded-full opacity-50" />
                        <Skeleton className="relative z-10 w-24 h-24 rounded-full" />
                        <Skeleton className="absolute right-0 w-20 h-20 rounded-full opacity-50" />
                    </div>
                </div>

                {/* Stats Grid Skeleton */}
                <div className="flex items-stretch gap-2 mt-auto pt-3 border-t border-border">
                    <Skeleton className="h-14 w-20 rounded-lg" />
                    <div className="flex-1 grid grid-cols-4 gap-1 p-1 rounded-lg bg-muted/20">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex flex-col items-center justify-center gap-1">
                                <Skeleton className="h-2 w-4" />
                                <Skeleton className="h-3 w-6" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Card>
    );
}
