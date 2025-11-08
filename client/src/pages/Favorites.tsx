import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, Plus, Trash2, Layers } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type {
  FavoriteCombo,
  FavoriteDeck,
  FavoriteDeckCombo,
} from "@shared/schema";

type Components = {
  blades: string[];
  assistBlades: string[];
  ratchets: string[];
  bits: string[];
  lockChips: string[];
};

type DeckWithCombos = FavoriteDeck & {
  combos: FavoriteDeckCombo[];
};

const isSingleWordBlade = (bladeName: string): boolean => {
  if (!bladeName) return true;
  const hasMultipleCapitals = /[A-Z].*[A-Z]/.test(bladeName);
  return !hasMultipleCapitals;
};

export default function Favorites() {
  const { toast } = useToast();
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [deckModalOpen, setDeckModalOpen] = useState(false);

  // Combo form state
  const [blade, setBlade] = useState("");
  const [assistBlade, setAssistBlade] = useState("");
  const [ratchet, setRatchet] = useState("");
  const [bit, setBit] = useState("");
  const [lockChip, setLockChip] = useState("");

  // Deck form state
  const [deckName, setDeckName] = useState("");
  const [deckCombos, setDeckCombos] = useState<
    Array<{
      blade: string;
      assistBlade: string;
      ratchet: string;
      bit: string;
      lockChip: string;
    }>
  >([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  const { data: components } = useQuery<Components>({
    queryKey: ["/api/components"],
  });

  const { data: combosData, isLoading: combosLoading } = useQuery<{
    combos: FavoriteCombo[];
  }>({
    queryKey: ["/api/favorites/combos"],
  });

  const { data: decksData, isLoading: decksLoading } = useQuery<{
    decks: DeckWithCombos[];
  }>({
    queryKey: ["/api/favorites/decks"],
  });

  useEffect(() => {
    if (blade && !isSingleWordBlade(blade)) {
      setAssistBlade("None");
      setLockChip("None");
    }
  }, [blade]);

  const addComboMutation = useMutation({
    mutationFn: async (combo: Omit<FavoriteCombo, "id" | "userId">) => {
      return apiRequest("POST", "/api/favorites/combos", combo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/combos"] });
      setComboModalOpen(false);
      resetComboForm();
      toast({
        title: "Success",
        description: "Combo added to favorites",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add combo",
        variant: "destructive",
      });
    },
  });

  const deleteComboMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/favorites/combos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/combos"] });
      toast({
        title: "Success",
        description: "Combo removed from favorites",
      });
    },
  });

  const addDeckMutation = useMutation({
    mutationFn: async (deck: { name: string; combos: any[] }) => {
      return apiRequest("POST", "/api/favorites/decks", deck);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/decks"] });
      setDeckModalOpen(false);
      resetDeckForm();
      toast({
        title: "Success",
        description: "Deck created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create deck",
        variant: "destructive",
      });
    },
  });

  const deleteDeckMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/favorites/decks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites/decks"] });
      toast({
        title: "Success",
        description: "Deck deleted successfully",
      });
    },
  });

  const resetComboForm = () => {
    setBlade("");
    setAssistBlade("");
    setRatchet("");
    setBit("");
    setLockChip("");
  };

  const resetDeckForm = () => {
    setDeckName("");
    setDeckCombos([
      { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    ]);
  };

  const handleAddCombo = () => {
    if (!blade || !assistBlade || !ratchet || !bit || !lockChip) {
      toast({
        title: "Error",
        description: "Please select all components",
        variant: "destructive",
      });
      return;
    }

    addComboMutation.mutate({ blade, assistBlade, ratchet, bit, lockChip });
  };

  const handleAddDeck = () => {
    if (!deckName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a deck name",
        variant: "destructive",
      });
      return;
    }

    const allCombosComplete = deckCombos.every(
      (combo) =>
        combo.blade &&
        combo.assistBlade &&
        combo.ratchet &&
        combo.bit &&
        combo.lockChip,
    );

    if (!allCombosComplete) {
      toast({
        title: "Error",
        description: "Please complete all 3 combos",
        variant: "destructive",
      });
      return;
    }

    // Validate all parts are different
    const allParts = {
      blades: deckCombos.map((c) => c.blade),
      assistBlades: deckCombos.map((c) => c.assistBlade),
      ratchets: deckCombos.map((c) => c.ratchet),
      bits: deckCombos.map((c) => c.bit),
      lockChips: deckCombos.map((c) => c.lockChip),
    };

    const hasDuplicates = Object.values(allParts).some((parts) => {
      const unique = new Set(parts);
      return unique.size !== parts.length;
    });

    if (hasDuplicates) {
      toast({
        title: "Error",
        description: "All parts must be different across the 3 combos",
        variant: "destructive",
      });
      return;
    }

    addDeckMutation.mutate({ name: deckName, combos: deckCombos });
  };

  const updateDeckCombo = (index: number, field: string, value: string) => {
    const newCombos = [...deckCombos];
    newCombos[index] = { ...newCombos[index], [field]: value };
    
    if (field === "blade" && !isSingleWordBlade(value)) {
      newCombos[index].assistBlade = "None";
      newCombos[index].lockChip = "None";
    }
    
    setDeckCombos(newCombos);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Preferiti" />

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <Tabs defaultValue="combos" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="combos" data-testid="tab-combos">
              <Star className="w-4 h-4 mr-2" />
              Combos
            </TabsTrigger>
            <TabsTrigger value="decks" data-testid="tab-decks">
              <Layers className="w-4 h-4 mr-2" />
              Decks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="combos" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Combo preferite</h2>
              <Dialog open={comboModalOpen} onOpenChange={setComboModalOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" data-testid="button-add-combo">
                    <Plus className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Aggiungi combo preferita</DialogTitle>
                    <DialogDescription>
                      Seleziona i 5 componenti della tua combo preferita.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="blade">Blade</Label>
                      <Select value={blade} onValueChange={setBlade}>
                        <SelectTrigger id="blade" data-testid="select-blade">
                          <SelectValue placeholder="Select blade..." />
                        </SelectTrigger>
                        <SelectContent>
                          {components?.blades.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assistBlade">Assist Blade</Label>
                      <Select
                        value={assistBlade}
                        onValueChange={setAssistBlade}
                        disabled={!isSingleWordBlade(blade)}
                      >
                        <SelectTrigger
                          id="assistBlade"
                          data-testid="select-assist-blade"
                        >
                          <SelectValue placeholder="Select assist blade..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          {components?.assistBlades.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!isSingleWordBlade(blade) && blade && (
                        <p className="text-xs text-muted-foreground">
                          Multi-word blades cannot use Assist Blades
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ratchet">Ratchet</Label>
                      <Select value={ratchet} onValueChange={setRatchet}>
                        <SelectTrigger
                          id="ratchet"
                          data-testid="select-ratchet"
                        >
                          <SelectValue placeholder="Select ratchet..." />
                        </SelectTrigger>
                        <SelectContent>
                          {components?.ratchets.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bit">Bit</Label>
                      <Select value={bit} onValueChange={setBit}>
                        <SelectTrigger id="bit" data-testid="select-bit">
                          <SelectValue placeholder="Select bit..." />
                        </SelectTrigger>
                        <SelectContent>
                          {components?.bits.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lockChip">Lock Chip</Label>
                      <Select
                        value={lockChip}
                        onValueChange={setLockChip}
                        disabled={!isSingleWordBlade(blade)}
                      >
                        <SelectTrigger
                          id="lockChip"
                          data-testid="select-lock-chip"
                        >
                          <SelectValue placeholder="Select lock chip..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          {components?.lockChips.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!isSingleWordBlade(blade) && blade && (
                        <p className="text-xs text-muted-foreground">
                          Multi-word blades cannot use Lock Chips
                        </p>
                      )}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={handleAddCombo}
                      disabled={addComboMutation.isPending}
                      className="w-full"
                      data-testid="button-save-combo"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Favorites
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {combosLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-32 bg-muted/30 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : combosData?.combos && combosData.combos.length > 0 ? (
              <div className="space-y-3">
                {combosData.combos.map((combo, index) => (
                  <Card
                    key={combo.id}
                    className="p-4"
                    data-testid={`card-combo-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Blade</p>
                          <p className="text-sm font-medium">{combo.blade}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Assist Blade
                          </p>
                          <p className="text-sm font-medium">
                            {combo.assistBlade}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Ratchet
                          </p>
                          <p className="text-sm font-medium">{combo.ratchet}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Bit</p>
                          <p className="text-sm font-medium">{combo.bit}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">
                            Lock Chip
                          </p>
                          <p className="text-sm font-medium">
                            {combo.lockChip}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteComboMutation.mutate(combo.id)}
                        data-testid={`button-delete-combo-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Star className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nessuna combo preferita</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tocca il bottone + per creare il tuo primo deck
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="decks" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Favorite Decks</h2>
              <Dialog open={deckModalOpen} onOpenChange={setDeckModalOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" data-testid="button-add-deck">
                    <Plus className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Crea Deck</DialogTitle>
                    <DialogDescription>
                      Crea un deck con 3 combo. Ogni combo deve avere componenti
                      diversi.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="deckName">Deck Name</Label>
                      <Input
                        id="deckName"
                        value={deckName}
                        onChange={(e) => setDeckName(e.target.value)}
                        placeholder="Enter deck name..."
                        data-testid="input-deck-name"
                      />
                    </div>

                    {deckCombos.map((combo, index) => (
                      <div
                        key={index}
                        className="space-y-3 p-4 border rounded-lg"
                      >
                        <p className="font-semibold text-sm">
                          Combo {index + 1}
                        </p>

                        <Select
                          value={combo.blade}
                          onValueChange={(val) =>
                            updateDeckCombo(index, "blade", val)
                          }
                        >
                          <SelectTrigger
                            data-testid={`select-deck-blade-${index}`}
                          >
                            <SelectValue placeholder="Select blade..." />
                          </SelectTrigger>
                          <SelectContent>
                            {components?.blades.map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={combo.assistBlade}
                          onValueChange={(val) =>
                            updateDeckCombo(index, "assistBlade", val)
                          }
                          disabled={!isSingleWordBlade(combo.blade)}
                        >
                          <SelectTrigger
                            data-testid={`select-deck-assist-blade-${index}`}
                          >
                            <SelectValue placeholder="Select assist blade..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="None">None</SelectItem>
                            {components?.assistBlades.map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!isSingleWordBlade(combo.blade) && combo.blade && (
                          <p className="text-xs text-muted-foreground">
                            Multi-word blades cannot use Assist Blades
                          </p>
                        )}

                        <Select
                          value={combo.ratchet}
                          onValueChange={(val) =>
                            updateDeckCombo(index, "ratchet", val)
                          }
                        >
                          <SelectTrigger
                            data-testid={`select-deck-ratchet-${index}`}
                          >
                            <SelectValue placeholder="Select ratchet..." />
                          </SelectTrigger>
                          <SelectContent>
                            {components?.ratchets.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={combo.bit}
                          onValueChange={(val) =>
                            updateDeckCombo(index, "bit", val)
                          }
                        >
                          <SelectTrigger
                            data-testid={`select-deck-bit-${index}`}
                          >
                            <SelectValue placeholder="Select bit..." />
                          </SelectTrigger>
                          <SelectContent>
                            {components?.bits.map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={combo.lockChip}
                          onValueChange={(val) =>
                            updateDeckCombo(index, "lockChip", val)
                          }
                          disabled={!isSingleWordBlade(combo.blade)}
                        >
                          <SelectTrigger
                            data-testid={`select-deck-lock-chip-${index}`}
                          >
                            <SelectValue placeholder="Select lock chip..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="None">None</SelectItem>
                            {components?.lockChips.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!isSingleWordBlade(combo.blade) && combo.blade && (
                          <p className="text-xs text-muted-foreground">
                            Multi-word blades cannot use Lock Chips
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={handleAddDeck}
                      disabled={addDeckMutation.isPending}
                      className="w-full"
                      data-testid="button-save-deck"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Deck
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {decksLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-48 bg-muted/30 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : decksData?.decks && decksData.decks.length > 0 ? (
              <div className="space-y-3">
                {decksData.decks.map((deck, deckIndex) => (
                  <Card
                    key={deck.id}
                    className="p-4"
                    data-testid={`card-deck-${deckIndex}`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="font-semibold">{deck.name}</h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteDeckMutation.mutate(deck.id)}
                        data-testid={`button-delete-deck-${deckIndex}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {deck.combos.map((combo, comboIndex) => (
                        <div
                          key={combo.id}
                          className="p-3 bg-muted/50 rounded-lg"
                        >
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Combo {comboIndex + 1}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">
                                Blade:
                              </span>{" "}
                              {combo.blade}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Assist:
                              </span>{" "}
                              {combo.assistBlade}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Ratchet:
                              </span>{" "}
                              {combo.ratchet}
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                Bit:
                              </span>{" "}
                              {combo.bit}
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground">
                                Chip:
                              </span>{" "}
                              {combo.lockChip}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nessun deck preferito</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tocca il bottone + per creare il tuo primo deck
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
