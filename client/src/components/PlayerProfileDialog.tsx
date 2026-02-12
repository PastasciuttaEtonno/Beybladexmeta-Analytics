import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, Award } from "lucide-react";

type PlatformStat = {
    platform: string;
    totalPoints: number;
    tournamentsPlayed: number;
    tournamentsWon: number;
    avatar: string | null;
};

interface PlayerProfileDialogProps {
    nickname: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PlayerProfileDialog({ nickname, open, onOpenChange }: PlayerProfileDialogProps) {
    const { data: platformStats, isLoading } = useQuery<PlatformStat[]>({
        enabled: open && !!nickname,
        queryKey: ["/api/stats/player", nickname],
        queryFn: async () => {
            if (!nickname) throw new Error("Nickname is required");
            const resp = await fetch(`/api/stats/player/${encodeURIComponent(nickname)}`);
            if (!resp.ok) throw new Error("Failed to fetch player profile");
            return resp.json();
        },
    });

    const totalPoints = platformStats?.reduce((sum, stat) => sum + stat.totalPoints, 0) ?? 0;
    const totalTournaments = platformStats?.reduce((sum, stat) => sum + stat.tournamentsPlayed, 0) ?? 0;
    const totalWins = platformStats?.reduce((sum, stat) => sum + stat.tournamentsWon, 0) ?? 0;
    const avatar = platformStats?.[0]?.avatar;

    const getPlatformLabel = (platform: string) => {
        if (platform === "challengermode") return "Challengermode";
        if (platform === "challonge") return "Challonge";
        return platform;
    };

    const getPlatformColor = (platform: string) => {
        if (platform === "challengermode") return "bg-blue-500/10 border-blue-500/20";
        if (platform === "challonge") return "bg-purple-500/10 border-purple-500/20";
        return "bg-muted";
    };

    // Sanitize URL to prevent XSS - only allow http/https protocols
    const sanitizeImageUrl = (url: string | null | undefined): string | null => {
        if (!url) return null;
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return url;
            }
            return null;
        } catch {
            return null;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="sr-only">Profilo Giocatore</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="space-y-4">
                        <div className="h-24 bg-muted/30 animate-pulse rounded-lg" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
                            <div className="h-48 bg-muted/30 animate-pulse rounded-lg" />
                        </div>
                    </div>
                ) : !platformStats || platformStats.length === 0 ? (
                    <Card className="p-6 text-center">
                        <p className="text-muted-foreground">Nessun dato disponibile</p>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {/* Header Section */}
                        <div className="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b">
                            <div className="w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                                {(() => {
                                    const sanitizedAvatar = sanitizeImageUrl(avatar);
                                    return sanitizedAvatar ? (
                                        <img src={sanitizedAvatar} alt={`Avatar di ${nickname}`} className="w-20 h-20 object-cover" />
                                    ) : (
                                        <span className="text-2xl text-muted-foreground">👤</span>
                                    );
                                })()}
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h2 className="text-2xl font-bold">{nickname}</h2>
                                <div className="flex flex-wrap gap-2 mt-2 justify-center sm:justify-start">
                                    <Badge variant="secondary" className="text-sm">
                                        <Trophy className="w-3 h-3 mr-1" />
                                        {totalPoints.toFixed(0)} Punti
                                    </Badge>
                                    <Badge variant="outline" className="text-sm">
                                        <Target className="w-3 h-3 mr-1" />
                                        {totalTournaments} Tornei
                                    </Badge>
                                    <Badge variant="outline" className="text-sm">
                                        <Award className="w-3 h-3 mr-1" />
                                        {totalWins} Vittorie
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Platform Breakdown */}
                        <div>
                            <h3 className="text-lg font-semibold mb-3">Statistiche per Piattaforma</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {platformStats.map((stat) => {
                                    return (
                                        <Card key={stat.platform} className={`border-2 ${getPlatformColor(stat.platform)}`}>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-base flex items-center justify-between">
                                                    <span>{getPlatformLabel(stat.platform)}</span>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {stat.totalPoints.toFixed(0)} pt
                                                    </Badge>
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-2">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground">Tornei Giocati</span>
                                                    <span className="font-semibold">{stat.tournamentsPlayed}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground">Vittorie</span>
                                                    <span className="font-semibold">{stat.tournamentsWon}</span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Show message if only one platform */}
                        {platformStats.length === 1 && (
                            <p className="text-sm text-muted-foreground text-center">
                                Questo giocatore ha dati solo su {getPlatformLabel(platformStats[0].platform)}
                            </p>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
