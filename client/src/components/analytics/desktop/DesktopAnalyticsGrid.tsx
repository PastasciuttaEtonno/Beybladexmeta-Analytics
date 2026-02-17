import { DesktopComboCard } from "./DesktopComboCard";
import type { ComboStats } from "@shared/schema";
import { Link } from "wouter";

interface DesktopAnalyticsGridProps {
    combos: ComboStats[];
    currentPage: number;
    itemsPerPage: number;
    getComboId: (combo: ComboStats) => string;
}

export function DesktopAnalyticsGrid({ combos, currentPage, itemsPerPage, getComboId }: DesktopAnalyticsGridProps) {
    if (!combos || combos.length === 0) {
        return (
            <div className="py-20 text-center border border-dashed border-border rounded-xl bg-card/20">
                <p className="text-muted-foreground text-lg">No combos found matching your criteria.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-500">
            {combos.map((combo, index) => {
                const overallRank = (currentPage - 1) * itemsPerPage + index + 1;
                const comboId = getComboId(combo);

                return (
                    <Link key={comboId} href={`/combo/${comboId}`}>
                        <a className="block h-full no-underline focus:outline-none focus:ring-2 focus:ring-primary rounded-xl">
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
