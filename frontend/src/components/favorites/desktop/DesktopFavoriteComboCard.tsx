import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Trash2 } from "lucide-react";
import { DesktopComponentImage } from "@/components/analytics/desktop/DesktopComponentImage";
import type { FavoriteCombo } from "@/types/api";

interface DesktopFavoriteComboCardProps {
    combo: FavoriteCombo;
    onDelete: (id: string) => void;
    onView: (combo: FavoriteCombo) => void;
}

export function DesktopFavoriteComboCard({ combo, onDelete, onView }: DesktopFavoriteComboCardProps) {    // Helper per verificare se un componente è valido (non None, non null, non "-")
    const isValidPart = (part: string | null | undefined) => {
        return part && part.toLowerCase() !== "none" && part !== "-";
    };

    // Costruzione dinamica del sottotitolo (Assist / Ratchet / Bit)
    const subtitleParts = [
        isValidPart(combo.assistBlade) ? combo.assistBlade : null,
        isValidPart(combo.ratchet) ? combo.ratchet : null,
        isValidPart(combo.bit) ? combo.bit : null
    ].filter(Boolean);

    // Costruzione del Titolo (LockChip + Blade)
    const titleText = isValidPart(combo.lockChip)
        ? `${combo.lockChip}${combo.blade}` // Concatena senza spazi
        : combo.blade;

    return (
        <Card
            className="relative overflow-hidden border-border bg-card/40 backdrop-blur-md cursor-pointer h-full flex flex-col hover:bg-muted/20 hover:border-primary/30 transition-colors duration-200"
            onClick={() => onView(combo)}
        >
            <div className="p-4 flex-1 flex flex-col items-center justify-center relative z-10">

                {/* Visual Section */}
                <div className="flex items-center justify-center gap-2 h-28 w-full relative mb-2">
                    {/* Left: Blade */}
                    <div className="relative z-20 shrink-0">
                        <DesktopComponentImage folder="blades" name={combo.blade} className="w-20 h-20 drop-shadow-md filter" />
                    </div>

                    {/* Right: Stacked Ratchet & Bit */}
                    <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                        {isValidPart(combo.ratchet) && (
                            <DesktopComponentImage folder="ratchets" name={combo.ratchet} className="w-12 h-12 drop-shadow-sm z-10" />
                        )}
                        {isValidPart(combo.bit) && (
                            <DesktopComponentImage folder="bits" name={combo.bit} className="w-12 h-12 drop-shadow-sm z-20" />
                        )}
                    </div>
                </div>

                {/* Texts */}
                <div className="text-center w-full mt-2">
                    {/* Titolo modificato: Chip+Blade */}
                    <p className="font-bold text-sm text-foreground truncate max-w-full px-2" title={titleText}>
                        {titleText}
                    </p>

                    {/* Sottotitolo Dinamico */}
                    {subtitleParts.length > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate max-w-full px-2">
                            {subtitleParts.join(" / ")}
                        </p>
                    )}
                </div>
            </div>

            {/* Footer Buttons */}
            <div className="border-t border-border bg-muted/20 p-2 flex items-center justify-between gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-8 text-xs hover:bg-background/50 hover:text-primary"
                    onClick={(e) => {
                        e.stopPropagation();
                        onView(combo);
                    }}
                >
                    <Eye className="w-3 h-3 mr-1.5" />
                    Details
                </Button>
                <div className="w-px h-4 bg-border/50" />
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 h-8 text-xs hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(combo.id);
                    }}
                >
                    <Trash2 className="w-3 h-3 mr-1.5" />
                    Delete
                </Button>
            </div>
        </Card>
    );
}