import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
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
import { Lock, Trophy, Medal, Award, Eraser, ChevronsUpDown, Loader2, User, Pencil } from "lucide-react";
import { useLocation } from "wouter";
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

type SearchableSelectProps = {
  id: string;
  testId?: string;
  value: string;
  onSelect: (val: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  includeNone?: boolean;
};

function SearchableSelect({
  id,
  testId,
  value,
  onSelect,
  options,
  placeholder,
  disabled = false,
  includeNone = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const shownOptions = includeNone ? ["None", ...options] : options;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          id={id}
          data-testid={testId}
          disabled={disabled}
        >
          {value || placeholder}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[280px]">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Names">
              {shownOptions.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(val) => {
                    onSelect(val);
                    setOpen(false);
                  }}
                >
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Tournaments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'add'|'list'>('list');
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
              <SearchableSelect
                id={`${position}-${idx}-blade`}
                testId={`select-${position}-${idx}-blade`}
                value={combo.blade}
                placeholder="Select blade"
                options={componentsData?.blades || []}
                onSelect={(val) => updateCombo(position, idx, "blade", val)}
              />
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-assistBlade`}>
                Assist Blade
              </Label>
              <SearchableSelect
                id={`${position}-${idx}-assistBlade`}
                testId={`select-${position}-${idx}-assistBlade`}
                value={combo.assistBlade}
                placeholder="Select assist blade"
                options={componentsData?.assistBlades || []}
                includeNone
                disabled={editCombos[idx]?.blade?.includes(' ')}
                onSelect={(val) => updateCombo(position, idx, "assistBlade", val)}
              />
              {editCombos[idx]?.blade?.includes(' ') && (
                <p className="text-xs text-muted-foreground mt-1">Multi-word blades cannot use Assist Blades</p>
              )}
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-ratchet`}>Ratchet</Label>
              <SearchableSelect
                id={`${position}-${idx}-ratchet`}
                testId={`select-${position}-${idx}-ratchet`}
                value={combo.ratchet}
                placeholder="Select ratchet"
                options={componentsData?.ratchets || []}
                onSelect={(val) => updateCombo(position, idx, "ratchet", val)}
              />
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-bit`}>Bit</Label>
              <SearchableSelect
                id={`${position}-${idx}-bit`}
                testId={`select-${position}-${idx}-bit`}
                value={combo.bit}
                placeholder="Select bit"
                options={componentsData?.bits || []}
                onSelect={(val) => updateCombo(position, idx, "bit", val)}
              />
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-lockChip`}>Lock Chip</Label>
              <SearchableSelect
                id={`${position}-${idx}-lockChip`}
                testId={`select-${position}-${idx}-lockChip`}
                value={combo.lockChip}
                placeholder="Select lock chip"
                options={componentsData?.lockChips || []}
                includeNone
                disabled={!isSingleWordBlade(editCombos[idx]?.blade || '')}
                onSelect={(val) => updateCombo(position, idx, "lockChip", val)}
              />
              {editCombos[idx]?.blade?.includes(' ') && (
                <p className="text-xs text-muted-foreground mt-1">Multi-word blades cannot use Lock Chips</p>
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
    dataTorneo?: string | Date | null;
    description?: string;
    state?: string;
    contactUrl?: string;
    idSuffix?: string | null;
    gameTitle?: { id: string; slug: string; title: string };
  };

  // Filters for list view (used for external fetch)
  const [searchTerm, setSearchTerm] = useState("");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>("");

  const { data: tournamentsData, refetch: refetchTournaments, isLoading: tournamentsLoading } = useQuery<{ tournaments: TorneoCard[] }>({
    queryKey: ["/api/challengermode/leaderboards", startDateFilter || ""],
    queryFn: async () => {
      const afterIso = startDateFilter
        ? new Date(startDateFilter).toISOString()
        : "2024-01-01T00:00:00Z";
      const resp = await fetch(`/api/challengermode/leaderboards?after=${encodeURIComponent(afterIso)}`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to fetch tournaments");
      const json = await resp.json();
      const ext = (json?.tournaments ?? []) as any[];
      const mapped: TorneoCard[] = ext.map((t) => ({
        torneoId: t.id,
        nomeTorneo: t.name,
        dataTorneo: t?.schedule?.startedAt ? new Date(t.schedule.startedAt) : null,
        description: t.description ?? undefined,
        state: t.state ?? undefined,
        contactUrl: t.contactUrl ?? undefined,
        idSuffix: t.idSuffix ?? null,
        gameTitle: t.gameTitle ?? undefined,
      }));
      return { tournaments: mapped };
    },
    enabled: activeTab === 'list',
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  // Selection state and dialog
  // Dialog replaced by route-based detail page

  // Admin: player combo editor state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; username: string } | null>(null);
  const [editCombos, setEditCombos] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  // Admin combo editor dialog moved to TournamentDetail route

  // Keep local editCombos for add-results form only

  const updateEditCombo = (index: number, field: keyof ComboForm, value: string) => {
    setEditCombos((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const updated = { ...c, [field]: value };
        // If blade has a space, it's a single-piece; clear assist blade and lock chip
        if (field === 'blade' && value.includes(' ')) {
          updated.assistBlade = '';
          updated.lockChip = '';
        }
        return updated;
      })
    );
  };

  // Save mutation not used on list page

  // Fetch external tournament leaderboard/details when dialog opens
  // Detail query removed; handled in TournamentDetail page


  const openTournamentDialog = (t: TorneoCard) => {
    setLocation(`/tournaments/${t.torneoId}`);
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
      const dVal = t.dataTorneo ? new Date(t.dataTorneo) : null;
      const startOk = !startDateFilter || (dVal && dVal >= new Date(startDateFilter));
      const endOk = !endDateFilter || (dVal && dVal <= new Date(endDateFilter));
      // Region is not available from Challengermode API; ignore if absent
      const regionOk = true;
      return nameOk && (!!dVal ? (startOk && endOk) : true) && regionOk;
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

        {tournamentsLoading ? (
          <Card className="p-6 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </Card>
        ) : tournaments.length === 0 ? (
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
                    {t.dataTorneo ? format(new Date(t.dataTorneo), 'dd MMM yyyy') : (t.state || 'Completed tournament')}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  {t.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  {t.contactUrl && (
                    <p className="mt-2 text-xs">
                      <a className="text-blue-600 hover:underline" href={t.contactUrl} target="_blank" rel="noreferrer">Contatti / Info</a>
                    </p>
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

        {/* Tournament detail dialog removed; navigate to dedicated page */}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Tournament" action={<HeaderLogo />} />

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Single list view; admins can edit combos from player dialog */}
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'list')} className="w-full">

          <TabsContent value="list" className="space-y-4">
            {renderListView()}
          </TabsContent>

          
        </Tabs>
      </main>
    </div>
  );
}
