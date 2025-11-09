import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Lock, Trophy, Medal, Award, Eraser } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

type ComboForm = {
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
};

const isSingleWordBlade = (bladeName: string): boolean => {
  if (!bladeName) return true;
  const hasMultipleCapitals = /[A-Z].*[A-Z]/.test(bladeName);
  return !hasMultipleCapitals;
};

export default function Tournaments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'add'|'list'>(user?.isAdmin ? 'add' : 'list');
  const [nomeTorneo, setNomeTorneo] = useState<string>("");
  const [dataTorneo] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [descrizione, setDescrizione] = useState<string>("");
  const [participants, setParticipants] = useState<number>(0);
  const [regione, setRegione] = useState<string>("");

  const [firstPlace, setFirstPlace] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  const [secondPlace, setSecondPlace] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  const [thirdPlace, setThirdPlace] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  // Inline ComponentImage (consistent with other pages)
  const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");
  function ComponentImage({ folder, name }: { folder: string; name: string }) {
    const [attemptIndex, setAttemptIndex] = useState(0);
    const getImageVariations = (n: string, format: "png" | "webp") => {
      const variations = [
        n.toLowerCase().replace(/\s+/g, ""),
        n.toLowerCase().replace(/\s+/g, "-"),
        n.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/\s+/g, "-"),
      ];
      return variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.${format}`);
    };
    const allAttempts = [...getImageVariations(name, "webp"), ...getImageVariations(name, "png")];
    const handleError = () => {
      if (attemptIndex < allAttempts.length - 1) setAttemptIndex(attemptIndex + 1);
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
            onError={handleError}
          />
        )}
      </div>
    );
  }

  // Elenco regioni italiane (coerente con la validazione lato server)
  const ITALIAN_REGIONS = [
    "Piemonte",
    "Valle d'Aosta",
    "Lombardia",
    "Trentino-Alto Adige",
    "Veneto",
    "Friuli-Venezia Giulia",
    "Liguria",
    "Emilia-Romagna",
    "Toscana",
    "Umbria",
    "Marche",
    "Lazio",
    "Abruzzo",
    "Molise",
    "Campania",
    "Puglia",
    "Basilicata",
    "Calabria",
    "Sicilia",
    "Sardegna",
  ];

  const { data: componentsData } = useQuery<{
    blades: string[];
    assistBlades: string[];
    ratchets: string[];
    bits: string[];
    lockChips: string[];
  }>({
    queryKey: ["/api/components"],
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/tournament-results", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Tournament results submitted successfully",
      });
      setParticipants(0);
      setFirstPlace([
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      ]);
      setSecondPlace([
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      ]);
      setThirdPlace([
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      ]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit tournament results",
        variant: "destructive",
      });
    },
  });

  const updateCombo = (
    position: "first" | "second" | "third",
    index: number,
    field: keyof ComboForm,
    value: string,
  ) => {
    const setter =
      position === "first"
        ? setFirstPlace
        : position === "second"
          ? setSecondPlace
          : setThirdPlace;
    const combos =
      position === "first"
        ? firstPlace
        : position === "second"
          ? secondPlace
          : thirdPlace;

    const newCombos = [...combos];
    newCombos[index] = { ...newCombos[index], [field]: value };

    if (field === "blade" && !isSingleWordBlade(value)) {
      newCombos[index].assistBlade = "None";
      newCombos[index].lockChip = "None";
    }

    setter(newCombos);
  };

  const validateDeckUniqueness = (
    combos: ComboForm[],
    deckName: string,
  ): string | null => {
    const parts: { [key: string]: string[] } = {
      blade: [],
      assistBlade: [],
      ratchet: [],
      bit: [],
      lockChip: [],
    };

    for (const combo of combos) {
      parts.blade.push(combo.blade);
      parts.assistBlade.push(combo.assistBlade);
      parts.ratchet.push(combo.ratchet);
      parts.bit.push(combo.bit);
      parts.lockChip.push(combo.lockChip);
    }

    const checkDuplicates = (
      arr: string[],
      partName: string,
      allowNone: boolean,
    ): string | null => {
      const filtered = allowNone ? arr.filter((v) => v !== "None") : arr;
      const unique = new Set(filtered);
      if (filtered.length !== unique.size) {
        return `${deckName} has duplicate ${partName}s. Each combo must use different parts (except "None" for Assist Blade and Lock Chip).`;
      }
      return null;
    };

    const errors = [
      checkDuplicates(parts.blade, "Blade", false),
      checkDuplicates(parts.assistBlade, "Assist Blade", true),
      checkDuplicates(parts.ratchet, "Ratchet", false),
      checkDuplicates(parts.bit, "Bit", false),
      checkDuplicates(parts.lockChip, "Lock Chip", true),
    ].filter(Boolean);

    return errors.length > 0 ? errors[0] : null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validazione meta torneo
    if (!nomeTorneo.trim()) {
      toast({ title: "Errore", description: "Inserisci il nome del torneo", variant: "destructive" });
      return;
    }
    // dataTorneo viene impostata automaticamente al giorno corrente (YYYY-MM-DD)

    // Validate participants range: 6–200 inclusive
    if (participants < 6 || participants > 200) {
      toast({
        title: "Error",
        description: "I partecipanti devono essere compresi tra 6 e 200",
        variant: "destructive",
      });
      return;
    }

    // Validazione regione: obbligatoria e deve essere una regione italiana valida
    if (!ITALIAN_REGIONS.includes(regione)) {
      toast({
        title: "Errore",
        description: "Seleziona una regione italiana valida",
        variant: "destructive",
      });
      return;
    }

    const allCombos = [...firstPlace, ...secondPlace, ...thirdPlace];
    const hasEmpty = allCombos.some(
      (combo) =>
        !combo.blade ||
        !combo.assistBlade ||
        !combo.ratchet ||
        !combo.bit ||
        !combo.lockChip,
    );

    if (hasEmpty) {
      toast({
        title: "Error",
        description: "Please fill in all combo components",
        variant: "destructive",
      });
      return;
    }

    const firstPlaceError = validateDeckUniqueness(firstPlace, "1st Place");
    const secondPlaceError = validateDeckUniqueness(secondPlace, "2nd Place");
    const thirdPlaceError = validateDeckUniqueness(thirdPlace, "3rd Place");

    const validationError =
      firstPlaceError || secondPlaceError || thirdPlaceError;
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    submitMutation.mutate({
      nomeTorneo,
      dataTorneo,
      descrizione: descrizione || undefined,
      participants,
      regione,
      firstPlaceCombos: firstPlace,
      secondPlaceCombos: secondPlace,
      thirdPlaceCombos: thirdPlace,
    });
  };

  // Non-admins can access list view; add tab is gated below

  const renderComboInputs = (
    combos: ComboForm[],
    position: "first" | "second" | "third",
    icon: React.ReactNode,
    title: string,
  ) => (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-4">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        {combos.map((combo, idx) => (
          <div
            key={idx}
            className="space-y-3 pb-6 border-b last:border-b-0 last:pb-0"
          >
            <h4 className="font-medium text-sm text-muted-foreground">
              Combo {idx + 1}
            </h4>

            <div>
              <Label htmlFor={`${position}-${idx}-blade`}>Blade</Label>
              <Select
                value={combo.blade}
                onValueChange={(val) =>
                  updateCombo(position, idx, "blade", val)
                }
              >
                <SelectTrigger
                  id={`${position}-${idx}-blade`}
                  data-testid={`select-${position}-${idx}-blade`}
                >
                  <SelectValue placeholder="Select blade" />
                </SelectTrigger>
                <SelectContent>
                  {componentsData?.blades.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-assistBlade`}>
                Assist Blade
              </Label>
              <Select
                value={combo.assistBlade}
                onValueChange={(val) =>
                  updateCombo(position, idx, "assistBlade", val)
                }
                disabled={!isSingleWordBlade(combo.blade)}
              >
                <SelectTrigger
                  id={`${position}-${idx}-assistBlade`}
                  data-testid={`select-${position}-${idx}-assistBlade`}
                >
                  <SelectValue placeholder="Select assist blade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {componentsData?.assistBlades.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSingleWordBlade(combo.blade) && combo.blade && (
                <p className="text-xs text-muted-foreground mt-1">
                  Multi-word blades cannot use Assist Blades
                </p>
              )}
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-ratchet`}>Ratchet</Label>
              <Select
                value={combo.ratchet}
                onValueChange={(val) =>
                  updateCombo(position, idx, "ratchet", val)
                }
              >
                <SelectTrigger
                  id={`${position}-${idx}-ratchet`}
                  data-testid={`select-${position}-${idx}-ratchet`}
                >
                  <SelectValue placeholder="Select ratchet" />
                </SelectTrigger>
                <SelectContent>
                  {componentsData?.ratchets.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-bit`}>Bit</Label>
              <Select
                value={combo.bit}
                onValueChange={(val) => updateCombo(position, idx, "bit", val)}
              >
                <SelectTrigger
                  id={`${position}-${idx}-bit`}
                  data-testid={`select-${position}-${idx}-bit`}
                >
                  <SelectValue placeholder="Select bit" />
                </SelectTrigger>
                <SelectContent>
                  {componentsData?.bits.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-lockChip`}>Lock Chip</Label>
              <Select
                value={combo.lockChip}
                onValueChange={(val) =>
                  updateCombo(position, idx, "lockChip", val)
                }
                disabled={!isSingleWordBlade(combo.blade)}
              >
                <SelectTrigger
                  id={`${position}-${idx}-lockChip`}
                  data-testid={`select-${position}-${idx}-lockChip`}
                >
                  <SelectValue placeholder="Select lock chip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {componentsData?.lockChips.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSingleWordBlade(combo.blade) && combo.blade && (
                <p className="text-xs text-muted-foreground mt-1">
                  Multi-word blades cannot use Lock Chips
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  // List view state and data
  type TorneoCard = {
    torneoId: string;
    nomeTorneo: string;
    dataTorneo: string | Date;
    numeroPartecipanti: number;
    descrizione: string | null;
    regione: string;
  };

  const { data: tournamentsData, refetch: refetchTournaments } = useQuery<{ tournaments: TorneoCard[] }>({
    queryKey: ["/api/admin/tournaments"],
    enabled: activeTab === 'list',
  });

  // Selection state and results fetching for dialog
  const [selectedTournament, setSelectedTournament] = useState<TorneoCard | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filters for list view
  const [searchTerm, setSearchTerm] = useState("");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>("");

  const { data: resultsData, isLoading: resultsLoading, refetch: refetchResults } = useQuery<{
    firstPlaceCombos: any[];
    secondPlaceCombos: any[];
    thirdPlaceCombos: any[];
  }>({
    queryKey: ["/api/admin/tournaments", selectedTournament?.torneoId, "results"],
    queryFn: async () => {
      const id = selectedTournament?.torneoId;
      const resp = await fetch(`/api/admin/tournaments/${id}/results`);
      if (!resp.ok) throw new Error("Failed to fetch tournament results");
      return resp.json();
    },
    enabled: dialogOpen && !!selectedTournament?.torneoId,
  });

  const openTournamentDialog = (t: TorneoCard) => {
    setSelectedTournament(t);
    setDialogOpen(true);
    setTimeout(() => refetchResults(), 0);
  };

  useEffect(() => {
    if (activeTab === 'list') {
      refetchTournaments();
    }
  }, [activeTab, refetchTournaments]);

  const renderListView = () => {
    const tournaments = tournamentsData?.tournaments ?? [];
    const filtered = tournaments.filter((t) => {
      const nameOk =
        !searchTerm ||
        t.nomeTorneo.toLowerCase().includes(searchTerm.trim().toLowerCase());
      const d = new Date(t.dataTorneo);
      const startOk = !startDateFilter || d >= new Date(startDateFilter);
      const endOk = !endDateFilter || d <= new Date(endDateFilter);
      const regionOk = !regionFilter || t.regione === regionFilter;
      return nameOk && startOk && endOk && regionOk;
    });
    return (
      <div className="space-y-4">
        {/* Compact filter bar */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="filter-name" className="sr-only">Tournament name</Label>
            <Input
              id="filter-name"
              aria-label="Tournament name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca..."
              className="h-9 text-sm"
            />
          </div>
          <div className="w-[160px] space-y-1">
            <Input
              id="filter-start"
              aria-label="Dal"
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="w-[160px] space-y-1">
            <Input
              id="filter-end"
              aria-label="Al"
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          {/* Region dropdown filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-9 px-3 text-sm">
                {regionFilter ? `Regione: ${regionFilter}` : "Regioni"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Seleziona regione</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={regionFilter} onValueChange={(val) => setRegionFilter(val)}>
                {ITALIAN_REGIONS.map((r) => (
                  <DropdownMenuRadioItem key={r} value={r}>{r}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRegionFilter("")}>Tutte le regioni</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3 text-sm"
            onClick={() => {
              setSearchTerm("");
              setStartDateFilter("");
              setEndDateFilter("");
              setRegionFilter("");
            }}
          >
            <Eraser className="w-4 h-4" aria-label="Clear filters" />
            <span className="sr-only">Pulisci filtri</span>
          </Button>
        </div>

        {tournaments.length === 0 ? (
          <Card className="p-6">
            <p className="text-muted-foreground">Nessun torneo trovato.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(filtered.length > 0 ? filtered : []).map((t) => (
              <Card key={t.torneoId} className="overflow-hidden cursor-pointer" onClick={() => openTournamentDialog(t)}>
                <CardHeader className="pb-2">
                  <h3 className="text-base font-semibold">{t.nomeTorneo}</h3>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.dataTorneo), 'dd MMM yyyy')}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Partecipanti</span>
                    <span className="text-sm font-medium">{t.numeroPartecipanti}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm">Regione</span>
                    <span className="text-sm font-medium">{t.regione}</span>
                  </div>
                  {t.descrizione && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{t.descrizione}</p>
                  )}
                  {/* Placeholder for future filters and per-card dialog */}
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && tournaments.length > 0 && (
              <Card className="p-6 sm:col-span-2">
                <p className="text-sm text-muted-foreground">
                  Nessun torneo corrisponde ai filtri selezionati.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Dialog with tournament combos for top placements */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {selectedTournament ? selectedTournament.nomeTorneo : "Dettagli torneo"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {selectedTournament ? format(new Date(selectedTournament.dataTorneo), 'dd MMM yyyy') : ''}
              </p>
            </DialogHeader>

            {/* Scrollable content container to handle many combos */}
            <div className="max-h-[70vh] overflow-y-auto pr-1">
            {resultsLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-24 bg-muted/30 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : resultsData ? (
              <div className="space-y-4">
                {/* First Place */}
                {resultsData.firstPlaceCombos.length > 0 && (
                  <Card>
                    <CardHeader className="space-y-0.5 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-500" /> 1° Posto
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {resultsData.firstPlaceCombos.map((combo, idx) => (
                        <div key={`first-${idx}`} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
                          <p className="text-xs font-semibold text-muted-foreground">Combo {idx + 1}</p>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-12 h-12 shrink-0">
                              <ComponentImage folder="blades" name={combo.blade} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-muted-foreground">Blade:</span> <span className="text-xs font-medium">{combo.blade}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-muted-foreground">Assist:</span> {combo.assistBlade}</div>
                            <div><span className="text-muted-foreground">Ratchet:</span> {combo.ratchet}</div>
                            <div><span className="text-muted-foreground">Bit:</span> {combo.bit}</div>
                            <div className="col-span-2"><span className="text-muted-foreground">Chip:</span> {combo.lockChip}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Second Place */}
                {resultsData.secondPlaceCombos.length > 0 && (
                  <Card>
                    <CardHeader className="space-y-0.5 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Medal className="w-4 h-4 text-gray-400" /> 2° Posto
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {resultsData.secondPlaceCombos.map((combo, idx) => (
                        <div key={`second-${idx}`} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
                          <p className="text-xs font-semibold text-muted-foreground">Combo {idx + 1}</p>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-12 h-12 shrink-0">
                              <ComponentImage folder="blades" name={combo.blade} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-muted-foreground">Blade:</span> <span className="text-xs font-medium">{combo.blade}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-muted-foreground">Assist:</span> {combo.assistBlade}</div>
                            <div><span className="text-muted-foreground">Ratchet:</span> {combo.ratchet}</div>
                            <div><span className="text-muted-foreground">Bit:</span> {combo.bit}</div>
                            <div className="col-span-2"><span className="text-muted-foreground">Chip:</span> {combo.lockChip}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Third Place */}
                {resultsData.thirdPlaceCombos.length > 0 && (
                  <Card>
                    <CardHeader className="space-y-0.5 pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-600" /> 3° Posto
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {resultsData.thirdPlaceCombos.map((combo, idx) => (
                        <div key={`third-${idx}`} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
                          <p className="text-xs font-semibold text-muted-foreground">Combo {idx + 1}</p>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-12 h-12 shrink-0">
                              <ComponentImage folder="blades" name={combo.blade} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-muted-foreground">Blade:</span> <span className="text-xs font-medium">{combo.blade}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-muted-foreground">Assist:</span> {combo.assistBlade}</div>
                            <div><span className="text-muted-foreground">Ratchet:</span> {combo.ratchet}</div>
                            <div><span className="text-muted-foreground">Bit:</span> {combo.bit}</div>
                            <div className="col-span-2"><span className="text-muted-foreground">Chip:</span> {combo.lockChip}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="p-6">
                <p className="text-sm text-muted-foreground">Nessun risultato trovato per questo torneo.</p>
              </Card>
            )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Tournament" action={<HeaderLogo />} />

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Tabs: Add tournament / See tournaments (shared UI component) */}
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'add'|'list')} className="w-full">
          {user?.isAdmin && (
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="add" data-testid="tab-add-tournament">
                Add tournament
              </TabsTrigger>
              <TabsTrigger value="list" data-testid="tab-see-tournaments">
                See tournaments
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="list" className="space-y-4">
            {renderListView()}
          </TabsContent>

          {user?.isAdmin && (
          <TabsContent value="add" className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Informazioni torneo</h3>
              </CardHeader>
              <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="nomeTorneo">Nome torneo</Label>
                  <Input
                    id="nomeTorneo"
                    value={nomeTorneo}
                    onChange={(e) => setNomeTorneo(e.target.value)}
                    placeholder="Es. Meta Cup"
                  />
                </div>
                <div>
                  <Label htmlFor="dataTorneo">Data torneo</Label>
                  <Input
                    id="dataTorneo"
                    type="date"
                    value={dataTorneo}
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <Label htmlFor="regione">Regione</Label>
                  <Select value={regione} onValueChange={(val) => setRegione(val)}>
                    <SelectTrigger id="regione" data-testid="select-regione">
                      <SelectValue placeholder="Seleziona regione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ITALIAN_REGIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mb-4">
                <Label htmlFor="descrizione">Descrizione (opzionale)</Label>
                <Input
                  id="descrizione"
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  placeholder="Note o dettagli del torneo"
                />
              </div>
              <div>
                <Label htmlFor="participants">Numero dei partecipanti</Label>
                <Input
                  id="participants"
                  type="number"
                  min="6"
                  max="200"
                  value={participants || ""}
                  onChange={(e) =>
                    setParticipants(parseInt(e.target.value) || 0)
                  }
                  placeholder="da 6 a 200"
                  data-testid="input-participants"
                />
              </div>
            </CardContent>
          </Card>

          {renderComboInputs(
            firstPlace,
            "first",
            <Trophy className="w-5 h-5 text-yellow-500" />,
            "1st Place",
          )}
          {renderComboInputs(
            secondPlace,
            "second",
            <Medal className="w-5 h-5 text-gray-400" />,
            "2nd Place",
          )}
            {renderComboInputs(
              thirdPlace,
              "third",
              <Award className="w-5 h-5 text-amber-600" />,
              "3rd Place",
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitMutation.isPending}
              data-testid="button-submit-tournament"
            >
              {submitMutation.isPending
                ? "Submitting..."
                : "Submit Tournament Results"}
            </Button>
            </form>
          </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
