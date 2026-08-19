import { Button } from "@/components/ui/button";
import { Plus, Layers, Star, Info } from "lucide-react";
import { DesktopDeckCard } from "./DesktopDeckCard";
import { DesktopFavoriteComboCard } from "./DesktopFavoriteComboCard";
import { DesktopDeckCardSkeleton } from "./DesktopDeckCardSkeleton";
import { DesktopFavoriteComboCardSkeleton } from "./DesktopFavoriteComboCardSkeleton";
import type { FavoriteCombo, FavoriteDeck, FavoriteDeckCombo } from "@/types/api";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Redefine locally to avoid circular imports or complex type sharing
interface DeckWithCombos extends FavoriteDeck {
    combos: FavoriteDeckCombo[];
}

interface DesktopFavoritesWrapperProps {
    decks: DeckWithCombos[];
    combos: FavoriteCombo[];
    onDeleteCombo: (id: string) => void;
    onDeleteDeck: (id: string) => void;
    onViewCombo: (combo: FavoriteCombo) => void;
    onAddCombo: () => void;
    onAddDeck: () => void;

    // Loading states
    isDecksLoading?: boolean;
    isCombosLoading?: boolean;

    // Limits for disabling buttons
    totalCombos: number;
    maxCombos: number;
    totalDecks: number;
    maxDecks: number;
}

export function DesktopFavoritesWrapper({
    decks,
    combos,
    onDeleteCombo,
    onDeleteDeck,
    onViewCombo,
    onAddCombo,
    onAddDeck,
    isDecksLoading = false,
    isCombosLoading = false,
    totalCombos,
    maxCombos,
    totalDecks,
    maxDecks
}: DesktopFavoritesWrapperProps) {

    return (
        <div className="flex flex-col gap-8 pb-10 fade-in duration-500">
            {/* SECTION 1: THE HANGAR (Decks) */}
            <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Layers className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Hangar</h2>
                            <p className="text-sm text-muted-foreground">Gestisci i tuoi deck</p>
                        </div>
                    </div>

                    <Button onClick={onAddDeck} disabled={totalDecks >= maxDecks} className="gap-2 shadow-lg hover:shadow-primary/20 transition-all">
                        <Plus className="w-4 h-4" />
                        Nuovo Deck
                    </Button>
                </div>

                {/* Decks Horizontal List */}
                {isDecksLoading ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {[1, 2].map((i) => (
                            <DesktopDeckCardSkeleton key={i} />
                        ))}
                    </div>
                ) : decks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-xl bg-card/20 text-center">
                        <Layers className="w-12 h-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium">Nessun deck salvato</h3>
                        <p className="text-muted-foreground text-sm max-w-md mt-1 mb-4">
                            Crea un deck per raggruppare 3 combo.
                        </p>
                        <Button variant="outline" onClick={onAddDeck}>Crea Deck</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {decks.map(deck => (
                            <DesktopDeckCard
                                key={deck.id}
                                deck={deck}
                                onDelete={onDeleteDeck}
                                onEdit={onAddDeck} // Added edit wiring as per missing prop in previous view
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Visual Divider */}
            <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/50" />
                </div>
            </div>

            {/* SECTION 2: THE LIBRARY (Combos) */}
            <section className="space-y-4">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between px-1 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-secondary/10 rounded-lg shrink-0">
                            <Star className="w-6 h-6 text-secondary-foreground" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Combo</h2>
                            <p className="text-sm text-muted-foreground">La tua collezione</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
                        <span className="text-sm text-muted-foreground font-medium">
                            {totalCombos} / {maxCombos} Slots usati
                        </span>
                        <Button onClick={onAddCombo} disabled={totalCombos >= maxCombos} variant="secondary" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Combo
                        </Button>
                    </div>
                </div>

                {/* Combos Grid */}
                {isCombosLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <DesktopFavoriteComboCardSkeleton key={i} />
                        ))}
                    </div>
                ) : combos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-xl bg-card/20 text-center">
                        <Star className="w-12 h-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium">Collezione Vuota</h3>
                        <p className="text-muted-foreground text-sm max-w-md mt-1 mb-4">
                            Salva le tue combo preferite.
                        </p>
                        <Button variant="outline" onClick={onAddCombo}>Salva la prima Combo</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {combos.map(combo => (
                            <DesktopFavoriteComboCard
                                key={combo.id}
                                combo={combo}
                                onDelete={onDeleteCombo}
                                onView={onViewCombo}
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
