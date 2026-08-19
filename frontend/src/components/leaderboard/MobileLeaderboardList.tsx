import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComponentImage } from "@/components/ComponentImage";
import { Shield, Cog, Zap } from "lucide-react";

interface LeaderboardItem {
    [key: string]: any;
    punteggioTotale: number;
    primiPosti: number;
    secondiPosti: number;
    terziPosti: number;
}

interface MobileLeaderboardListProps {
    items: LeaderboardItem[];
    activeType: "blade" | "ratchet" | "bit";
    folder: string;
}

export function MobileLeaderboardList({ items, activeType, folder }: MobileLeaderboardListProps) {
    const getFallbackIcon = () => {
        switch (activeType) {
            case "blade": return <Shield className="w-6 h-6 text-muted-foreground" />;
            case "ratchet": return <Cog className="w-6 h-6 text-muted-foreground" />;
            case "bit": return <Zap className="w-6 h-6 text-muted-foreground" />;
            default: return <Shield className="w-6 h-6 text-muted-foreground" />;
        }
    };

    return (
        <div className="space-y-2 md:hidden">
            {items.map((row, index) => (
                <Card key={`${activeType}-${index}`} className="p-3 flex items-center gap-2">
                    <div className="w-10 text-center">
                        <Badge variant="secondary" className="text-xs">
                            {index + 1}
                        </Badge>
                    </div>
                    <div className="w-12 h-12 flex-shrink-0">
                        <ComponentImage
                            name={row[activeType]}
                            type={folder}
                            fallbackIcon={getFallbackIcon()}
                            testId={`mobile-leaderboard-img-${index}`}
                            className="w-full h-full bg-transparent"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{row[activeType]}</p>
                        <div className="mt-1 space-y-1">
                            <div className="flex">
                                <Badge variant="outline" className="text-xs text-purple-600 dark:text-purple-400 font-bold border-purple-500/30">
                                    Score: {Number(row.punteggioTotale).toLocaleString()}
                                </Badge>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 text-yellow-600 dark:text-yellow-400 bg-yellow-500/10">1st: {row.primiPosti}</Badge>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 text-zinc-500 dark:text-zinc-300 bg-zinc-500/10">2nd: {row.secondiPosti}</Badge>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 text-amber-700 dark:text-amber-500 bg-amber-500/10">3rd: {row.terziPosti}</Badge>
                            </div>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    );
}
