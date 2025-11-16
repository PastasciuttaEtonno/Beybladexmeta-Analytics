import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

type PlayerItem = {
  id: string;
  nickname: string;
  avatar: string | null;
  totalPoints: number;
};

export default function Players() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{ players: PlayerItem[] }>({
    queryKey: ["/api/player-rankings"],
    queryFn: async () => {
      const resp = await fetch("/api/player-rankings", { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch player rankings");
      return await resp.json();
    },
  });

  const players = (data?.players || []) as PlayerItem[];
  const [page, setPage] = useState(1);
  const perPage = 20;
  const totalPages = Math.max(1, Math.ceil(players.length / perPage));
  const pageItems = useMemo(() => {
    const start = (page - 1) * perPage;
    return players.slice(start, start + perPage);
  }, [players, page]);

  useEffect(() => {
    setPage(1);
  }, [players.length]);

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
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-20 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : players.length === 0 ? (
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
            {players.length > perPage && (
              <Pagination className="mt-2">
                <PaginationContent>
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