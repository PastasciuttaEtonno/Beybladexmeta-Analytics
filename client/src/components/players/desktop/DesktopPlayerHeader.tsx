
import { Copy } from "lucide-react";

interface DesktopPlayerHeaderProps {
    nickname: string;
    avatar: string | null;
    totalPoints: number;
    tournamentsPlayed: number;
    sanitizeImageUrl: (url: string | null | undefined) => string | null;
}

export function DesktopPlayerHeader({
    nickname,
    avatar,
    totalPoints,
    tournamentsPlayed,
    sanitizeImageUrl,
}: DesktopPlayerHeaderProps) {
    const sanitizedAvatar = sanitizeImageUrl(avatar);

    return (
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-6 shadow-2xl">
            {/* Background Glow Effect */}
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

            <div className="relative flex items-center justify-between z-10">
                <div className="flex items-center gap-6">
                    {/* Avatar */}
                    <div className="relative h-24 w-24 rounded-full overflow-hidden border-2 border-border/20 shadow-lg bg-background/50">
                        {sanitizedAvatar ? (
                            <img
                                src={sanitizedAvatar}
                                alt={nickname}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted">
                                <span className="text-2xl font-bold text-muted-foreground">
                                    {nickname.substring(0, 2).toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Player Info */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">
                                {nickname}
                            </h1>
                            {/* Placeholder for Rank Badge if API supported it */}
                            {/* <Badge variant="secondary" className="text-sm font-medium">
                                #5 Global
                            </Badge> */}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground/80">
                            <span>ID: {nickname}</span>
                            {/* Copy ID Button Concept */}
                            <button
                                className="hover:text-primary transition-colors"
                                onClick={() => navigator.clipboard.writeText(nickname)}
                                title="Copia Nickname"
                            >
                                <Copy className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* High Level Stats */}
                <div className="flex gap-8 divide-x divide-white/10">
                    <div className="px-4 text-center">
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            Punti Totali
                        </p>
                        <p className="text-3xl font-mono font-bold text-primary mt-1">
                            {totalPoints.toLocaleString()}
                        </p>
                    </div>
                    <div className="px-4 text-center pl-8">
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            Tornei
                        </p>
                        <p className="text-3xl font-mono font-bold text-foreground mt-1">
                            {tournamentsPlayed}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
