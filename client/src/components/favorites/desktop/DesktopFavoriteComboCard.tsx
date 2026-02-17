import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Trash2 } from "lucide-react";
import { DesktopComponentImage } from "@/components/analytics/desktop/DesktopComponentImage";
import type { FavoriteCombo } from "@shared/schema";

interface DesktopFavoriteComboCardProps {
    combo: FavoriteCombo;
    onDelete: (id: string) => void;
    onView: (combo: FavoriteCombo) => void;
}

export function DesktopFavoriteComboCard({ combo, onDelete, onView }: DesktopFavoriteComboCardProps) {

    // Helper per verificare se un componente è valido (non None, non null, non "-")
    const isValidPart = (part: string | null | undefined) => {
        return part && part.toLowerCase() !== "none" && part !== "-";
    };

    // Logica per determinare se dobbiamo mostrare il layout semplificato (Solo Blade + Bit)
    // Nota: Controlliamo ancora se assistBlade/Ratchet sono presenti nei dati per decidere il layout,
    // anche se l'immagine dell'assist non viene più mostrata.
    const isSimpleBladeBit = isValidPart(combo.blade) &&
        isValidPart(combo.bit) &&
        !isValidPart(combo.ratchet) &&
        !isValidPart(combo.assistBlade);

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
            className="group relative overflow-hidden border-border bg-card/40 backdrop-blur-md hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-300 cursor-pointer h-full flex flex-col"
            onClick={() => onView(combo)}
        >
            <div className="p-4 flex-1 flex flex-col items-center justify-center relative z-10">

                {/* Visual Section */}
                <div className="flex items-center justify-center h-28 w-full relative mb-2">

                    {isSimpleBladeBit ? (
                        /* === LAYOUT SEMPLIFICATO: SOLO BLADE E BIT FIANCO A FIANCO === */
                        <div className="flex items-center justify-center gap-2 group-hover:scale-110 transition-transform duration-300">
                            <DesktopComponentImage
                                folder="blades"
                                name={combo.blade}
                                className="w-20 h-20 drop-shadow-md filter opacity-100"
                            />
                            <DesktopComponentImage
                                folder="bits"
                                name={combo.bit}
                                className="w-16 h-16 drop-shadow-sm opacity-100"
                            />
                        </div>
                    ) : (
                        /* === LAYOUT STANDARD: STRUTTURA A 3 (Senza Assist Blade Image) === */
                        <>
                            {/* Left Flank: Ratchet */}
                            {isValidPart(combo.ratchet) && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 z-0 opacity-80 scale-75 group-hover:scale-100 group-hover:-translate-x-2 transition-all duration-300">
                                    <DesktopComponentImage folder="ratchets" name={combo.ratchet} className="w-16 h-16 drop-shadow-sm" />
                                </div>
                            )}

                            {/* Center: Blade (Hero) */}
                            <div className="relative z-20 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-2">
                                <DesktopComponentImage folder="blades" name={combo.blade} className="w-24 h-24 drop-shadow-md filter" />
                            </div>

                            {/* Right Flank: Bit */}
                            {isValidPart(combo.bit) && (
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-0 opacity-80 scale-75 group-hover:scale-100 group-hover:translate-x-2 transition-all duration-300">
                                    <DesktopComponentImage folder="bits" name={combo.bit} className="w-16 h-16 drop-shadow-sm" />
                                </div>
                            )}

                            {/* RIMOSSO: Blocco immagine Assist Blade */}
                        </>
                    )}
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