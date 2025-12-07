import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { CardDescription } from "@/components/ui/card";
import { format } from "date-fns";

type PlayerProfileResp = {
  player: { id: string; nickname: string; avatar: string | null };
  stats: {
    totalPoints: number;
    mostUsedCombo: {
      blade: string;
      assistBlade: string;
      ratchet: string;
      bit: string;
      lockChip: string;
      count: number;
      points: number;
    } | null;
    favoriteBlade: { blade: string; count: number; points: number } | null;
  };
};

type PlayerTournamentsResp = {
  tournaments: Array<{
    tournamentId: string;
    date: string | null;
    name?: string | null;
    bestPlacement: number | null;
    totalPoints: number;
    comboCount: number;
  }>;
};

export default function PlayerDetail() {
  const [, params] = useRoute("/players/:id");
  const [, setLocation] = useLocation();
  const playerId = params?.id || "";

  const { data, isLoading } = useQuery<PlayerProfileResp>({
    queryKey: ["/api/players", playerId],
    queryFn: async () => {
      const resp = await fetch(`/api/players/${encodeURIComponent(playerId)}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch player profile");
      return await resp.json();
    },
    enabled: !!playerId,
  });

  const { data: tourData, isLoading: tourLoading } = useQuery<PlayerTournamentsResp>({
    queryKey: ["/api/players", playerId, "tournaments"],
    queryFn: async () => {
      const resp = await fetch(`/api/players/${encodeURIComponent(playerId)}/tournaments`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch player tournaments");
      return await resp.json();
    },
    enabled: !!playerId,
  });

  const profile = data?.player || null;
  const stats = data?.stats || null;

  const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

  function ComponentImage({ folder, name }: { folder: string; name: string }) {
    const [attemptIndex, setAttemptIndex] = useState(0);
    useEffect(() => { setAttemptIndex(0); }, [name, folder]);
    const variations = [
      name.toLowerCase().replace(/\s+/g, ""),
      name.toLowerCase().replace(/\s+/g, "-"),
      name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/\s+/g, "-"),
    ];
    const attempts = [
      ...variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.png`),
      ...variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.webp`),
    ];
    const onError = () => { if (attemptIndex < attempts.length - 1) setAttemptIndex(attemptIndex + 1); };
    return (
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded bg-muted overflow-hidden flex items-center justify-center">
        {attemptIndex >= attempts.length ? (
          <span className="text-xs text-muted-foreground">N/A</span>
        ) : (
          <img key={attemptIndex} src={attempts[attemptIndex]} alt={name} className="w-full h-full object-contain" onError={onError} />
        )}
      </div>
    );
  }

  function formatComboTitle(c: NonNullable<PlayerProfileResp["stats"]["mostUsedCombo"]>) {
    const blade = c.blade?.trim() || "";
    const assist = c.assistBlade?.trim() || "";
    const ratchet = c.ratchet?.trim() || "";
    const bit = c.bit?.trim() || "";
    const lockChip = c.lockChip?.trim() || "";
    const assistPart = assist && assist.toLowerCase() !== "none" ? assist : "";
    const lockPart = lockChip && lockChip.toLowerCase() !== "none" ? lockChip : "";
    const ratchetPart = ratchet && ratchet.toLowerCase() !== "none" ? ratchet : "";
    const parts = [lockPart, blade + (assistPart ? `${assistPart}` : ""), ratchetPart, bit].filter(Boolean);
    return parts.join(" • ");
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title={profile ? profile.nickname : "Profilo Giocatore"} />
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
          <div className="mb-4">
            <Button variant="ghost" onClick={() => setLocation('/players')} className="gap-2 w-fit">
              <ArrowLeft className="w-4 h-4" />
              Indietro
            </Button>
          </div>

          <TabsContent value="players" className="space-y-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center">
            {profile?.avatar ? (
              <img src={profile.avatar} alt={profile.nickname} className="w-16 h-16 object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">N/A</span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold">{profile?.nickname || ""}</p>
            {stats && (
              <Badge variant="outline" className="text-xs mt-1">
                Punti totali: {Number(stats.totalPoints).toLocaleString()}
              </Badge>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Statistiche</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-6 bg-muted/30 animate-pulse" />
                <div className="h-6 bg-muted/30 animate-pulse" />
                <div className="h-6 bg-muted/30 animate-pulse" />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Combo più usata</p>
                  {stats?.mostUsedCombo ? (
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground font-medium truncate" title={formatComboTitle(stats.mostUsedCombo)}>
                        {formatComboTitle(stats.mostUsedCombo)}
                        <Badge variant="secondary" className="ml-2 text-xs">Usi: {stats.mostUsedCombo.count}</Badge>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {stats.mostUsedCombo.lockChip && stats.mostUsedCombo.lockChip.toLowerCase() !== 'none' && (
                          <ComponentImage folder="chips" name={stats.mostUsedCombo.lockChip} />
                        )}
                        <ComponentImage folder="blades" name={stats.mostUsedCombo.blade} />
                        {stats.mostUsedCombo.assistBlade && stats.mostUsedCombo.assistBlade.toLowerCase() !== 'none' && (
                          <ComponentImage folder="assist-blades" name={stats.mostUsedCombo.assistBlade} />
                        )}
                        {stats.mostUsedCombo.ratchet && stats.mostUsedCombo.ratchet.toLowerCase() !== 'none' && (
                          <ComponentImage folder="ratchets" name={stats.mostUsedCombo.ratchet} />
                        )}
                        <ComponentImage folder="bits" name={stats.mostUsedCombo.bit} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium">Blade preferita</p>
                  {stats?.favoriteBlade ? (
                    <div className="flex items-center gap-3">
                      <ComponentImage folder="blades" name={stats.favoriteBlade.blade} />
                      <div className="text-sm text-muted-foreground">
                        {stats.favoriteBlade.blade}
                        <Badge variant="secondary" className="ml-2 text-xs">Usi: {stats.favoriteBlade.count}</Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Tornei partecipati</CardTitle>
            <CardDescription className="text-xs">Clicca un torneo per vedere i dettagli</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tourLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted/30 animate-pulse rounded" />
                ))}
              </div>
            ) : (tourData?.tournaments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun torneo trovato</p>
            ) : (
              <div className="space-y-2">
                {(tourData?.tournaments || []).map((t) => (
                  <Card
                    key={t.tournamentId}
                    className="p-3 cursor-pointer"
                    onClick={() => setLocation(`/tournaments/${encodeURIComponent(t.tournamentId)}`)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.name || `Torneo ${t.tournamentId}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.date ? format(new Date(t.date), 'dd MMM yyyy') : 'Data sconosciuta'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.bestPlacement != null && (
                          <Badge variant="secondary" className="text-xs">Best: {t.bestPlacement}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">Punti: {t.totalPoints}</Badge>
                        {/* <Badge variant="outline" className="text-xs">Combo: {t.comboCount}</Badge> */}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
