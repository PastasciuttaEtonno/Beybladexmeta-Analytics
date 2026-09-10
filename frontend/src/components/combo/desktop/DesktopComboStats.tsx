import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Medal, Award, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComboStats } from "@/hooks/useComboDetails";

interface DesktopComboStatsProps {
    combo: ComboStats;
}

export function DesktopComboStatsSkeleton() {
    return (
        <div className="grid grid-cols-2 py-3 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/50">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-3">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-20 mx-auto" />
                            <Skeleton className="h-7 w-16 mx-auto" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export function DesktopComboStats({ combo }: DesktopComboStatsProps) {
    const stats = [
        {
            label: "Primi posti",
            value: combo.primiPosti || 0,
            icon: <Trophy className="w-5 h-5 text-rank-1" />,
            bg: "bg-rank-1/10",
            border: "border-rank-1/20",
            text: "text-rank-1",
        },
        {
            label: "Secondi posti",
            value: combo.secondiPosti || 0,
            icon: <Medal className="w-5 h-5 text-rank-2" />,
            bg: "bg-rank-2/10",
            border: "border-rank-2/20",
            text: "text-rank-2",
        },
        {
            label: "Terzi posti",
            value: combo.terziPosti || 0,
            icon: <Award className="w-5 h-5 text-rank-3" />,
            bg: "bg-rank-3/10",
            border: "border-rank-3/20",
            text: "text-rank-3",
        },
        {
            label: "Punteggio totale",
            value: combo.punteggioTotale.toLocaleString(),
            icon: <Star className="w-5 h-5 text-primary" />,
            bg: "bg-primary/10",
            border: "border-primary/20",
            text: "text-primary",
            isScore: true,
        },
    ];

    return (
        <div className="grid grid-cols-2 py-3 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
                <Card
                    key={stat.label}
                    className={`relative overflow-hidden transition-all duration-300 ${stat.border} bg-card/50 backdrop-blur-sm group`}
                >
                    <div className={`absolute inset-0 ${stat.bg} opacity-20 group-hover:opacity-30 transition-opacity`} />
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2 relative z-10">
                        <div className={`p-2 rounded-full ${stat.bg} bg-opacity-50 ring-1 ring-inset ${stat.border}`}>
                            {stat.icon}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                            <p className={`text-2xl font-black ${stat.text}`}>
                                {stat.value}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
