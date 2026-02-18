import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal, Award, Star } from "lucide-react";
import type { ComboStats } from "@/hooks/useComboDetails";

interface DesktopComboStatsProps {
    combo: ComboStats;
}

export function DesktopComboStats({ combo }: DesktopComboStatsProps) {
    const stats = [
        {
            label: "1st Place",
            value: combo.primiPosti || 0,
            icon: <Trophy className="w-5 h-5 text-yellow-500" />,
            bg: "bg-yellow-500/10",
            border: "border-yellow-500/20",
            text: "text-yellow-500",
        },
        {
            label: "2nd Place",
            value: combo.secondiPosti || 0,
            icon: <Medal className="w-5 h-5 text-zinc-400" />,
            bg: "bg-zinc-500/10",
            border: "border-zinc-500/20",
            text: "text-zinc-400",
        },
        {
            label: "3rd Place",
            value: combo.terziPosti || 0,
            icon: <Award className="w-5 h-5 text-amber-600" />,
            bg: "bg-amber-600/10",
            border: "border-amber-600/20",
            text: "text-amber-600",
        },
        {
            label: "Total Score",
            value: combo.punteggioTotale.toLocaleString(),
            icon: <Star className="w-5 h-5 text-primary" />,
            bg: "bg-primary/10",
            border: "border-primary/20",
            text: "text-primary",
            isScore: true,
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
                <Card
                    key={stat.label}
                    className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${stat.border} bg-card/50 backdrop-blur-sm group`}
                >
                    <div className={`absolute inset-0 ${stat.bg} opacity-20 group-hover:opacity-30 transition-opacity`} />
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2 relative z-10">
                        <div className={`p-2 rounded-full ${stat.bg} bg-opacity-50 ring-1 ring-inset ${stat.border}`}>
                            {stat.icon}
                        </div>
                        <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
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
