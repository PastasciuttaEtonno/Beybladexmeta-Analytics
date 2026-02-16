import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Star, Plus, Trash2, Layers, Eye, Trophy, Medal, Award } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import type {
  FavoriteCombo,
  FavoriteDeck,
  FavoriteDeckCombo,
} from "@shared/schema";

type Components = {
  blades: string[];
  assistBlades: string[];
  ratchets: string[];
  bits: { name: string; isRatchetLess: boolean }[];
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

// Use the public MinIO URL like in Analytics.tsx
const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

if (!PUBLIC_MINIO_URL) {
  console.error(
    "VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.",
  );
}

function ComponentImage({ folder, name }: { folder: string; name: string }) {
  const [attemptIndex, setAttemptIndex] = useState(0);

  const getImageVariations = (name: string, format: "png" | "webp") => {
    const variations = [
      name.toLowerCase().replace(/\s+/g, ""),
      name.toLowerCase().replace(/\s+/g, "-"),
      name
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/\s+/g, "-"),
    ];
    // Build full URL to public MinIO bucket
    return variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.${format}`);
  };

  const allAttempts = [
    ...getImageVariations(name, "webp"),
    ...getImageVariations(name, "png"),
  ];

  const handleImageError = () => {
    if (attemptIndex < allAttempts.length - 1) {
      setAttemptIndex(attemptIndex + 1);
    }
  };

  return (
    <div className="aspect-square bg-muted rounded-md overflow-hidden flex items-center justify-center">
      {attemptIndex >= allAttempts.length ? (
        <div className="text-center p-4">
          <p className="text-sm text-muted-foreground">Image not available</p>
        </div>
      ) : (
        <img
          key={attemptIndex}
          src={allAttempts[attemptIndex]}
          alt={name}
          className="w-full h-full object-contain"
          onError={handleImageError}
        />
      )}
    </div>
  );
}

const MAX_COMBOS = 20;
const MAX_DECKS = 20;
const PER_PAGE = 10;

export default function Favorites() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<FavoriteCombo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentDeckPage, setCurrentDeckPage] = useState(1);

  // Combo form state
  const [blade, setBlade] = useState("");
  const [assistBlade, setAssistBlade] = useState("");
  const [ratchet, setRatchet] = useState("");
  const [bit, setBit] = useState("");
  const [lockChip, setLockChip] = useState("");
  const [isRatchetDisabled, setIsRatchetDisabled] = useState(false);

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
    enabled: !!user,
  });

  // Pagination logic
  const allCombos = combosData?.combos || [];
  const totalCombos = allCombos.length;
  const totalPages = Math.max(1, Math.ceil(totalCombos / PER_PAGE));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = (page - 1) * PER_PAGE;
  const endIdx = startIdx + PER_PAGE;
  const pageItems = allCombos.slice(startIdx, endIdx);

  useEffect(() => {
    // Reset to page 1 if current page is out of bounds
    if (page !== currentPage) {
      setCurrentPage(page);
    }
  }, [totalCombos, page, currentPage]);

  const { data: decksData, isLoading: decksLoading } = useQuery<{
    decks: DeckWithCombos[];
  }>({
    queryKey: ["/api/favorites/decks"],
    enabled: !!user,
  });

  // Pagination logic for decks
  const allDecks = decksData?.decks || [];
  const totalDecks = allDecks.length;
  const totalDeckPages = Math.max(1, Math.ceil(totalDecks / PER_PAGE));
  const deckPage = Math.min(Math.max(1, currentDeckPage), totalDeckPages);
  const deckStartIdx = (deckPage - 1) * PER_PAGE;
  const deckEndIdx = deckStartIdx + PER_PAGE;
  const deckPageItems = allDecks.slice(deckStartIdx, deckEndIdx);

  useEffect(() => {
    // Reset to page 1 if current page is out of bounds for decks
    if (deckPage !== currentDeckPage) {
      setCurrentDeckPage(deckPage);
    }
  }, [totalDecks, deckPage, currentDeckPage]);

  const selectedKey = useMemo(() => {
    if (!selectedCombo) return "";
    return [
      selectedCombo.blade,
      selectedCombo.assistBlade,
      selectedCombo.ratchet,
      selectedCombo.bit,
      selectedCombo.lockChip,
    ].join("|");
  }, [selectedCombo]);
  const { data: comboStatsData, isLoading: comboStatsLoading } = useQuery<any>({
    queryKey: ["/api/stats/combos/by-key", selectedKey],
    enabled: detailModalOpen && !!selectedKey,
    queryFn: async () => {
      const resp = await fetch(`/api/stats/combos/by-key?key=${encodeURIComponent(selectedKey)}`, { credentials: "include" });
      if (resp.status === 404) return null;
      if (!resp.ok) throw new Error("Failed to fetch combo stats");
      return await resp.json();
    },
  });
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-8 h-8 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-8 h-8 text-slate-400" />;
    if (rank === 3) return <Award className="w-8 h-8 text-amber-700" />;
    return null;
  };

  useEffect(() => {
    if (blade && !isSingleWordBlade(blade)) {
      setAssistBlade("None");
      setLockChip("None");
    }
  }, [blade]);

  useEffect(() => {
    const selected = (components?.bits || []).find((b) => b.name === bit);
    const disabled = !!selected?.isRatchetLess;
    setIsRatchetDisabled(disabled);
    if (disabled) setRatchet("None");
  }, [bit, components?.bits]);

  const isBitRatchetLess = (name: string) => {
    const found = (components?.bits || []).find((b) => b.name === name);
    return !!found?.isRatchetLess;
  };

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
      // Reset to page 1 if current page becomes empty after deletion
      const remainingCount = (combosData?.combos?.length || 0) - 1;
      if (remainingCount > 0 && currentPage > Math.ceil(remainingCount / PER_PAGE)) {
        setCurrentPage(Math.ceil(remainingCount / PER_PAGE));
      }
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
      // Reset to page 1 if current page becomes empty after deletion
      const remainingCount = (decksData?.decks?.length || 0) - 1;
      if (remainingCount > 0 && currentDeckPage > Math.ceil(remainingCount / PER_PAGE)) {
        setCurrentDeckPage(Math.ceil(remainingCount / PER_PAGE));
      }
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

    // Check if user has reached the maximum number of combos
    const currentComboCount = combosData?.combos?.length || 0;
    if (currentComboCount >= MAX_COMBOS) {
      toast({
        title: "Limite raggiunto",
        description: `Puoi salvare massimo ${MAX_COMBOS} combo. Elimina una combo esistente per aggiungerne una nuova.`,
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

    // Check if user has reached the maximum number of decks
    const currentDeckCount = decksData?.decks?.length || 0;
    if (currentDeckCount >= MAX_DECKS) {
      toast({
        title: "Limite raggiunto",
        description: `Puoi salvare massimo ${MAX_DECKS} deck. Elimina un deck esistente per aggiungerne uno nuovo.`,
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

    // Validate all parts are different (except "None" for Assist Blade and Lock Chip)
    const allParts = {
      blades: deckCombos.map((c) => c.blade),
      assistBlades: deckCombos.map((c) => c.assistBlade).filter((ab) => ab !== "None"),
      ratchets: deckCombos.map((c) => c.ratchet),
      bits: deckCombos.map((c) => c.bit),
      lockChips: deckCombos.map((c) => c.lockChip).filter((lc) => lc !== "None"),
    };

    const hasDuplicates = Object.values(allParts).some((parts) => {
      const unique = new Set(parts);
      return unique.size !== parts.length;
    });

    if (hasDuplicates) {
      toast({
        title: "Error",
        description: "All parts must be different across the 3 combos (except None for Assist Blade and Lock Chip)",
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
    if (field === "bit") {
      if (isBitRatchetLess(value)) {
        newCombos[index].ratchet = "None";
      }
    }
    setDeckCombos(newCombos);
  };

  const handleViewCombo = (combo: FavoriteCombo) => {
    setSelectedCombo(combo);
    setDetailModalOpen(true);
  };

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen bg-background pb-20">
        <PageHeader title="Preferiti" action={<HeaderLogo />} />
        <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
          <Card className="p-6 mb-6 text-center">
            <p className="text-sm text-muted-foreground">Accedi per usare i Preferiti e salvare le tue combo preferite</p>
            <div className="mt-3">
              <Button onClick={() => setLocation('/profile')}>Vai al Profilo</Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Preferiti" action={<HeaderLogo />} />

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
              <div>
                <h2 className="text-lg font-semibold">Combo preferite</h2>
                {!combosLoading && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalCombos} / {MAX_COMBOS} combo salvate
                  </p>
                )}
              </div>
              <Dialog open={comboModalOpen} onOpenChange={setComboModalOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="icon"
                    data-testid="button-add-combo"
                    disabled={totalCombos >= MAX_COMBOS}
                    title={totalCombos >= MAX_COMBOS ? `Limite di ${MAX_COMBOS} combo raggiunto` : "Aggiungi combo"}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Aggiungi combo preferita</DialogTitle>
                    <DialogDescription>
                      Seleziona i 5 componenti della tua combo preferita.
                      {totalCombos > 0 && (
                        <span className="block mt-1 text-xs">
                          {totalCombos} / {MAX_COMBOS} combo salvate
                        </span>
                      )}
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
                          Non CX blades cannot use Assist Blades
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ratchet">Ratchet</Label>
                      <Select value={ratchet} onValueChange={setRatchet} disabled={isRatchetDisabled}>
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
                      {isRatchetDisabled && (
                        <p className="text-xs text-muted-foreground">Bloccato su "None" per Bit selezionato</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bit">Bit</Label>
                      <Select value={bit} onValueChange={setBit}>
                        <SelectTrigger id="bit" data-testid="select-bit">
                          <SelectValue placeholder="Select bit..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(components?.bits || []).map((b) => (
                            <SelectItem key={b.name} value={b.name}>
                              {b.name}
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
                          Non CX blades cannot use Lock Chips
                        </p>
                      )}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={handleAddCombo}
                      disabled={addComboMutation.isPending || (totalCombos >= MAX_COMBOS)}
                      className="w-full"
                      data-testid="button-save-combo"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Favorites
                    </Button>
                    {totalCombos >= MAX_COMBOS && (
                      <p className="text-xs text-muted-foreground text-center w-full mt-2">
                        Limite di {MAX_COMBOS} combo raggiunto. Elimina una combo per aggiungerne una nuova.
                      </p>
                    )}
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
            ) : totalCombos > 0 ? (
              <>
                <div className="space-y-3">
                  {pageItems.map((combo, index) => (
                    <Card
                      key={combo.id}
                      className="p-4 hover-elevate cursor-pointer"
                      data-testid={`card-combo-${startIdx + index}`}
                      onClick={() => handleViewCombo(combo)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-16 h-16 shrink-0">
                              <ComponentImage folder="blades" name={combo.blade} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground">Blade</p>
                              <p className="text-sm font-medium truncate">{combo.blade}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {combo.assistBlade !== "None" && (
                              <div className="flex items-center gap-2">
                                <div className="w-10 h-10 shrink-0">
                                  <ComponentImage folder="assist-blades" name={combo.assistBlade} />
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                  <p className="text-xs text-muted-foreground">Assist Blade</p>
                                  <p className="text-sm font-medium truncate">{combo.assistBlade}</p>
                                </div>
                              </div>
                            )}
                            {combo.ratchet !== "None" && (
                              <div className="flex items-center gap-2">
                                <div className="w-10 h-10 shrink-0">
                                  <ComponentImage folder="ratchets" name={combo.ratchet} />
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                  <p className="text-xs text-muted-foreground">Ratchet</p>
                                  <p className="text-sm font-medium truncate">{combo.ratchet}</p>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 shrink-0">
                                <ComponentImage folder="bits" name={combo.bit} />
                              </div>
                              <div className="min-w-0 flex flex-col justify-center">
                                <p className="text-xs text-muted-foreground">Bit</p>
                                <p className="text-sm font-medium truncate">{combo.bit}</p>
                              </div>
                            </div>
                            {combo.lockChip !== "None" && (
                              <div className="col-span-2 flex items-center gap-2">
                                <div className="w-10 h-10 shrink-0">
                                  <ComponentImage folder="chips" name={combo.lockChip} />
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                  <p className="text-xs text-muted-foreground">Lock Chip</p>
                                  <p className="text-sm font-medium truncate">{combo.lockChip}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewCombo(combo);
                            }}
                            data-testid={`button-view-combo-${startIdx + index}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteComboMutation.mutate(combo.id);
                            }}
                            data-testid={`button-delete-combo-${startIdx + index}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {totalPages > 1 && (
                    <Pagination className="mt-4">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => { e.preventDefault(); setCurrentPage(Math.max(1, page - 1)); }}
                          />
                        </PaginationItem>
                        {page > 2 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(1); }}>1</PaginationLink>
                          </PaginationItem>
                        )}
                        {page > 3 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationEllipsis />
                          </PaginationItem>
                        )}
                        {Array.from({ length: 3 }, (_, i) => page - 1 + i)
                          .filter((p) => p >= 1 && p <= totalPages)
                          .map((p) => (
                            <PaginationItem key={p}>
                              <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setCurrentPage(p); }}>{p}</PaginationLink>
                            </PaginationItem>
                          ))}
                        {page < totalPages - 2 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationEllipsis />
                          </PaginationItem>
                        )}
                        {page < totalPages - 1 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentPage(totalPages); }}>{totalPages}</PaginationLink>
                          </PaginationItem>
                        )}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => { e.preventDefault(); setCurrentPage(Math.min(totalPages, page + 1)); }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              </>
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
              <div>
                <h2 className="text-lg font-semibold">Favorite Decks</h2>
                {!decksLoading && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalDecks} / {MAX_DECKS} deck salvati
                  </p>
                )}
              </div>
              <Dialog open={deckModalOpen} onOpenChange={setDeckModalOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="icon"
                    data-testid="button-add-deck"
                    disabled={totalDecks >= MAX_DECKS}
                    title={totalDecks >= MAX_DECKS ? `Limite di ${MAX_DECKS} deck raggiunto` : "Aggiungi deck"}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Crea Deck</DialogTitle>
                    <DialogDescription>
                      Crea un deck con 3 combo. Ogni combo deve avere componenti
                      diversi.
                      {totalDecks > 0 && (
                        <span className="block mt-1 text-xs">
                          {totalDecks} / {MAX_DECKS} deck salvati
                        </span>
                      )}
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
                            Non CX blades cannot use Assist Blades
                          </p>
                        )}

                        <Select
                          value={combo.ratchet}
                          onValueChange={(val) =>
                            updateDeckCombo(index, "ratchet", val)
                          }
                          disabled={isBitRatchetLess(combo.bit)}
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
                        {isBitRatchetLess(combo.bit) && (
                          <p className="text-xs text-muted-foreground">Bloccato su "None" per Bit selezionato</p>
                        )}

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
                            {(components?.bits || []).map((b) => (
                              <SelectItem key={b.name} value={b.name}>
                                {b.name}
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
                            Non CX blades cannot use Lock Chips
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={handleAddDeck}
                      disabled={addDeckMutation.isPending || (totalDecks >= MAX_DECKS)}
                      className="w-full"
                      data-testid="button-save-deck"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Deck
                    </Button>
                    {totalDecks >= MAX_DECKS && (
                      <p className="text-xs text-muted-foreground text-center w-full mt-2">
                        Limite di {MAX_DECKS} deck raggiunto. Elimina un deck per aggiungerne uno nuovo.
                      </p>
                    )}
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
            ) : totalDecks > 0 ? (
              <>
                <div className="space-y-3">
                  {deckPageItems.map((deck, deckIndex) => (
                    <Card
                      key={deck.id}
                      className="p-4"
                      data-testid={`card-deck-${deckStartIdx + deckIndex}`}
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
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-12 h-12 shrink-0">
                                <ComponentImage folder="blades" name={combo.blade} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-muted-foreground">
                                  Blade:
                                </span>{" "}
                                <span className="text-xs font-medium">{combo.blade}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {combo.assistBlade !== "None" && (
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 shrink-0">
                                    <ComponentImage folder="assist-blades" name={combo.assistBlade} />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-muted-foreground">Assist:</span>{" "}
                                    <span className="font-medium truncate  max-w-[140px]">{combo.assistBlade}</span>
                                  </div>
                                </div>
                              )}
                              {combo.ratchet !== "None" && (
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 shrink-0">
                                    <ComponentImage folder="ratchets" name={combo.ratchet} />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-muted-foreground">Ratchet:</span>{" "}
                                    <span className="font-medium truncate  max-w-[140px]">{combo.ratchet}</span>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 shrink-0">
                                  <ComponentImage folder="bits" name={combo.bit} />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-muted-foreground">Bit:</span>{" "}
                                  <span className="font-medium truncate  max-w-[140px]">{combo.bit}</span>
                                </div>
                              </div>
                              {combo.lockChip !== "None" && (
                                <div className="col-span-2 flex items-center gap-2">
                                  <div className="w-8 h-8 shrink-0">
                                    <ComponentImage folder="chips" name={combo.lockChip} />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-muted-foreground">Chip:</span>{" "}
                                    <span className="font-medium truncate  max-w-[180px]">{combo.lockChip}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}

                  {totalDeckPages > 1 && (
                    <Pagination className="mt-4">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => { e.preventDefault(); setCurrentDeckPage(Math.max(1, deckPage - 1)); }}
                          />
                        </PaginationItem>
                        {deckPage > 2 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentDeckPage(1); }}>1</PaginationLink>
                          </PaginationItem>
                        )}
                        {deckPage > 3 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationEllipsis />
                          </PaginationItem>
                        )}
                        {Array.from({ length: 3 }, (_, i) => deckPage - 1 + i)
                          .filter((p) => p >= 1 && p <= totalDeckPages)
                          .map((p) => (
                            <PaginationItem key={p}>
                              <PaginationLink href="#" isActive={p === deckPage} onClick={(e) => { e.preventDefault(); setCurrentDeckPage(p); }}>{p}</PaginationLink>
                            </PaginationItem>
                          ))}
                        {deckPage < totalDeckPages - 2 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationEllipsis />
                          </PaginationItem>
                        )}
                        {deckPage < totalDeckPages - 1 && (
                          <PaginationItem className="hidden sm:block">
                            <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setCurrentDeckPage(totalDeckPages); }}>{totalDeckPages}</PaginationLink>
                          </PaginationItem>
                        )}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => { e.preventDefault(); setCurrentDeckPage(Math.min(totalDeckPages, deckPage + 1)); }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              </>
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

      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dettagli combo</DialogTitle>
            <DialogDescription>
              Visualizza i componenti della tua combo preferita
            </DialogDescription>
          </DialogHeader>

          {selectedCombo && (
            <div className="space-y-4 py-4">
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-4">
                {[
                  { label: "Blade", value: selectedCombo.blade, folder: "blades" },
                  {
                    label: "Assist Blade",
                    value: selectedCombo.assistBlade,
                    folder: "assist-blades",
                  },
                  { label: "Ratchet", value: selectedCombo.ratchet, folder: "ratchets" },
                  { label: "Bit", value: selectedCombo.bit, folder: "bits" },
                  { label: "Lock Chip", value: selectedCombo.lockChip, folder: "chips" },
                ]
                  .filter((component) => {
                    const value = component.value;
                    return (
                      value !== null &&
                      value !== undefined &&
                      value !== "" &&
                      value.toUpperCase() !== "NONE" &&
                      value !== "-"
                    );
                  })
                  .map((component) => (
                    <div key={component.label} className="flex flex-col items-center gap-2 group">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-muted/50 to-muted rounded-xl border shadow-sm flex items-center justify-center p-2 transition-transform group-hover:scale-105">
                        <ComponentImage
                          folder={component.folder}
                          name={component.value}
                        />
                      </div>
                      <div className="text-center space-y-0.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {component.label}
                        </p>
                        <p
                          className="text-sm font-medium leading-tight max-w-[100px] truncate"
                          data-testid={`text-detail-${component.label.toLowerCase().replace(/\s+/g, "-")}`}
                          title={component.value}
                        >
                          {component.value}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="space-y-2">
                {comboStatsLoading ? (
                  <div className="h-6 bg-muted/30 animate-pulse" />
                ) : comboStatsData?.combo ? (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-base">Statistiche tornei</CardTitle>
                          <CardDescription>Rank #{Number(comboStatsData.rank)} nella classifica</CardDescription>
                        </div>
                        {Number(comboStatsData.rank) <= 3 && (
                          <div>{getRankIcon(Number(comboStatsData.rank))}</div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">1st Place</p>
                          <p className="text-2xl font-bold">
                            {Number(comboStatsData.combo.primiPosti)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">2nd Place</p>
                          <p className="text-2xl font-bold">
                            {Number(comboStatsData.combo.secondiPosti)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">3rd Place</p>
                          <p className="text-2xl font-bold">
                            {Number(comboStatsData.combo.terziPosti)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Total Score</p>
                          <p className="text-2xl font-bold text-primary">
                            {Number(comboStatsData.combo.punteggioTotale).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-base">Statistiche tornei</CardTitle>
                          <CardDescription>Nessun dato registrato per questa combo</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Vinci un torneo con questa combo e registrala!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
