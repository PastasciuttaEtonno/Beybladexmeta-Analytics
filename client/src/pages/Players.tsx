import { useLocation, Link } from "wouter";
import { Seo } from "@/components/Seo";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
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
import { Trophy, Medal, Award } from "lucide-react";

type PlayerItem = {
  id: string;
  nickname: string;
  avatar: string | null;
  totalPoints: number;
  tournamentsPlayed?: number;
  top3Finishes?: number;
  platform?: string;
};

export default function Players() {
  const [, setLocation] = useLocation();

  const [selectedSeason, setSelectedSeason] = useState<string>("Off Season 2025");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("challengermode");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const season = params.get("season");
    const platform = params.get("platform");

    const ssQ = sessionStorage.getItem("players_q");
    const ssSeason = sessionStorage.getItem("players_season");
    const ssPlatform = sessionStorage.getItem("players_platform");

    if (q !== null || ssQ !== null) setQuery((q ?? ssQ ?? "") as string);
    if (season !== null || ssSeason !== null) setSelectedSeason((season ?? ssSeason ?? "Off Season 2025") as string);

    // Validate Platform
    const rawPlatform = platform ?? ssPlatform;
    if (rawPlatform === "challengermode" || rawPlatform === "challonge") {
      setSelectedPlatform(rawPlatform);
    } else {
      setSelectedPlatform("challengermode"); // Default fallback
    }

    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const params = new URLSearchParams(window.location.search);
    if (query) params.set("q", query); else params.delete("q");
    // selectedSeason is unused in API currently but let's persist it
    if (selectedSeason) params.set("season", selectedSeason);
    if (selectedPlatform) params.set("platform", selectedPlatform);

    sessionStorage.setItem("players_q", query);
    sessionStorage.setItem("players_season", selectedSeason);

    // Only persist valid platforms
    if (selectedPlatform === "challengermode" || selectedPlatform === "challonge") {
      sessionStorage.setItem("players_platform", selectedPlatform);
    } else {
      sessionStorage.removeItem("players_platform");
    }

    const newSearch = params.toString();
    const currentSearch = window.location.search.replace(/^\?/, "");
    if (newSearch !== currentSearch) {
      setLocation(`${location}?${newSearch}`, { replace: true });
    }
  }, [query, selectedSeason, selectedPlatform, location, setLocation, isInitialized]);

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
    if (seasonsData?.seasons && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonsData, selectedSeason]);

  // Global Leaderboard Query (always global region)
  const { data: globalData, isLoading } = useQuery<{ players: PlayerItem[] }>({
    queryKey: ["/api/stats/leaderboard", selectedPlatform],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedPlatform && selectedPlatform !== "all") {
        params.set("platform", selectedPlatform);
      }
      const url = `/api/stats/leaderboard${params.toString() ? `?${params.toString()}` : ""}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Failed to fetch global leaderboard");
      return resp.json();
    },
  });

  const players = (globalData?.players || []).map((p) => ({
    id: p.nickname,
    nickname: p.nickname,
    avatar: p.avatar,
    totalPoints: p.totalPoints,
    tournamentsPlayed: p.tournamentsPlayed,
    top3Finishes: p.top3Finishes,
    platform: p.platform,
  })) as PlayerItem[];


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
  }, [players.length, query, selectedPlatform]);

  const getRankBadge = (index: number) => {
    if (index === 0)
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white w-8 h-6 flex items-center justify-center p-0">1</Badge>;
    if (index === 1)
      return <Badge className="bg-gray-400 hover:bg-gray-500 text-white w-8 h-6 flex items-center justify-center p-0">2</Badge>;
    if (index === 2)
      return <Badge className="bg-amber-600 hover:bg-amber-700 text-white w-8 h-6 flex items-center justify-center p-0">3</Badge>;
    return (
      <Badge variant="secondary" className="text-xs w-8 h-6 flex items-center justify-center p-0">
        {index + 1}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <Seo
        title="Classifica Giocatori · Beybladexmeta Analytics"
        description="La classifica globale dei giocatori di Beyblade X. Monitora i punti guadagnati nei tornei Challengermode e Challonge in Italia."
      />
      <PageHeader title="Classifica Giocatori" />
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-3">
        <Tabs
          value="players"
          onValueChange={(val) => {
            if (val === "components") setLocation("/");
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
                  aria-label="Cerca giocatori"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca giocatori..."
                  className="h-9 text-sm"
                />
              </div>
              <div className="w-full sm:w-[180px]">
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Piattaforma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="challengermode">Challengermode</SelectItem>
                    <SelectItem value="challonge">Challonge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="h-20 bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : filteredPlayers.length === 0 ? (
              <Card className="p-6 text-center">Nessun giocatore trovato</Card>
            ) : (
              <div className="overflow-y-auto space-y-2">
                {pageItems.map((p, idx) => {
                  const globalRank = (page - 1) * perPage + idx;

                  return (
                    <Link key={`${p.id}-${idx}`} href={`/players/${encodeURIComponent(p.nickname)}`} className="block mb-0">
                      <a className="block no-underline">
                        <Card className="p-3 flex items-center gap-3 cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all duration-200 active:scale-[0.99]">
                          <div className="w-10 text-center flex-shrink-0 flex justify-center">
                            {getRankBadge(globalRank)}
                          </div>
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                            {p.avatar ? (
                              <img src={p.avatar} alt={`Avatar di ${p.nickname}`} className="w-12 h-12 object-cover" />
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{p.nickname}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <Badge variant="default" className="text-xs">
                                {Number(p.totalPoints).toFixed(0)} pt
                              </Badge>
                              {p.tournamentsPlayed !== undefined && (
                                <Badge variant="outline" className="text-xs">
                                  {p.tournamentsPlayed} tornei
                                </Badge>
                              )}
                              {p.platform && (
                                <Badge variant="outline" className="text-xs">
                                  {p.platform === "challengermode" ? "CM" : "Challonge"}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-muted-foreground">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                          </div>
                        </Card>
                      </a>
                    </Link>
                  );
                })}
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
