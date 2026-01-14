import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useMemo, useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PlayerItem = {
  id: string;
  nickname: string;
  avatar: string | null;
  totalPoints: number;
};

export default function Players() {
  const [, setLocation] = useLocation();

  const REGIONS = [
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

  const [selectedRegion, setSelectedRegion] = useState<string>("global");
  const [selectedSeason, setSelectedSeason] = useState<string>("Off Season 2025");

  const { data: seasonsData } = useQuery<{ seasons: string[] }>({
    queryKey: ["/api/seasons"],
    queryFn: async () => {
      const resp = await fetch("/api/seasons");
      if (!resp.ok) throw new Error("Failed to fetch seasons");
      return await resp.json();
    },
  });
  const seasons = (seasonsData?.seasons || ["Off Season 2025", "All Time"]) as string[];
  useEffect(() => {
    if (seasons.length && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonsData?.seasons?.length]);

  const { data, isLoading } = useQuery<{ leaderboard: any[] }>({
    queryKey: ["/api/leaderboard/regional", selectedRegion, selectedSeason],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("season", selectedSeason);
      if (selectedRegion && selectedRegion !== "global") params.set("region", selectedRegion);
      const resp = await fetch(`/api/leaderboard/regional?${params.toString()}`);
      if (!resp.ok) throw new Error("Failed to fetch regional leaderboard");
      return await resp.json();
    },
  });

  const players = ((data?.leaderboard || []) as any[]).map((row) => ({
    id: String(row.player_id || ""),
    nickname: String(row.player_name || row.player_id || ""),
    avatar: row.avatar ? String(row.avatar) : null,
    totalPoints: Number(row.points || 0),
  })) as PlayerItem[];
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.nickname.toLowerCase().includes(q));
  }, [players, query]);
  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / perPage));
  const pageItems = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredPlayers.slice(start, start + perPage);
  }, [filteredPlayers, page]);

  useEffect(() => {
    setPage(1);
  }, [players.length, query, selectedRegion, selectedSeason]);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Classifica Giocatori" />
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-3">
        <Tabs
          value={"players"}
          onValueChange={(val) => {
            if (val === "components") setLocation("/");
            else setLocation("/players");
          }}
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="components">Componenti</TabsTrigger>
            <TabsTrigger value="players">Giocatori</TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-0 w-full sm:w-auto">
            <Input
              id="player-search"
              aria-label="Search players"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca giocatori..."
              className="h-9 text-sm"
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Globale" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Globale</SelectItem>
                {REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[180px]">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Stagione" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-20 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredPlayers.length === 0 ? (
          <Card className="p-6 text-center">Nessun giocatore trovato</Card>
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {pageItems.map((p, idx) => (
              <Card
                key={p.id}
                className="p-3 flex items-center gap-3 cursor-pointer"
                onClick={() => setLocation(`/players/${encodeURIComponent(p.id)}`)}
              >
                <div className="w-10 text-center">
                  <Badge variant="secondary" className="text-xs">
                    {(page - 1) * perPage + idx + 1}
                  </Badge>
                </div>
                <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.nickname} className="w-12 h-12 object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">N/A</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.nickname}</p>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-xs">
                      Punti: {Number(p.totalPoints).toLocaleString()}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
            {filteredPlayers.length > perPage && (
              <Pagination className="mt-2">
                <PaginationContent className="flex-wrap">
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage(Math.max(1, page - 1)); }}
                    />
                  </PaginationItem>
                  {page > 2 && (
                    <PaginationItem>
                      <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setPage(1); }}>1</PaginationLink>
                    </PaginationItem>
                  )}
                  {page > 3 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  {Array.from({ length: 3 }, (_, i) => page - 1 + i)
                    .filter((p) => p >= 1 && p <= totalPages)
                    .map((p) => (
                      <PaginationItem key={p}>
                        <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setPage(p); }}>{p}</PaginationLink>
                      </PaginationItem>
                    ))}
                  {page < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  {page < totalPages - 1 && (
                    <PaginationItem>
                      <PaginationLink href="#" onClick={(e) => { e.preventDefault(); setPage(totalPages); }}>{totalPages}</PaginationLink>
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage(Math.min(totalPages, page + 1)); }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
