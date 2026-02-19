import { Link } from "wouter";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Search, Trophy } from "lucide-react";

type PlayerItem = {
    id: string;
    nickname: string;
    avatar: string | null;
    totalPoints: number;
    tournamentsPlayed?: number;
    top3Finishes?: number;
    platform?: string;
};

interface DesktopSlimPlayersListProps {
    players: PlayerItem[];
    isLoading: boolean;
    query: string;
    onSearchChange: (value: string) => void;
    selectedPlatform: string;
    onPlatformChange: (value: string) => void;
    sanitizeImageUrl: (url: string | null | undefined) => string | null;
}

export function DesktopSlimPlayersList({
    players,
    isLoading,
    query,
    onSearchChange,
    selectedPlatform,
    onPlatformChange,
    sanitizeImageUrl,
}: DesktopSlimPlayersListProps) {
    return (
        <div className="hidden md:flex flex-col space-y-4 h-full">
            {/* Controls Bar - Slim & Dense */}
            <div className="flex items-center gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 py-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cerca per nome..."
                        value={query}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 h-9 text-sm bg-muted/30 border-muted-foreground/20 focus-visible:ring-1"
                    />
                </div>
                <Select value={selectedPlatform} onValueChange={onPlatformChange}>
                    <SelectTrigger className="w-[180px] h-9 text-sm border-muted-foreground/20 bg-muted/30">
                        <SelectValue placeholder="Piattaforma" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="challengermode">Challengermode</SelectItem>
                        <SelectItem value="challonge">Challonge</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 15 }).map((_, i) => (
                        <div key={i} className="h-10 w-full bg-muted/30 animate-pulse rounded-md" />
                    ))}
                </div>
            ) : players.length === 0 ? (
                <Card className="p-8 flex flex-col items-center justify-center text-muted-foreground border-dashed">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    <p>Nessun giocatore trovato</p>
                </Card>
            ) : (
                <div className="rounded-md border border-border bg-card/50 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/50 hover:bg-muted/50">
                            <TableRow className="h-9 hover:bg-transparent border-b-border/60">
                                <TableHead className="w-[80px] text-xs font-semibold">Rank</TableHead>
                                <TableHead className="text-xs font-semibold">Giocatore</TableHead>
                                <TableHead className="w-[120px] text-xs font-semibold">Piattaforma</TableHead>
                                <TableHead className="w-[100px] text-right text-xs font-semibold">Tornei</TableHead>
                                <TableHead className="w-[100px] text-right text-xs font-semibold">Top 3</TableHead>
                                <TableHead className="w-[120px] text-right text-xs font-semibold">Punti Totali</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {players.map((player, index) => {
                                const sanitizedAvatar = sanitizeImageUrl(player.avatar);

                                return (
                                    <TableRow
                                        key={player.id}
                                        className="h-11 hover:bg-muted/50 transition-colors border-b-border/40 group cursor-pointer"
                                    >
                                        <TableCell className="font-mono text-xs text-muted-foreground font-medium pl-4">
                                            #{index + 1}
                                        </TableCell>

                                        <TableCell>
                                            <Link href={`/players/${encodeURIComponent(player.nickname)}`}>
                                                <a className="flex items-center gap-3 no-underline group-hover:text-primary transition-colors">
                                                    <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border/50">
                                                        {sanitizedAvatar ? (
                                                            <img
                                                                src={sanitizedAvatar}
                                                                alt={player.nickname}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <span className="text-[10px] text-muted-foreground font-medium">
                                                                {player.nickname.substring(0, 2).toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-sm truncate max-w-[180px]">
                                                        {player.nickname}
                                                    </span>
                                                </a>
                                            </Link>
                                        </TableCell>

                                        <TableCell>
                                            {player.platform && (
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={player.platform === 'challengermode' ? '/challengermode-logo.png' : '/challonge-logo.png'}
                                                        alt={player.platform === 'challengermode' ? 'Challengermode' : 'Challonge'}
                                                        className="w-4 h-4 object-contain opacity-80"
                                                    />
                                                    <span className="text-xs text-muted-foreground capitalize">
                                                        {player.platform === 'challengermode' ? 'Challenger' : 'Challonge'}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>

                                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                            {player.tournamentsPlayed || '-'}
                                        </TableCell>

                                        <TableCell className="text-right">
                                            {player.top3Finishes ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="font-mono text-sm">{player.top3Finishes}</span>
                                                    <Trophy className="h-3 w-3 text-amber-500/70" />
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground/50">-</span>
                                            )}
                                        </TableCell>

                                        <TableCell className="text-right pr-4">
                                            <span className="font-mono font-medium text-primary">
                                                {Math.floor(player.totalPoints).toLocaleString()}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
