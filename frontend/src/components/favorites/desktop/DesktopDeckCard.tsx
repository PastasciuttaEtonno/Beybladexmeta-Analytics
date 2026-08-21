import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, Trophy } from "lucide-react";
import { DesktopComponentImage } from "@/components/analytics/desktop/DesktopComponentImage";
import { useTheme } from "@/contexts/ThemeProvider";

interface DeckCombo {
    id: string;
    blade: string;
    ratchet: string;
    bit: string;
    assistBlade?: string | null;
    lockChip?: string | null;
}

interface DesktopDeckCardProps {
    deck: {
        id: string;
        name: string;
        combos: DeckCombo[];
    };
    onDelete: (id: string) => void;
    // placeholder for future edit functionality
    onEdit?: (id: string) => void;
}

export function DesktopDeckCard({ deck, onDelete, onEdit }: DesktopDeckCardProps) {
    const { theme } = useTheme();

    return (
        <Card className="group relative overflow-hidden border-border bg-card/40 backdrop-blur-md hover:border-primary/20 transition-all duration-300 w-full mb-4">
            {/* Background Gradient/Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <div className="flex flex-col xl:flex-row items-center p-4 gap-4 relative z-10">
                {/* Header Section: Name & Actions */}
                <div className="flex flex-col items-start w-full xl:w-auto xl:min-w-[140px] shrink-0 gap-2">
                    <h3 className="text-xl font-bold tracking-tight text-foreground truncate max-w-[180px]" title={deck.name}>
                        {deck.name}
                    </h3>
                </div>

                {/* Combos Visual Section */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 w-full min-w-0">
                    {deck.combos.map((combo, index) => (
                        <div key={combo.id || index} className="flex flex-col items-center p-3 rounded-xl bg-background/40 border border-border/40 relative group/combo hover:bg-background/60 transition-colors">

                            {/* Combo Number Badge */}
                            <div className="absolute top-1.5 left-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                                {index + 1}
                            </div>

                            <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center my-0.5">
                                <DesktopComponentImage folder="blades" name={combo.blade} className="w-full h-full object-contain filter drop-shadow-md transition-transform group-hover/combo:scale-105 duration-300" />
                            </div>

                            <div className="flex flex-col items-center gap-0.5 w-full mt-1">
                                <p className="text-[10px] sm:text-xs font-bold text-foreground truncate max-w-full text-center" title={combo.blade}>
                                    {combo.blade}
                                </p>
                                <div className="flex items-center gap-1 text-[9px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-full">
                                    <span className="truncate max-w-[40px]" title={combo.ratchet}>{combo.ratchet}</span>
                                    <span className="text-border">|</span>
                                    <span className="truncate max-w-[40px]" title={combo.bit}>{combo.bit}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {/* Fill empty slots if less than 3 combos */}
                    {[...Array(3 - deck.combos.length)].map((_, i) => (
                        <div key={`empty-${i}`} className="flex flex-col items-center justify-center p-3 rounded-xl bg-muted/10 border border-dashed border-border/40 min-h-[140px]">
                            <span className="text-xs text-muted-foreground/40 font-medium">Empty Slot</span>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex flex-row xl:flex-col gap-2 shrink-0 ml-auto xl:ml-4">
                    {onEdit && (
                        <Button variant="ghost" size="icon" onClick={() => onEdit(deck.id)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                            <Edit2 className="w-4 h-4" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => onDelete(deck.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </Card>
    );
}
