import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { formatDataBreve } from "@/lib/date";
import { markdownATestoSemplice, statoTorneoInItaliano } from "@/lib/text";
import { Eraser, Loader2, CheckCircle, AlertCircle, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Filter } from "lucide-react";





export default function Tournaments() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'add' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [infoOpen, setInfoOpen] = useState(false);





  // Sanitize URL to prevent XSS - only allow http/https protocols
  const sanitizeImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      // Only allow http and https protocols
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return url;
      }
      return null;
    } catch {
      // Invalid URL
      return null;
    }
  };

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






  // Non-admins can access list view; add tab is gated below

  type TorneoCard = {
    torneoId: string;
    nomeTorneo: string;
    dataTorneo?: string | Date | null;
    description?: string;
    state?: string;
    contactUrl?: string;
    idSuffix?: string | null;
    gameTitle?: { id: string; slug: string; title: string };
    hasCombos?: boolean;
    region?: string;
    city?: string | null;
    organizerName?: string;
    hosts?: {
      spaces?: Array<{
        name?: string | null;
        description?: string | null;
        slug?: string | null;
        id?: string | null;
        logo?: { url?: string | null; width?: number | null; height?: number | null } | null;
      } | null> | null;
    } | null;
  };

  // Filters for list view
  const [searchTerm, setSearchTerm] = useState("");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const DEFAULT_END_DATE = format(new Date(), "yyyy-MM-dd");
  const [endDateFilter, setEndDateFilter] = useState<string>(DEFAULT_END_DATE);
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");

  // Dialog Filter states
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<string>("");
  const [tempEndDate, setTempEndDate] = useState<string>(DEFAULT_END_DATE);
  const [tempRegion, setTempRegion] = useState<string>("");
  const [tempPlatform, setTempPlatform] = useState<string>("all");

  const handleOpenFilterDialog = () => {
    setTempStartDate(startDateFilter);
    setTempEndDate(endDateFilter);
    setTempRegion(selectedRegion);
    setTempPlatform(selectedPlatform);
    setIsFilterDialogOpen(true);
  };

  const handleApplyFilters = () => {
    setStartDateFilter(tempStartDate);
    setEndDateFilter(tempEndDate);
    setSelectedRegion(tempRegion);
    setSelectedPlatform(tempPlatform);
    setIsFilterDialogOpen(false);
  };

  const handleClearFilters = () => {
    setTempStartDate("");
    setTempEndDate(DEFAULT_END_DATE);
    setTempRegion("");
    setTempPlatform("all");

    setStartDateFilter("");
    setEndDateFilter(DEFAULT_END_DATE);
    setSelectedRegion("");
    setSelectedPlatform("all");
    setIsFilterDialogOpen(false);
  };

  const hasActiveFilters =
    startDateFilter !== "" ||
    endDateFilter !== DEFAULT_END_DATE ||
    selectedRegion !== "" ||
    selectedPlatform !== "all";

  const { data: tournamentsData, refetch: refetchTournaments, isLoading: tournamentsLoading } = useQuery<{ tournaments: TorneoCard[] }>({
    queryKey: ["/api/tournaments", startDateFilter || "", endDateFilter || "", selectedRegion || "", selectedPlatform || "all"],
    queryFn: async () => {
      const afterIso = startDateFilter
        ? new Date(startDateFilter).toISOString()
        : "2024-01-01T00:00:00Z";
      const qs = new URLSearchParams();
      if (afterIso) qs.set("after", afterIso);
      if (selectedRegion) qs.set("region", selectedRegion);
      if (selectedPlatform && selectedPlatform !== 'all') qs.set("platform", selectedPlatform);

      const resp = await fetch(`/api/tournaments?${qs.toString()}`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to fetch tournaments");
      const json = await resp.json();
      const ext = (json?.tournaments ?? []) as any[];
      const base: TorneoCard[] = ext.map((t) => ({
        torneoId: t.id,
        nomeTorneo: t.name,
        dataTorneo: t?.schedule?.startedAt ? String(t.schedule.startedAt).slice(0, 10) : null,
        description: t.description ?? undefined,
        state: t.state ?? undefined,
        contactUrl: t.contactUrl ?? undefined,
        idSuffix: t.idSuffix ?? null,
        gameTitle: t.gameTitle ?? undefined,
        hasCombos: t.hasCombos === true,
        region: t.region ?? undefined,
        city: t.city ?? null,
        organizerName: t.organizerName ?? undefined,
        hosts: t.hosts ?? undefined,
      }));
      return { tournaments: base };
    },
    enabled: activeTab === 'list',
  });

  // Selection state and dialog
  // Dialog replaced by route-based detail page


  // Admin combo editor dialog moved to TournamentDetail route

  // Keep local editCombos for add-results form only


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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDateFilter, endDateFilter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const pStr = params.get("page");
    let p = pStr ? parseInt(pStr, 10) : NaN;
    if (Number.isNaN(p) || p <= 0) {
      const ss = sessionStorage.getItem("tournaments_page");
      p = ss ? parseInt(ss, 10) : 1;
    }
    if (!Number.isNaN(p) && p > 0) setCurrentPage(p);

    const q = params.get("q");
    const start = params.get("start");
    const end = params.get("end");
    const region = params.get("region");
    const ssQ = sessionStorage.getItem("tournaments_q");
    const ssStart = sessionStorage.getItem("tournaments_start");
    const ssEnd = sessionStorage.getItem("tournaments_end");
    const ssRegion = sessionStorage.getItem("tournaments_region");
    const ssPlatform = sessionStorage.getItem("tournaments_platform");

    if (q !== null || ssQ !== null) setSearchTerm((q ?? ssQ ?? "") as string);
    if (start !== null || ssStart !== null) setStartDateFilter((start ?? ssStart ?? "") as string);
    // Default end date to today if missing
    setEndDateFilter((end ?? ssEnd ?? DEFAULT_END_DATE) as string);
    if (region !== null || ssRegion !== null) setSelectedRegion((region ?? ssRegion ?? "") as string);

    // Platform (URL param 'platform' or session 'tournaments_platform')
    const urlPlatform = params.get("platform");
    if (urlPlatform !== null || ssPlatform !== null) {
      setSelectedPlatform((urlPlatform ?? ssPlatform ?? "all") as string);
    }
  }, []);

  useEffect(() => {
    const base = "/tournaments";
    const params = new URLSearchParams(window.location.search || "");
    params.set("page", String(currentPage));
    sessionStorage.setItem("tournaments_page", String(currentPage));
    setLocation(`${base}?${params.toString()}`, { replace: true });
  }, [currentPage]);

  useEffect(() => {
    const base = "/tournaments";
    const params = new URLSearchParams(window.location.search || "");
    if (searchTerm) {
      params.set("q", searchTerm);
    } else {
      params.delete("q");
    }
    if (startDateFilter) params.set("start", startDateFilter); else params.delete("start");
    if (endDateFilter) params.set("end", endDateFilter); else params.delete("end");
    if (selectedRegion) params.set("region", selectedRegion); else params.delete("region");
    if (selectedPlatform && selectedPlatform !== 'all') params.set("platform", selectedPlatform); else params.delete("platform");

    sessionStorage.setItem("tournaments_q", searchTerm);
    sessionStorage.setItem("tournaments_start", startDateFilter);
    sessionStorage.setItem("tournaments_end", endDateFilter);
    sessionStorage.setItem("tournaments_region", selectedRegion);
    sessionStorage.setItem("tournaments_platform", selectedPlatform);

    setLocation(`${base}?${params.toString()}`, { replace: true });
  }, [searchTerm, startDateFilter, endDateFilter, selectedRegion, selectedPlatform]);

  const renderListView = () => {
    const tournaments = tournamentsData?.tournaments ?? [];
    const isOffSeasonDate = (date?: string | Date | null): boolean => {
      if (!date) return false;
      const d = new Date(date);
      const start = new Date('2025-10-01T00:00:00Z');
      const end = new Date('2026-01-31T23:59:59Z');
      return d >= start && d <= end;
    };
    const filtered = tournaments.filter((t) => {
      const nameOk = !searchTerm || t.nomeTorneo.toLowerCase().includes(searchTerm.trim().toLowerCase());
      const dVal = t.dataTorneo ? new Date(t.dataTorneo) : null;
      const startOk = !startDateFilter ? true : (dVal ? dVal >= new Date(startDateFilter) : true);
      const endOk = !endDateFilter ? true : (dVal ? dVal <= new Date(endDateFilter) : false);
      const regionOk = !selectedRegion || (t.region || "") === selectedRegion;
      return nameOk && startOk && endOk && regionOk;
    });
    const perPage = 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const page = Math.min(Math.max(1, currentPage), totalPages);
    const startIdx = (page - 1) * perPage;
    const endIdx = startIdx + perPage;
    const pageItems = filtered.slice(startIdx, endIdx);
    return (
      <div className="space-y-4">
        {/* Compact filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="filter-name" className="sr-only">Nome del torneo</Label>
            <Input
              id="filter-name"
              aria-label="Nome del torneo"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca torneo..."
              className="h-9 text-sm"
            />
          </div>

          <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Filtri Tornei</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="filter-start">Dal</Label>
                    <Input
                      id="filter-start"
                      type="date"
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filter-end">Al</Label>
                    <Input
                      id="filter-end"
                      type="date"
                      value={tempEndDate}
                      onChange={(e) => setTempEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-region">Regione</Label>
                  <Select value={tempRegion} onValueChange={(val) => setTempRegion(val === 'ALL' ? '' : val)}>
                    <SelectTrigger id="filter-region">
                      <SelectValue placeholder="Tutte le regioni" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tutte le Regioni</SelectItem>
                      {ITALIAN_REGIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-platform">Piattaforma</Label>
                  <Select value={tempPlatform} onValueChange={(val) => setTempPlatform(val)}>
                    <SelectTrigger id="filter-platform">
                      <SelectValue placeholder="Tutte le piattaforme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le piattaforme</SelectItem>
                      <SelectItem value="challengermode">Challengermode</SelectItem>
                      <SelectItem value="challonge">Challonge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={handleClearFilters} className="flex-1">
                  <Eraser className="w-4 h-4 mr-2" />
                  Pulisci
                </Button>
                <Button onClick={handleApplyFilters} className="flex-1">
                  Applica Filtri
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 relative"
            onClick={handleOpenFilterDialog}
            aria-label="Filtri"
          >
            <Filter className="w-4 h-4" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Informazioni tornei"
            onClick={() => setInfoOpen(true)}
            data-testid="button-tournaments-info"
          >
            <Info className="w-4 h-4" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(pageItems.length > 0 ? pageItems : []).map((t) => (
              <Card key={t.torneoId} className="overflow-hidden cursor-pointer" onClick={() => openTournamentDialog(t)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const logoUrl = sanitizeImageUrl(t.hosts?.spaces?.[0]?.logo?.url);
                      return logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={t.hosts?.spaces?.[0]?.name || "Organizer logo"}
                          className="w-6 h-6 rounded"
                        />
                      ) : null;
                    })()}
                    <h3 className="text-base font-semibold">{t.nomeTorneo}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">
                      {t.dataTorneo ? formatDataBreve(t.dataTorneo) : (statoTorneoInItaliano(t.state) || 'Data non disponibile')}
                    </p>
                    {isOffSeasonDate(t.dataTorneo) && (
                      <Badge variant="secondary" className="text-[10px] ml-1">Off Season</Badge>
                    )}
                    {t.region && (
                      <Badge variant="outline" className="text-[10px] ml-1">{t.region}</Badge>
                    )}
                    {t.hasCombos ? (
                      <CheckCircle className="w-4 h-4 text-success" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {t.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{markdownATestoSemplice(t.description)}</p>
                  )}
                  {(() => {
                    const contactUrl = sanitizeImageUrl(t.contactUrl);
                    return contactUrl ? (
                      <p className="mt-2 text-xs">
                        <a
                          className="text-primary hover:underline no-underline"
                          href={contactUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Contatti e informazioni torneo (si apre in una nuova scheda)"
                        >
                          Contatti / Info
                        </a>
                      </p>
                    ) : null;
                  })()}
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

        {filtered.length > 0 && (
          <Pagination className="mt-2">
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

        {/* Tournament detail dialog removed; navigate to dedicated page */}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader
        title="Tornei"
        description="Esplora i tornei, analizza le combo utilizzate e registra i tuoi risultati per scalare le classifiche."
        action={<HeaderLogo />}
      />

      <main className="flex-1 px-4 py-4 w-full mx-auto">
        {/* Single list view; admins can edit combos from player dialog */}
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'list')} className="w-full">

          <TabsContent value="list" className="space-y-4">
            {renderListView()}
          </TabsContent>


        </Tabs>
        <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Info</DialogTitle>
            </DialogHeader>
            <p className="text-sm">I tornei contrassegnati dalla spunta verde hanno combo registrate</p>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
