import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { User, Pencil } from "lucide-react";
import { Link } from "wouter";

interface ComboForm {
    blade: string;
    assistBlade: string;
    ratchet: string;
    bit: string;
    lockChip: string;
}

interface StandingsPlayer {
    placement: string;
    memberId: string;
    username: string;
    avatarUrl: string | null;
    combos: ComboForm[];
    canEdit: boolean;
    isSelf: boolean;
}

interface DesktopTournamentStandingsProps {
    players: StandingsPlayer[];
    onPlayerClick: (player: StandingsPlayer) => void;
}

function formatComboText(combo: ComboForm): string {
    const parts = [
        combo.lockChip && combo.lockChip !== "None" ? combo.lockChip : "",
        combo.blade,
        combo.assistBlade && combo.assistBlade !== "None" ? combo.assistBlade : "",
        combo.ratchet && combo.ratchet !== "None" ? combo.ratchet : "",
        combo.bit,
    ].filter(Boolean);
    return parts.join(" · ");
}

function getPlacementBadge(placement: number) {
    if (placement === 1)
        return (
            <Badge className="bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30 border-yellow-500/50">
                1°
            </Badge>
        );
    if (placement === 2)
        return (
            <Badge className="bg-zinc-500/20 text-zinc-500 hover:bg-zinc-500/30 border-zinc-500/50">
                2°
            </Badge>
        );
    if (placement === 3)
        return (
            <Badge className="bg-amber-600/20 text-amber-600 hover:bg-amber-600/30 border-amber-600/50">
                3°
            </Badge>
        );
    if (placement === 4)
        return (
            <Badge className="bg-purple-500/20 text-purple-500 hover:bg-purple-500/30 border-purple-500/50">
                4°
            </Badge>
        );
    return (
        <Badge variant="outline" className="text-muted-foreground">
            #{placement}
        </Badge>
    );
}

export function DesktopTournamentStandings({
    players,
    onPlayerClick,
}: DesktopTournamentStandingsProps) {
    if (players.length === 0) {
        return (
            <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-md p-8 text-center">
                <p className="text-muted-foreground">Nessun dato di classifica disponibile.</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-md shadow-lg overflow-hidden">
            <div className="p-6 pb-4">
                <h2 className="text-xl font-semibold text-foreground">
                    Classifica completa
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    {players.length} partecipanti
                </p>
            </div>

            <div className="px-4 pb-4">
                <div className="rounded-md border border-border/50 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="w-16 text-center">#</TableHead>
                                <TableHead>Giocatore</TableHead>
                                <TableHead>Combo</TableHead>
                                <TableHead className="w-16 text-right" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {players.map((player) => {
                                const rank = parseInt(player.placement, 10);
                                const isTopFour = rank <= 4;

                                return (
                                    <TableRow
                                        key={player.memberId}
                                        className={`
                      transition-colors group
                      ${player.canEdit ? "cursor-pointer" : ""}
                      ${isTopFour ? "bg-primary/[0.03]" : ""}
                      ${player.isSelf ? "bg-primary/10" : ""}
                      hover:bg-muted/50
                    `}
                                        onClick={() => player.canEdit && onPlayerClick(player)}
                                    >
                                        {/* Placement */}
                                        <TableCell className="text-center">
                                            {getPlacementBadge(rank)}
                                        </TableCell>

                                        {/* Player */}
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                {player.avatarUrl ? (
                                                    <img
                                                        src={player.avatarUrl}
                                                        alt={player.username}
                                                        className="w-8 h-8 rounded-full object-cover border border-border/30"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border/30">
                                                        <User className="w-4 h-4 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <span className="font-medium text-sm text-foreground">
                                                    {player.username}
                                                </span>
                                                {player.isSelf && (
                                                    <Badge variant="secondary" className="text-[10px]">Tu</Badge>
                                                )}
                                            </div>
                                        </TableCell>

                                        {/* Combo */}
                                        <TableCell>
                                            {player.combos.length > 0 ? (
                                                <div className="space-y-0.5">
                                                    {player.combos.map((combo, idx) => (
                                                        <p
                                                            key={idx}
                                                            className="text-xs text-muted-foreground truncate max-w-[320px]"
                                                            title={formatComboText(combo)}
                                                        >
                                                            {formatComboText(combo)}
                                                        </p>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic">—</span>
                                            )}
                                        </TableCell>

                                        {/* Edit indicator */}
                                        <TableCell className="text-right">
                                            {player.canEdit && (
                                                <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity inline" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
