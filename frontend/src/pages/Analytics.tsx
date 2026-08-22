import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "../components/PageHeader";
import { HeaderLogo } from "../components/HeaderLogo";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  Filter,
  X,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Seo } from "@/components/Seo";
import type { ComboStats } from "@/types/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { DesktopAnalyticsGrid } from "@/components/analytics/desktop/DesktopAnalyticsGrid";

const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#0088FE"];

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ComboResponse {
  combos: ComboStats[];
  pagination: PaginationMeta;
}

const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(
  /\/$/,
  "",
);

if (!PUBLIC_MINIO_URL) {
  console.error(
    "VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.",
  );
}

const imageCache = new Map<string, string>();

function ComponentImage({ folder, name, priority = false }: { folder: string; name: string; priority?: boolean }) {
  const cacheKey = `${folder}/${name}`;
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [currentSrc, setCurrentSrc] = useState<string | null>(() => {
    return imageCache.get(cacheKey) || null;
  });

  const getImageVariations = (name: string, format: "png" | "webp") => {
    const variations = [
      name.toLowerCase().replace(/\s+/g, ""),
      name.toLowerCase().replace(/\s+/g, "-"),
      name
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/\s+/g, "-"),
    ];
    return variations.map(
      (v) => `${PUBLIC_MINIO_URL}/${folder}/${v}.${format}`,
    );
  };

  const allAttempts = useMemo(() => [
    ...getImageVariations(name, "webp"),
    ...getImageVariations(name, "png"),
  ], [name, folder]);

  useEffect(() => {
    if (!currentSrc && attemptIndex < allAttempts.length) {
      setCurrentSrc(allAttempts[attemptIndex]);
    }
  }, [attemptIndex, allAttempts, currentSrc]);

  const handleImageError = () => {
    if (attemptIndex < allAttempts.length - 1) {
      setAttemptIndex((prev) => prev + 1);
      setCurrentSrc(null); // Trigger effect to set next src
    }
  };

  const handleImageLoad = () => {
    if (currentSrc) {
      imageCache.set(cacheKey, currentSrc);
    }
  };

  return (
    <div className="aspect-square bg-muted rounded-md overflow-hidden flex items-center justify-center">
      {attemptIndex >= allAttempts.length && !currentSrc ? (
        <div className="text-center p-1">
          <p className="text-xs text-muted-foreground">N/A</p>
        </div>
      ) : (
        <img
          key={currentSrc || "loading"}
          src={currentSrc || ""}
          alt={name}
          className="w-full h-full object-contain"
          onError={handleImageError}
          onLoad={handleImageLoad}
          style={{ display: currentSrc ? 'block' : 'none' }}
          {...(priority ? { fetchPriority: "high", loading: "eager" } : {})}
        />
      )}
    </div>
  );
}

export default function Analytics() {
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const ssQ = sessionStorage.getItem("analytics_q");
    return (q ?? ssQ ?? "");
  });

  const [sortBy, setSortBy] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const sort = params.get("sort");
    const ssSort = sessionStorage.getItem("analytics_sort");
    return (sort ?? ssSort ?? "score");
  });

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const params = new URLSearchParams(window.location.search);
    const order = params.get("order");
    const ssOrder = sessionStorage.getItem("analytics_order");
    return ((order ?? ssOrder ?? "desc") as "asc" | "desc");
  });
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const pStr = params.get("page");
    let p = pStr ? parseInt(pStr, 10) : NaN;
    if (Number.isNaN(p) || p <= 0) {
      const ss = sessionStorage.getItem("analytics_page");
      p = ss ? parseInt(ss, 10) : 1;
    }
    return (!Number.isNaN(p) && p > 0) ? p : 1;
  });

  const [tempSearchTerm, setTempSearchTerm] = useState("");
  const [tempSortBy, setTempSortBy] = useState("score");
  const [tempSortOrder, setTempSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedSeason, setSelectedSeason] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const season = params.get("season");
    const ssSeason = sessionStorage.getItem("analytics_season");
    return (season ?? ssSeason ?? "All Time");
  });
  const [tempSelectedSeason, setTempSelectedSeason] = useState<string>('All Time');

  const [activeView, setActiveView] = useState<"leaderboard" | "trends">(
    "leaderboard",
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, sortOrder]);



  useEffect(() => {
    const base = "/analytics";
    const params = new URLSearchParams(window.location.search || "");
    params.set("page", String(currentPage));
    sessionStorage.setItem("analytics_page", String(currentPage));
    setLocation(`${base}?${params.toString()}`, { replace: true });
  }, [currentPage]);

  useEffect(() => {
    const base = "/analytics";
    const params = new URLSearchParams(window.location.search || "");
    if (searchTerm) {
      params.set("q", searchTerm);
    } else {
      params.delete("q");
    }
    params.set("sort", sortBy);
    params.set("order", sortOrder);
    params.set("season", selectedSeason);
    sessionStorage.setItem("analytics_q", searchTerm);
    sessionStorage.setItem("analytics_sort", sortBy);
    sessionStorage.setItem("analytics_order", sortOrder);
    sessionStorage.setItem("analytics_season", selectedSeason);
    setLocation(`${base}?${params.toString()}`, { replace: true });
  }, [searchTerm, sortBy, sortOrder, selectedSeason]);

  const { data, isLoading } = useQuery<ComboResponse>({
    queryKey: ["/api/stats/combos", searchTerm, sortBy, sortOrder, selectedSeason, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      params.append("sortBy", sortBy);
      params.append("sortOrder", sortOrder);
      params.append("season", selectedSeason);
      params.append("page", currentPage.toString());
      params.append("limit", "20");

      const response = await fetch(`/api/stats/combos?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch combos");
      return response.json();
    },
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ["/api/trends", "count", "week", selectedSeason],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("metric", "count");
      params.append("granularity", "week");
      if (selectedSeason) {
        params.append("season", selectedSeason);
      }
      const res = await fetch(`/api/trends?${params.toString()}`);
      return res.json();
    },
  });

  // Fallback names source from backend components lists
  const { data: seasonsData } = useQuery<{ seasons: string[] }>({
    queryKey: ["/api/seasons"],
    queryFn: async () => {
      const resp = await fetch("/api/seasons");
      if (!resp.ok) throw new Error("Failed to fetch seasons");
      return resp.json();
    },
  });

  const { data: componentsData } = useQuery({
    queryKey: ["components"],
    queryFn: async () => {
      const res = await fetch("/api/components");
      if (!res.ok) throw new Error("Failed to fetch components");
      return res.json();
    },
  });

  const [selectedComponent, setSelectedComponent] = useState('blade');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedPieceName, setSelectedPieceName] = useState<string | null>(null);

  const folderMap: Record<string, string> = {
    blade: "blades",
    "assist-blade": "assist-blades",
    ratchet: "ratchets",
    bit: "bits",
    "lock-chip": "chips",
  };

  const availableNames = useMemo(() => {
    const namesFromTrends = Array.from(
      new Set(
        ((trendsData || []) as any[])
          .filter((d: any) => d.component_type === selectedComponent)
          .map((d: any) => d.name),
      ),
    ).sort();

    if (namesFromTrends.length > 0) return namesFromTrends;

    // Fallback to components list when trends are empty for the selected type
    if (!componentsData) return [];
    const mapKey: Record<string, string> = {
      blade: "blades",
      "assist-blade": "assistBlades",
      ratchet: "ratchets",
      bit: "bits",
      "lock-chip": "lockChips",
    };
    const key = mapKey[selectedComponent] || "blades";
    const arr = (componentsData as any)[key] as string[] | undefined;
    return Array.isArray(arr) ? [...arr].sort() : [];
  }, [trendsData, componentsData, selectedComponent]);

  const handleComponentChange = (value: string) => {
    setSelectedComponent(value);
    setSelectedName(null);
    setSelectedPieceName(null);
  };

  const transformedData = useMemo(() => {
    if (!trendsData) return [];

    const filtered = (trendsData as any[]).filter(
      (d: any) => d.component_type === selectedComponent,
    );

    const months = [...new Set(filtered.map((d: any) => d.month))].sort();

    if (!selectedName) return [];

    return months.map((month) => {
      const monthData: any = { month };
      const dataPoint = filtered.find(
        (d: any) => d.month === month && d.name === selectedName,
      );
      monthData[selectedName] = dataPoint ? dataPoint.total_points : 0;
      return monthData;
    });
  }, [trendsData, selectedComponent, selectedName]);

  const handleOpenFilterModal = () => {
    setTempSearchTerm(searchTerm);
    setTempSortBy(sortBy);
    setTempSortOrder(sortOrder);
    setTempSelectedSeason(selectedSeason);
    setFilterModalOpen(true);
  };

  // Fetch synergy data when a piece name is selected
  const { data: synergyData, isLoading: synergyLoading } = useQuery({
    queryKey: ["/api/synergy", selectedComponent, selectedPieceName],
    enabled: !!selectedPieceName,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("type", selectedComponent);
      params.append("name", selectedPieceName!);
      const res = await fetch(`/api/synergy?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch synergy data");
      return res.json();
    },
  });

  const handleApplyFilters = () => {
    setSearchTerm(tempSearchTerm);
    setSortBy(tempSortBy);
    setSortOrder(tempSortOrder);
    setSelectedSeason(tempSelectedSeason);
    setFilterModalOpen(false);
  };

  const handleClearFilters = () => {
    setTempSearchTerm("");
    setTempSortBy("score");
    setTempSortOrder("desc");
    setTempSelectedSeason("All Time");
    setSearchTerm("");
    setSortBy("score");
    setSortOrder("desc");
    setSelectedSeason("All Time");
    setFilterModalOpen(false);
  };

  const hasActiveFilters =
    searchTerm !== "" || sortBy !== "score" || sortOrder !== "desc" || selectedSeason !== "All Time";

  const getRankIcon = (index: number) => {
    if (currentPage !== 1) return null;
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-600" />;
    return null;
  };

  const getRankBadge = (index: number) => {
    const page = data?.pagination?.page ?? 1;
    const limit = data?.pagination?.limit ?? 20;
    const overall = (page - 1) * limit + index + 1;
    if (currentPage !== 1) return <Badge variant="outline">{overall}</Badge>;
    if (index === 0)
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">1st</Badge>;
    if (index === 1)
      return <Badge className="bg-gray-400 hover:bg-gray-500">2nd</Badge>;
    if (index === 2)
      return <Badge className="bg-amber-600 hover:bg-amber-700">3rd</Badge>;
    return <Badge variant="outline">{index + 1}</Badge>;
  };

  const getComboId = (combo: ComboStats) => {
    return [
      combo.blade,
      combo.assistBlade,
      combo.ratchet,
      combo.bit,
      combo.lockChip,
    ].join("|");
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <Seo
        title="Analisi Metagame e Combo X · Beybladexmeta Analytics"
        description="Analizza le performance delle combinazioni Blade, Ratchet e Bit. Scopri quali combo dominano i tornei e quali sono i trend emergenti."
      />
      <PageHeader
        title="Classifiche"
        description="Esplora le statistiche dettagliate derivate dai tornei Challengermode e Challonge. Cerca combo specifiche e esplora la classifica."
        action={<HeaderLogo />}
      />

      <main className="flex-1 px-4 py-4 w-full max-w-[1400px] mx-auto space-y-6">
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "leaderboard" | "trends")} defaultValue="leaderboard" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:hidden">
            <TabsTrigger value="leaderboard">Top Combos</TabsTrigger>
            <TabsTrigger value="trends">Analisi Trend</TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard">
            <Card className="p-4">
              {/* Desktop Search Bar */}
              <div className="hidden md:flex mb-4 gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca per blade, assist blade, ratchet, bit, o chip..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                    data-testid="input-desktop-search"
                  />
                </div>
                <Button
                  variant="outline"
                  className="relative"
                  onClick={handleOpenFilterModal}
                  data-testid="button-filter-desktop"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filtri
                  {hasActiveFilters && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap flex-1 mr-2 min-h-[40px]">
                  <span className="text-xs text-muted-foreground mr-1">
                    Filtri attivi:
                  </span>
                  {!hasActiveFilters && (
                    <span className="text-xs text-muted-foreground">nessuno</span>
                  )}
                  {searchTerm && (
                    <Badge variant="secondary" className="text-xs">
                      Search: {searchTerm}
                    </Badge>
                  )}
                  {sortBy !== "score" && (
                    <Badge variant="secondary" className="text-xs">
                      Sort:{" "}
                      {sortBy === "first"
                        ? "1st Place"
                        : sortBy === "second"
                          ? "2nd Place"
                          : sortBy === "third"
                            ? "3rd Place"
                            : sortBy === "fourth"
                              ? "4th Place"
                              : "Date"}
                    </Badge>
                  )}
                  {sortOrder !== "desc" && (
                    <Badge variant="secondary" className="text-xs">
                      Ordine:{" "}
                      {sortOrder === "asc"
                        ? "Crescente"
                        : "Decrescente"}
                    </Badge>
                  )}
                  {selectedSeason !== "All Time" && (
                    <Badge variant="secondary" className="text-xs">
                      Stagione: {selectedSeason}
                    </Badge>
                  )}
                </div>

                <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="relative md:hidden"
                      onClick={handleOpenFilterModal}
                      data-testid="button-filter"
                    >
                      <Filter className="w-4 h-4" />
                      {hasActiveFilters && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                      )}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Filtra combo</DialogTitle>
                      <DialogDescription>
                        Cerca e filtra combo in base al posizionamento e ai
                        componenti.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2 md:hidden">
                        <Label htmlFor="search">Cerca</Label>
                        <Input
                          id="search"
                          placeholder="Cerca per blade, assist blade, ratchet, bit, o chip..."
                          value={tempSearchTerm}
                          onChange={(e) => setTempSearchTerm(e.target.value)}
                          data-testid="input-modal-search"
                        />
                        <p className="text-xs text-muted-foreground">
                          Filtra tra tutti i nomi dei componenti
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sort">Filtra in base a</Label>
                        <Select value={tempSortBy} onValueChange={setTempSortBy}>
                          <SelectTrigger
                            id="sort"
                            data-testid="select-modal-sort"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="score">Punteggio totale</SelectItem>
                            <SelectItem value="first">1° Posto</SelectItem>
                            <SelectItem value="second">2° Posto</SelectItem>
                            <SelectItem value="third">3° Posto</SelectItem>
                            <SelectItem value="fourth">4° Posto</SelectItem>
                            <SelectItem value="date">Data</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="order">Ordine visualizzazione</Label>
                        <Select
                          value={tempSortOrder}
                          onValueChange={(value) =>
                            setTempSortOrder(value as "asc" | "desc")
                          }
                        >
                          <SelectTrigger
                            id="order"
                            data-testid="select-modal-order"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="desc">Decrescente</SelectItem>
                            <SelectItem value="asc">Crescente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="season">Stagione</Label>
                        <Select value={tempSelectedSeason} onValueChange={setTempSelectedSeason}>
                          <SelectTrigger id="season" data-testid="select-modal-season">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="All Time">All Time</SelectItem>
                            <SelectItem value="Off Season 2025">Off Season 2025</SelectItem>
                            <SelectItem value="Season 2026">Season 2026</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Seleziona la stagione per filtrare la classifica
                        </p>
                      </div>
                    </div>

                    <DialogFooter className="flex-row gap-2 sm:gap-2">
                      <Button
                        variant="outline"
                        onClick={handleClearFilters}
                        className="flex-1"
                        data-testid="button-clear-filters"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Pulisci
                      </Button>
                      <Button
                        onClick={handleApplyFilters}
                        className="flex-1"
                        data-testid="button-apply-filters"
                      >
                        <Filter className="w-4 h-4 mr-2" />
                        Applica
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>



              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-24 bg-muted/30 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : data?.combos && data.combos.length > 0 ? (
                <>
                  {/* Desktop Grid View (>= 768px) */}
                  <div className="hidden md:block">
                    <DesktopAnalyticsGrid
                      combos={data?.combos || []}
                      currentPage={data?.pagination?.page || 1}
                      itemsPerPage={data?.pagination?.limit || 20}
                      getComboId={getComboId}
                      season={selectedSeason}
                      isLoading={isLoading}
                    />
                  </div>

                  {/* Mobile List View (< 768px) */}
                  <div className="space-y-3 md:hidden">
                    {data.combos.map((combo, index) => (
                      <Link
                        key={`${combo.blade}-${combo.assistBlade}-${combo.ratchet}-${combo.bit}-${combo.lockChip}`}
                        href={`/combo/${getComboId(combo)}?season=${encodeURIComponent(selectedSeason)}`} asChild
                      >
                        <a className="block no-underline" data-testid={`card-combo-${index}`}>
                          <Card className="p-4 hover-elevate active-elevate-2 cursor-pointer transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="flex flex-col items-center gap-1 min-w-[3rem]">
                                {getRankIcon(index)}
                                {getRankBadge(index)}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-16 h-16 shrink-0">
                                    <ComponentImage
                                      folder="blades"
                                      name={combo.blade}
                                      priority={index === 0}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0 max-[330px]:hidden">
                                    <p className="text-xs text-muted-foreground">
                                      Blade
                                    </p>
                                    <p
                                      className="text-sm font-medium truncate"
                                      data-testid={`text-blade-${index}`}
                                    >
                                      {combo.blade}
                                    </p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mb-3">
                                  {combo.assistBlade !== "None" && (
                                    <div className="flex items-center gap-2">
                                      <div className="w-10 h-10 shrink-0">
                                        <ComponentImage folder={folderMap['assist-blade']} name={combo.assistBlade} />
                                      </div>
                                      <div className="min-w-0 max-[330px]:hidden">
                                        <p className="text-xs text-muted-foreground">
                                          <span className="sm:hidden">As. Blade</span>
                                          <span className="hidden sm:inline">Assist Blade</span>
                                        </p>
                                        <p className="text-sm font-medium truncate">{combo.assistBlade}</p>
                                      </div>
                                    </div>
                                  )}
                                  {combo.ratchet !== 'None' && (
                                    <div className="flex items-center gap-2">
                                      <div className="w-10 h-10 shrink-0">
                                        <ComponentImage folder={folderMap['ratchet']} name={combo.ratchet} />
                                      </div>
                                      <div className="min-w-0 max-[330px]:hidden">
                                        <p className="text-xs text-muted-foreground">Ratchet</p>
                                        <p className="text-sm font-medium truncate">{combo.ratchet}</p>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <div className="w-10 h-10 shrink-0">
                                      <ComponentImage folder={folderMap['bit']} name={combo.bit} />
                                    </div>
                                    <div className="min-w-0 max-[330px]:hidden">
                                      <p className="text-xs text-muted-foreground">Bit</p>
                                      <p className="text-sm font-medium truncate">{combo.bit}</p>
                                    </div>
                                  </div>
                                  {combo.lockChip !== "None" && (
                                    <div className="col-span-2 flex items-center gap-2">
                                      <div className="w-10 h-10 shrink-0">
                                        <ComponentImage folder={folderMap['lock-chip']} name={combo.lockChip} />
                                      </div>
                                      <div className="min-w-0 max-[330px]:hidden">
                                        <p className="text-xs text-muted-foreground">Lock Chip</p>
                                        <p className="text-sm font-medium truncate">{combo.lockChip}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-4 pt-3 border-t border-border">
                                  <div className="text-center">
                                    <p className="text-xs text-muted-foreground">
                                      Score
                                    </p>
                                    <p
                                      className="text-lg font-bold text-primary"
                                      data-testid={`text-score-${index}`}
                                    >
                                      {combo.punteggioTotale.toLocaleString()}
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-muted-foreground">
                                      1st
                                    </p>
                                    <p className="text-sm font-semibold text-yellow-500">
                                      {combo.primiPosti}
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-muted-foreground">
                                      2nd
                                    </p>
                                    <p className="text-sm font-semibold text-gray-400">
                                      {combo.secondiPosti}
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-muted-foreground">
                                      3rd
                                    </p>
                                    <p className="text-sm font-semibold text-amber-600">
                                      {combo.terziPosti}
                                    </p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-xs text-muted-foreground">
                                      4th
                                    </p>
                                    <p className="text-sm font-semibold text-slate-500">
                                      {combo.quartiPosti}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Card>
                        </a>
                      </Link>
                    ))}

                  </div>
                </>
              ) : (
                <div className="py-12 text-center">
                  <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Dati assenti</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    I dati apparirano una volta che i tornei verranno registrati
                  </p>
                </div>
              )}

              {data?.combos && data.combos.length > 0 && data.pagination && (
                <div className="mt-6 space-y-3">
                  <div
                    className="text-center text-sm text-muted-foreground"
                    data-testid="text-pagination-info"
                  >
                    Pagina {data.pagination.page} di {data.pagination.totalPages} (
                    {data.pagination.total.toLocaleString()} combo)
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      data-testid="button-first-page"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>

                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      data-testid="button-previous-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setCurrentPage((prev) =>
                          Math.min(data.pagination.totalPages, prev + 1)
                        )
                      }
                      disabled={currentPage === data.pagination.totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>

                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setCurrentPage(data.pagination.totalPages)
                      }
                      disabled={currentPage === data.pagination.totalPages}
                      data-testid="button-last-page"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="trends">
            <div className="bg-card p-6 rounded-lg shadow-md">
              <div className="flex flex-col mb-4 gap-3">
                <div>
                  <p className="text-muted-foreground">
                    Utilizzo settimanale dei componenti (conteggio).
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <Select
                    value={selectedComponent}
                    onValueChange={handleComponentChange}
                  >
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Component" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blade">Blade</SelectItem>
                      <SelectItem value="assist-blade">Assist Blade</SelectItem>
                      <SelectItem value="ratchet">Ratchet</SelectItem>
                      <SelectItem value="bit">Bit</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedSeason}
                    onValueChange={setSelectedSeason}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Select Season" />
                    </SelectTrigger>
                    <SelectContent>
                      {(seasonsData?.seasons || ["Season 2026", "All Time", "Off Season 2025"]).map((season) => (
                        <SelectItem key={season} value={season}>
                          {season}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-[200px] min-w-0 justify-start truncate">
                        {selectedName || "Seleziona componente..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[calc(100vw-2rem)] sm:w-[280px]">
                      <Command>
                        <CommandInput placeholder="Search component name..." />
                        <CommandList>
                          <CommandEmpty>No results found.</CommandEmpty>
                          <CommandGroup heading="Names">
                            {availableNames.map((name: string) => (
                              <CommandItem
                                key={name}
                                onSelect={() => {
                                  setSelectedName(name);
                                  setSelectedPieceName(name);
                                }}
                              >
                                {name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {trendsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : !selectedName ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  Seleziona un componente per vederne il trend.
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={transformedData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip
                        wrapperStyle={{ outline: 'none' }}
                        contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', color: 'var(--popover-foreground)' }}
                        labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                        itemStyle={{ color: 'var(--popover-foreground)' }}
                      />
                      <Legend content={() => null} />
                      {transformedData.length > 0 &&
                        Object.keys(transformedData[0])
                          .filter((key) => key !== "month")
                          .map((key, index) => (
                            <Line
                              key={key}
                              type="monotone"
                              dataKey={key}
                              stroke={colors[index % colors.length]}
                            />
                          ))}
                    </LineChart>
                  </ResponsiveContainer>
                  {selectedName && (
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <div className="w-14 h-12">
                        <ComponentImage key={`${selectedComponent}-${selectedName}`} folder={folderMap[selectedComponent]} name={selectedName} />
                      </div>
                      <span className="text-sm text-muted-foreground truncate max-w-[200px]">{selectedName}</span>
                    </div>
                  )}

                  {selectedPieceName && (
                    <div className="mt-6">
                      <h3 className="text-muted-foreground mb-3">Componenti spesso usati assieme</h3>
                      {synergyLoading ? (
                        <div className="text-muted-foreground text-sm">Caricamento suggerimenti...</div>
                      ) : synergyData ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {synergyData.topBlades && synergyData.topBlades.length > 0 && (
                            <Card className="p-4">
                              <div className="font-semibold mb-2">Blade</div>
                              <div className="space-y-3">
                                {synergyData.topBlades.slice(0, 5).map((it: any) => (
                                  <div key={it.name} className="flex items-center justify-between gap-4 py-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-10 h-8 shrink-0">
                                        <ComponentImage folder={folderMap['blade']} name={it.name} />
                                      </div>
                                      <span className="text-sm truncate">{it.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{Math.round(it.points)}</span>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          )}

                          {synergyData.topAssistBlades && synergyData.topAssistBlades.length > 0 && (
                            <Card className="p-4">
                              <div className="font-semibold mb-2">Assist Blade</div>
                              <div className="space-y-3">
                                {synergyData.topAssistBlades.slice(0, 5).map((it: any) => (
                                  <div key={it.name} className="flex items-center justify-between gap-4 py-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-10 h-8 shrink-0">
                                        <ComponentImage folder={folderMap['assist-blade']} name={it.name} />
                                      </div>
                                      <span className="text-sm truncate">{it.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{Math.round(it.points)}</span>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          )}

                          {synergyData.topRatchets && synergyData.topRatchets.length > 0 && (
                            <Card className="p-4">
                              <div className="font-semibold mb-2">Ratchet</div>
                              <div className="space-y-3">
                                {synergyData.topRatchets.slice(0, 5).map((it: any) => (
                                  <div key={it.name} className="flex items-center justify-between gap-4 py-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-10 h-8 shrink-0">
                                        <ComponentImage folder={folderMap['ratchet']} name={it.name} />
                                      </div>
                                      <span className="text-sm truncate">{it.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{Math.round(it.points)}</span>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          )}

                          {synergyData.topBits && synergyData.topBits.length > 0 && (
                            <Card className="p-4">
                              <div className="font-semibold mb-2">Bit</div>
                              <div className="space-y-3">
                                {synergyData.topBits.slice(0, 5).map((it: any) => (
                                  <div key={it.name} className="flex items-center justify-between gap-4 py-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-10 h-8 shrink-0">
                                        <ComponentImage folder={folderMap['bit']} name={it.name} />
                                      </div>
                                      <span className="text-sm truncate">{it.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{Math.round(it.points)}</span>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          )}

                          {synergyData.topLockChips && synergyData.topLockChips.length > 0 && (
                            <Card className="p-4">
                              <div className="font-semibold mb-2">Lock Chip</div>
                              <div className="space-y-3">
                                {synergyData.topLockChips.slice(0, 5).map((it: any) => (
                                  <div key={it.name} className="flex items-center justify-between gap-4 py-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-10 h-8 shrink-0">
                                        <ComponentImage folder={folderMap['lock-chip']} name={it.name} />
                                      </div>
                                      <span className="text-sm truncate">{it.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{Math.round(it.points)}</span>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div >
  );
}
