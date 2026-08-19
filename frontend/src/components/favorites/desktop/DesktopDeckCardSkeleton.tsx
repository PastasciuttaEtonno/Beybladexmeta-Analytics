import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DesktopDeckCardSkeleton() {
    return (
        <Card className="group relative overflow-hidden border-border bg-card/40 backdrop-blur-md w-full mb-4">
            <div className="flex flex-col xl:flex-row items-center p-4 gap-4 relative z-10">
                {/* Header Section: Name & Actions */}
                <div className="flex flex-col items-start w-full xl:w-auto xl:min-w-[140px] shrink-0 gap-2">
                    <Skeleton className="h-7 w-32" />
                </div>

                {/* Combos Visual Section */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 w-full min-w-0">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex flex-col items-center p-3 rounded-xl bg-background/40 border border-border/40 relative">
                            {/* Combo Number Badge Placeholder */}
                            <Skeleton className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full" />

                            <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center my-0.5">
                                <Skeleton className="w-full h-full rounded-full" />
                            </div>

                            <div className="flex flex-col items-center gap-1 w-full mt-1">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex flex-row xl:flex-col gap-2 shrink-0 ml-auto xl:ml-4">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                </div>
            </div>
        </Card>
    );
}
