import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Seo } from "@/components/Seo";
import { DesktopPlayerHeader } from "@/components/players/desktop/DesktopPlayerHeader";
import { DesktopPlatformStats } from "@/components/players/desktop/DesktopPlatformStats";
import { DesktopPlayerTournaments } from "@/components/players/desktop/DesktopPlayerTournaments";

type PlayerProfileResp = {
  player: { nickname: string; avatar: string | null; platforms: string[] };
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
  platformStats: Array<{
    platform: string;
    totalPoints: number;
    tournamentsPlayed: number;
    top3Finishes: number;
  }>;
};

type PlayerTournamentsResp = {
  tournaments: Array<{
    tournamentId: string;
    date: string | null;
    name?: string | null;
    bestPlacement: number | null;
    totalPoints: number;
    comboCount: number;
    platform: string;
  }>;
};

export default function PlayerDetail() {
  const [, params] = useRoute("/players/:nickname");
  const [, setLocation] = useLocation();
  const nickname = params?.nickname || "";

  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const { data: seasonsData } = useQuery<{ seasons: string[] }>({
    queryKey: ["/api/seasons"],
    queryFn: async () => {
      const resp = await fetch("/api/seasons");
      if (!resp.ok) throw new Error("Failed to fetch seasons");
      return await resp.json();
    },
  });
  const seasons = (seasonsData?.seasons || ["Season 2026", "All Time", "Off Season 2025"]) as string[];
  useEffect(() => {
    if (seasons.length && selectedSeason === "") {
      setSelectedSeason(seasons[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonsData?.seasons?.length]);

  const { data, isLoading } = useQuery<PlayerProfileResp>({
    queryKey: ["/api/players/by-nickname", nickname, selectedSeason],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("season", selectedSeason);
      const resp = await fetch(`/api/players/by-nickname/${encodeURIComponent(nickname)}?${params.toString()}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch player profile");
      return await resp.json();
    },
    enabled: !!nickname,
  });

  const { data: tourData, isLoading: tourLoading } = useQuery<PlayerTournamentsResp>({
    queryKey: ["/api/players/by-nickname", nickname, "tournaments"],
    queryFn: async () => {
      const resp = await fetch(`/api/players/by-nickname/${encodeURIComponent(nickname)}/tournaments`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch player tournaments");
      return await resp.json();
    },
    enabled: !!nickname,
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
      ...variations.map((v) => `${PUBLIC_MINIO_URL}/${folder}/${v}.png`),
      ...variations.map((v) => `${PUBLIC_MINIO_URL}/${folder}/${v}.webp`),
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

  // Sanitize URL to prevent XSS - only allow http/https protocols
  const sanitizeImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return url;
      }
      return null;
    } catch {
      return null;
    }
  };

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
      <PageHeader title={profile ? profile.nickname : "Profilo Giocatore"} action={<HeaderLogo />} />
      {profile && (
        <Seo
          title={`${profile.nickname} - Profilo Giocatore | Beyblade X Meta`}
          description={`Guarda le statistiche, le combo preferite e i tornei di ${profile.nickname} su Beyblade X Meta.`}
          imageUrl={sanitizeImageUrl(profile.avatar) || undefined}
          type="profile"
          structuredData={{
            "@context": "https://schema.org",
            "@type": "Person",
            "name": profile.nickname,
            "image": sanitizeImageUrl(profile.avatar),
            "url": window.location.href,
            "description": `Profilo giocatore di Beyblade X per ${profile.nickname}`,
            "interactionStatistic": stats ? [
              {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/ParticipateAction",
                "userInteractionCount": tourData?.tournaments.length || 0
              }
            ] : undefined
          }}
        />
      )}

      <main className="flex-1 px-4 py-4 w-full mx-auto space-y-3">
        {/* DESKTOP LAYOUT */}
        <div className="hidden md:block max-w-7xl mx-auto space-y-8">
          <div className="mb-4">
            <Link href="/players" asChild>
              <a className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md hover:bg-accent hover:text-accent-foreground transition-colors no-underline">
                <ArrowLeft className="w-4 h-4" />
                Torna alla lista
              </a>
            </Link>
          </div>

          {/* 1. Header */}
          <DesktopPlayerHeader
            nickname={profile?.nickname || nickname}
            avatar={profile?.avatar || null}
            totalPoints={stats?.totalPoints || 0}
            tournamentsPlayed={tourData?.tournaments.length || 0}
            sanitizeImageUrl={sanitizeImageUrl}
          />

          {/* 2. Platform Stats */}
          <DesktopPlatformStats
            platformStats={data?.platformStats || []}
          />

          {/* 3. Tournaments Table */}
          <DesktopPlayerTournaments
            tournaments={tourData?.tournaments || []}
            isLoading={tourLoading}
          />
        </div>

        {/* MOBILE LAYOUT (Preserved) */}
        <div className="md:hidden">
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
              <Link href="/players" asChild>
                <a className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md hover:bg-accent hover:text-accent-foreground transition-colors no-underline min-w-[44px] min-h-[44px]">
                  <ArrowLeft className="w-4 h-4" />
                  Indietro
                </a>
              </Link>
            </div>

            <TabsContent value="players" className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-[180px]">
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
              <Card className="p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                  {(() => {
                    const sanitizedAvatar = sanitizeImageUrl(profile?.avatar);
                    return sanitizedAvatar ? (
                      <img src={sanitizedAvatar} alt={profile?.nickname || ""} className="w-16 h-16 object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    );
                  })()}
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
                        <Link key={t.tournamentId} href={`/tournaments/${encodeURIComponent(t.tournamentId)}`} asChild>
                          <a className="block no-underline">
                            <Card className="p-3 cursor-pointer hover-elevate active-elevate-2 transition-colors">
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
                          </a>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
