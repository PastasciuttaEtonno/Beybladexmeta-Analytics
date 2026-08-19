import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Calendar, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface DesktopTournamentHeaderProps {
    name: string;
    state: string;
    platform: "challengermode" | "challonge";
    startedAt: string | null;
    contactUrl: string | null;
    totalPlayers: number;
    isOffSeason: boolean;
    hasCombos?: boolean;
    isAdmin: boolean;
    resetting: boolean;
    onResetCombos: () => void;
    onSyncGhost: () => void;
}

export function DesktopTournamentHeader({
    name,
    state,
    platform,
    startedAt,
    contactUrl,
    totalPlayers,
    isOffSeason,
    hasCombos,
    isAdmin,
    resetting,
    onResetCombos,
    onSyncGhost,
}: DesktopTournamentHeaderProps) {
    const formattedDate = startedAt
        ? format(new Date(startedAt), "dd MMMM yyyy")
        : null;

    return (
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl p-8 shadow-2xl">
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

            <div className="relative z-10 space-y-5">
                {/* Top Row: Back button */}
                <Link href="/tournaments">
                    <a className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors no-underline">
                        <ArrowLeft className="w-4 h-4" />
                        Torna ai Tornei
                    </a>
                </Link>

                {/* Main Info Row */}
                <div className="flex items-start justify-between gap-8">
                    <div className="space-y-2 min-w-0 flex-1">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground truncate">
                            {name || "Dettagli torneo"}
                        </h1>
                        <div className="flex items-center gap-3 flex-wrap">
                            <Badge
                                variant="secondary"
                                className={
                                    platform === "challonge"
                                        ? "bg-orange-500/20 text-orange-500 border-orange-500/50"
                                        : "bg-blue-500/20 text-blue-400 border-blue-500/50"
                                }
                            >
                                {platform === "challonge" ? "Challonge" : "Challengermode"}
                            </Badge>
                            {formattedDate && (
                                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {formattedDate}
                                </span>
                            )}
                            {isOffSeason && (
                                <Badge variant="secondary" className="text-xs">
                                    Off Season
                                </Badge>
                            )}
                            {contactUrl && (
                                <a
                                    href={contactUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline no-underline"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Info
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="flex gap-8 divide-x divide-border/50 shrink-0">
                        <div className="px-4 text-center">
                            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                Giocatori
                            </p>
                            <p className="text-3xl font-mono font-bold text-primary mt-1 flex items-center justify-center gap-2">
                                <Users className="w-5 h-5 text-muted-foreground" />
                                {totalPlayers}
                            </p>
                        </div>
                        <div className="px-4 text-center pl-8">
                            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                Stato
                            </p>
                            <p className="text-lg font-semibold text-foreground mt-2 capitalize">
                                {state || "—"}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Admin Actions */}
                {isAdmin && (
                    <div className="flex items-center gap-3 pt-2 border-t border-border/30">
                        {hasCombos && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={onResetCombos}
                                disabled={resetting}
                            >
                                {resetting ? "Reset..." : "Azzera combo torneo"}
                            </Button>
                        )}
                        {platform === "challonge" && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onSyncGhost}
                                disabled={resetting}
                            >
                                {resetting ? "Syncing..." : "Sync Giocatori Fantasma"}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
