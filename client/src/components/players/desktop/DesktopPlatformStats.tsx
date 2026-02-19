import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Trophy, Medal, Award } from "lucide-react";

interface PlatformStat {
    platform: string;
    totalPoints: number;
    tournamentsPlayed: number;
    top3Finishes: number;
}

interface DesktopPlatformStatsProps {
    platformStats: PlatformStat[];
}

export function DesktopPlatformStats({ platformStats }: DesktopPlatformStatsProps) {
    const getStats = (platformName: string) => {
        return platformStats.find(s => s.platform.toLowerCase() === platformName.toLowerCase()) || {
            platform: platformName,
            totalPoints: 0,
            tournamentsPlayed: 0,
            top3Finishes: 0
        };
    };

    const cmStats = getStats('challengermode');
    const challongeStats = getStats('challonge');

    const StatRow = ({ label, value, icon: Icon, colorClass }: { label: string, value: string | number, icon: any, colorClass: string }) => (
        <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 hover:bg-muted/20 px-2 rounded-sm transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className={`w-4 h-4 ${colorClass}`} />
                <span className="text-sm font-medium">{label}</span>
            </div>
            <span className="font-mono font-bold text-foreground">{value}</span>
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Challengermode Card */}
            <Card className="border-t-4 border-t-orange-500 bg-card/60 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <img src="/challengermode-logo.png" alt="CM" className="w-6 h-6 object-contain" />
                            Challengermode
                        </CardTitle>
                        {cmStats.tournamentsPlayed > 0 && (
                            <span className="text-xs font-mono text-orange-500 bg-orange-500/10 px-2 py-1 rounded-full">
                                ACTIVE
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-1">
                    <StatRow label="Punti Totali" value={cmStats.totalPoints.toLocaleString()} icon={Trophy} colorClass="text-yellow-500" />
                    <StatRow label="Tornei Giocati" value={cmStats.tournamentsPlayed} icon={Award} colorClass="text-blue-500" />
                    <StatRow label="Top 3" value={cmStats.top3Finishes} icon={Medal} colorClass="text-amber-600" />
                </CardContent>
            </Card>

            {/* Challonge Card */}
            <Card className="border-t-4 border-t-[#FF914D] bg-card/60 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <img src="/challonge-logo.png" alt="Challonge" className="w-6 h-6 object-contain" />
                            Challonge
                        </CardTitle>
                        {challongeStats.tournamentsPlayed > 0 && (
                            <span className="text-xs font-mono text-[#FF914D] bg-[#FF914D]/10 px-2 py-1 rounded-full">
                                ACTIVE
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-1">
                    <StatRow label="Punti Totali" value={challongeStats.totalPoints.toLocaleString()} icon={Trophy} colorClass="text-yellow-500" />
                    <StatRow label="Tornei Giocati" value={challongeStats.tournamentsPlayed} icon={Award} colorClass="text-blue-500" />
                    <StatRow label="Top 3" value={challongeStats.top3Finishes} icon={Medal} colorClass="text-amber-600" />
                </CardContent>
            </Card>
        </div>
    );
}
