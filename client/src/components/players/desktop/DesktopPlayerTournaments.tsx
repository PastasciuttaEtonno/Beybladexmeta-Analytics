import { Link } from "wouter";
import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

interface Tournament {
    tournamentId: string;
    date: string | null;
    name?: string | null;
    bestPlacement: number | null;
    totalPoints: number;
    comboCount: number;
    platform: string;
}

interface DesktopPlayerTournamentsProps {
    tournaments: Tournament[];
    isLoading: boolean;
}

export function DesktopPlayerTournaments({ tournaments, isLoading }: DesktopPlayerTournamentsProps) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 w-full bg-muted/30 animate-pulse rounded" />
                ))}
            </div>
        );
    }

    if (!tournaments || tournaments.length === 0) {
        return <p className="text-muted-foreground text-center py-8">Nessun torneo trovato</p>;
    }

    const getPlacementBadge = (placement: number | null) => {
        if (placement === null) return <span className="text-muted-foreground">-</span>;
        if (placement === 1) return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white w-6 h-6 p-0 flex items-center justify-center">1</Badge>;
        if (placement === 2) return <Badge className="bg-gray-400 hover:bg-gray-500 text-white w-6 h-6 p-0 flex items-center justify-center">2</Badge>;
        if (placement === 3) return <Badge className="bg-amber-600 hover:bg-amber-700 text-white w-6 h-6 p-0 flex items-center justify-center">3</Badge>;
        return <span className="font-mono text-muted-foreground">#{placement}</span>;
    };

    return (
        <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
            <div className="bg-muted/30 px-6 py-4 border-b border-border">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-primary" />
                    Storico Tornei
                </h3>
            </div>
            <Table>
                <TableHeader className="bg-muted/10">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[120px]">Data</TableHead>
                        <TableHead>Torneo</TableHead>
                        <TableHead className="w-[140px]">Piattaforma</TableHead>
                        <TableHead className="w-[100px] text-center">Piazzamento</TableHead>
                        <TableHead className="w-[100px] text-right">Punti</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {tournaments.map((t) => (
                        <TableRow key={t.tournamentId} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {t.date ? format(new Date(t.date), 'dd MMM yyyy') : '-'}
                            </TableCell>
                            <TableCell>
                                <Link href={`/tournaments/${encodeURIComponent(t.tournamentId)}`}>
                                    <a className="font-medium hover:text-primary transition-colors hover:underline">
                                        {t.name || `Torneo ${t.tournamentId}`}
                                    </a>
                                </Link>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <img
                                        src={t.platform === 'challengermode' ? '/challengermode-logo.png' : '/challonge-logo.png'}
                                        alt={t.platform}
                                        className="w-4 h-4 object-contain opacity-70"
                                    />
                                    <span className="text-xs text-muted-foreground capitalize">
                                        {t.platform === 'challengermode' ? 'Challenger' : 'Challonge'}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="text-center">
                                <div className="flex justify-center">
                                    {getPlacementBadge(t.bestPlacement)}
                                </div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-primary">
                                +{t.totalPoints}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
