import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DesktopFavoriteComboCardSkeleton() {
    return (
        <Card className="relative overflow-hidden border-border bg-card/40 backdrop-blur-md h-full flex flex-col">
            <div className="p-4 flex-1 flex flex-col items-center justify-center relative z-10">

                {/* Visual Section */}
                <div className="flex items-center justify-center h-28 w-full relative mb-2">
                    {/* Left Flank */}
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-0 scale-75">
                        <Skeleton className="w-16 h-16 rounded-full" />
                    </div>

                    {/* Center: Blade (Hero) */}
                    <div className="relative z-20">
                        <Skeleton className="w-24 h-24 rounded-full" />
                    </div>

                    {/* Right Flank */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 z-0 scale-75">
                        <Skeleton className="w-16 h-16 rounded-full" />
                    </div>
                </div>

                {/* Texts */}
                <div className="text-center w-full mt-2 space-y-2 flex flex-col items-center">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>

            {/* Footer Buttons */}
            <div className="border-t border-border bg-muted/20 p-2 flex items-center justify-between gap-2">
                <Skeleton className="flex-1 h-8 rounded-md" />
                <div className="w-px h-4 bg-border/50" />
                <Skeleton className="flex-1 h-8 rounded-md" />
            </div>
        </Card>
    );
}
