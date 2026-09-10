
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ComponentImage } from "@/components/ComponentImage";
import { Shield, Cog, Zap, Trophy, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardItem {
    [key: string]: any;
    punteggioTotale: number;
    primiPosti: number;
    secondiPosti: number;
    terziPosti: number;
}

interface DesktopLeaderboardTableProps {
    items: LeaderboardItem[];
    activeType: "blade" | "ratchet" | "bit";
    folder: string;
}

export function DesktopLeaderboardTable({ items, activeType, folder }: DesktopLeaderboardTableProps) {
    const getFallbackIcon = () => {
        switch (activeType) {
            case "blade": return <Shield className="w-8 h-8 text-muted-foreground" />;
            case "ratchet": return <Cog className="w-8 h-8 text-muted-foreground" />;
            case "bit": return <Zap className="w-8 h-8 text-muted-foreground" />;
            default: return <Shield className="w-8 h-8 text-muted-foreground" />;
        }
    };

    const getRankIcon = (index: number) => {
        if (index === 0) return <Trophy className="w-5 h-5 text-rank-1 fill-rank-1/20" />; // Gold
        if (index === 1) return <Medal className="w-5 h-5 text-rank-2 fill-rank-2/20" />; // Silver
        if (index === 2) return <Medal className="w-5 h-5 text-rank-3 fill-rank-3/20" />; // Bronze
        return <span className="font-mono text-muted-foreground font-medium w-5 text-center inline-block">{index + 1}</span>;
    };

    const getRowStyle = (index: number) => {
        if (index === 0) return "bg-rank-1/5 hover:bg-rank-1/10 border-l-2 border-l-rank-1";
        if (index === 1) return "bg-rank-2/5 hover:bg-rank-2/10 border-l-2 border-l-rank-2";
        if (index === 2) return "bg-rank-3/5 hover:bg-rank-3/10 border-l-2 border-l-rank-3";
        return "hover:bg-muted/50 border-l-2 border-l-transparent";
    };

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader className="bg-background/80 backdrop-blur sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="w-[60px] text-center text-foreground/80">Rank</TableHead>
                        <TableHead className="w-[80px] text-foreground/80">Visual</TableHead>
                        <TableHead className="text-foreground/80">Componente</TableHead>
                        <TableHead className="text-right text-foreground/80">Punteggio</TableHead>
                        <TableHead className="text-right text-xs text-rank-1 ">1st</TableHead>
                        <TableHead className="text-right text-xs text-rank-2">2nd</TableHead>
                        <TableHead className="text-right text-xs text-rank-3">3rd</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((row, index) => (
                        <TableRow key={`${activeType}-${index}`} className={cn("transition-colors", getRowStyle(index))}>
                            <TableCell className="text-center font-medium">
                                <div className="flex justify-center items-center">
                                    {getRankIcon(index)}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="w-12 h-12">
                                    <ComponentImage
                                        name={row[activeType]}
                                        type={folder}
                                        fallbackIcon={getFallbackIcon()}
                                        testId={`desktop-leaderboard-img-${index}`}
                                        className="w-full h-full bg-transparent p-1"
                                    />
                                </div>
                            </TableCell>
                            <TableCell>
                                <span className="text-base text-foreground">{row[activeType]}</span>
                            </TableCell>
                            <TableCell className="text-right">
                                <span className="font-mono font-bold text-primary text-lg">
                                    {Number(row.punteggioTotale).toLocaleString()}
                                </span>
                            </TableCell>
                            <TableCell className={cn("text-right font-mono font-bold", index < 3 ? "text-rank-1" : "text-foreground")}>
                                {row.primiPosti}
                            </TableCell>
                            <TableCell className={cn("text-right font-mono font-bold", index < 3 ? "text-rank-2" : "text-foreground")}>
                                {row.secondiPosti}
                            </TableCell>
                            <TableCell className={cn("text-right font-mono font-bold", index < 3 ? "text-rank-3" : "text-foreground")}>
                                {row.terziPosti}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
