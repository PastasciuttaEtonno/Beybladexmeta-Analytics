import { DesktopComboCard, DesktopComboCardSkeleton } from "./DesktopComboCard";
import type { ComboStats } from "@shared/schema";
import { Link } from "wouter";

interface DesktopAnalyticsGridProps {
    combos: ComboStats[];
    currentPage: number;
    itemsPerPage: number;
    getComboId: (combo: ComboStats) => string;
    season: string;
    isLoading?: boolean;
}

export function DesktopAnalyticsGrid({
    combos,
    currentPage,
    itemsPerPage,
    getComboId,
    season,
    isLoading
}: DesktopAnalyticsGridProps) {
    if (isLoading) {
        return (
            <div className="flex flex-wrap justify-center gap-4 md:gap-5 w-full mx-auto">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-full sm:w-[375px]">
                        <DesktopComboCardSkeleton />
                    </div>
                ))}
            </div>
        );
    }

    if (!combos || combos.length === 0) {
        return (
            <div className="py-20 text-center border border-dashed border-border rounded-xl bg-card/20">
                <p className="text-muted-foreground text-lg">No combos found matching your criteria.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap justify-center gap-4 md:gap-5 animate-in fade-in zoom-in-95 duration-500 w-full mx-auto">
            {combos.map((combo, index) => {
                const overallRank = (currentPage - 1) * itemsPerPage + index + 1;
                const comboId = getComboId(combo);

                return (
                    <Link key={comboId} href={`/combo/${comboId}?season=${encodeURIComponent(season)}`}>
                        <a className="block w-full sm:w-[375px] h-full no-underline focus:outline-none focus:ring-2 focus:ring-primary rounded-xl shrink-0">
                            <DesktopComboCard
                                combo={combo}
                                index={index}
                                rank={overallRank}
                            />
                        </a>
                    </Link>
                );
            })}
        </div>
    );
}
