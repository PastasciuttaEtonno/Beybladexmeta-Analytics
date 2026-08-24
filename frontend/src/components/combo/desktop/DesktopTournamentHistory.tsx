import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Link } from "wouter";
import type { TournamentEntry } from "@/hooks/useComboDetails";

interface DesktopTournamentHistoryProps {
    tournaments: TournamentEntry[];
    loading: boolean;
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalTournaments: number;
}

export function DesktopTournamentHistory({
    tournaments,
    loading,
    currentPage,
    totalPages,
    onPageChange,
    totalTournaments,
}: DesktopTournamentHistoryProps) {

    const getPlacementBadge = (placement: number) => {
        if (placement === 1) return <Badge className="bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30 border-yellow-500/50">1st Place</Badge>;
        if (placement === 2) return <Badge className="bg-zinc-500/20 text-zinc-500 hover:bg-zinc-500/30 border-zinc-500/50">2nd Place</Badge>;
        if (placement === 3) return <Badge className="bg-amber-600/20 text-amber-600 hover:bg-amber-600/30 border-amber-600/50">3rd Place</Badge>;
        return <Badge variant="outline" className="text-muted-foreground">#{placement}</Badge>;
    };

    return (
        <Card className="border-border/50 bg-card/30 backdrop-blur-md">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-primary" />
                            Tornei recenti
                        </CardTitle>
                        <CardDescription>
                            Ultime apparizioni in {totalTournaments} tornei
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border border-border/50 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead>Torneo</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>Giocatore</TableHead>
                                <TableHead className="text-right">Posizione</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                        <TableCell className="text-right flex justify-end"><Skeleton className="h-6 w-20" /></TableCell>
                                    </TableRow>
                                ))
                            ) : tournaments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        Nessun torneo recente trovato.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                tournaments.map((t) => (
                                    <TableRow
                                        key={`${t.tournamentId}-${t.playerId}`}
                                        className="cursor-pointer hover:bg-muted/50 transition-colors group"
                                    >
                                        <TableCell className="font-medium">
                                            <Link href={`/tournaments/${encodeURIComponent(t.tournamentId)}`} asChild>
                                                <a className="hover:underline decoration-primary underline-offset-4 group-hover:text-primary transition-colors">
                                                    {t.tournamentName || t.tournament_name || `Tournament ${t.tournamentId}`}
                                                </a>
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {t.date ? format(new Date(t.date), 'MMM dd, yyyy') : 'Unknown'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            <Link href={`/player/${encodeURIComponent(t.playerId)}`} asChild>
                                                <a className="hover:text-foreground transition-colors">
                                                    {t.playerName}
                                                </a>
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {getPlacementBadge(t.placement)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
