import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, User, Pencil } from "lucide-react";

// Matches ComboForm from TournamentDetail
interface ComboForm {
    blade: string;
    assistBlade: string;
    ratchet: string;
    bit: string;
    lockChip: string;
}

interface PodiumPlayer {
    placement: string;
    memberId: string;
    username: string;
    avatarUrl: string | null;
    combos: ComboForm[];
    canEdit: boolean;
    isSelf: boolean;
}

interface DesktopTournamentPodiumProps {
    players: PodiumPlayer[];
    onPlayerClick: (player: PodiumPlayer) => void;
    renderComboImage: (folder: string, name: string) => React.ReactNode;
}

const RANK_CONFIG: Record<number, { icon: React.ReactNode; glow: string; border: string; label: string }> = {
    1: {
        icon: <Trophy className="w-8 h-8 text-yellow-500" />,
        glow: "from-yellow-500/20 via-transparent to-transparent",
        border: "border-yellow-500/40",
        label: "1° Posto",
    },
    2: {
        icon: <Medal className="w-7 h-7 text-slate-400" />,
        glow: "from-slate-400/15 via-transparent to-transparent",
        border: "border-slate-400/30",
        label: "2° Posto",
    },
    3: {
        icon: <Award className="w-7 h-7 text-amber-700" />,
        glow: "from-amber-700/15 via-transparent to-transparent",
        border: "border-amber-700/30",
        label: "3° Posto",
    },
    4: {
        icon: <span className="text-lg font-bold text-muted-foreground">#4</span>,
        glow: "from-muted/30 via-transparent to-transparent",
        border: "border-border/50",
        label: "4° Posto",
    },
};

// Simplified combo display for the podium
function formatComboShort(combo: ComboForm): string {
    const parts = [
        combo.lockChip && combo.lockChip !== "None" ? combo.lockChip : "",
        combo.blade,
        combo.assistBlade && combo.assistBlade !== "None" ? combo.assistBlade : "",
        combo.ratchet && combo.ratchet !== "None" ? combo.ratchet : "",
        combo.bit,
    ].filter(Boolean);
    return parts.join(" · ");
}

export function DesktopTournamentPodium({
    players,
    onPlayerClick,
    renderComboImage,
}: DesktopTournamentPodiumProps) {
    if (players.length === 0) return null;

    return (
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/30 backdrop-blur-md p-8 shadow-lg">
            <h2 className="text-2xl font-semibold text-foreground mb-8 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-primary" />
                Podio
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {players.map((player) => {
                    const rank = parseInt(player.placement, 10);
                    const config = RANK_CONFIG[rank] || RANK_CONFIG[4];

                    return (
                        <div
                            key={player.memberId}
                            onClick={() => player.canEdit && onPlayerClick(player)}
                            className={`
                relative group rounded-xl border ${config.border} 
                bg-gradient-to-br ${config.glow} bg-card/20
                p-6 transition-all duration-200
                ${player.canEdit ? "cursor-pointer hover:shadow-lg hover:scale-[1.02] hover:border-primary/40" : ""}
                ${player.isSelf ? "ring-2 ring-primary/30" : ""}
              `}
                        >
                            {/* Rank Badge */}
                            <div className="flex items-center justify-between mb-5">
                                <Badge
                                    variant="secondary"
                                    className="text-sm font-semibold px-3 py-1"
                                >
                                    {config.label}
                                </Badge>
                                <div className="flex items-center gap-1.5">
                                    {config.icon}
                                    {player.canEdit && (
                                        <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </div>
                            </div>

                            {/* Player Info */}
                            <div className="flex items-center gap-4 mb-5">
                                {player.avatarUrl ? (
                                    <img
                                        src={player.avatarUrl}
                                        alt={player.username}
                                        className="w-16 h-16 rounded-full object-cover border-2 border-border/30 shadow-md"
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center border-2 border-border/30">
                                        <User className="w-7 h-7 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="font-semibold text-lg text-foreground truncate">
                                        {player.username}
                                    </p>
                                    {player.isSelf && (
                                        <span className="text-sm text-primary font-medium">Tu</span>
                                    )}
                                </div>
                            </div>

                            {/* Combos */}
                            {player.combos.length > 0 ? (
                                <div className="space-y-4 pt-2 border-t border-border/20">
                                    {player.combos.map((combo, idx) => (
                                        <div key={idx} className="space-y-2">
                                            <p className="text-xs font-medium text-muted-foreground truncate" title={formatComboShort(combo)}>
                                                {formatComboShort(combo)}
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {combo.lockChip && combo.lockChip !== "None" && (
                                                    <div className="w-12 h-12">{renderComboImage("chips", combo.lockChip)}</div>
                                                )}
                                                <div className="w-12 h-12">{renderComboImage("blades", combo.blade)}</div>
                                                {combo.assistBlade && combo.assistBlade !== "None" && (
                                                    <div className="w-12 h-12">{renderComboImage("assist-blades", combo.assistBlade)}</div>
                                                )}
                                                {combo.ratchet && combo.ratchet !== "None" && (
                                                    <div className="w-12 h-12">{renderComboImage("ratchets", combo.ratchet)}</div>
                                                )}
                                                <div className="w-12 h-12">{renderComboImage("bits", combo.bit)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground italic pt-2">
                                    Nessuna combo registrata
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
