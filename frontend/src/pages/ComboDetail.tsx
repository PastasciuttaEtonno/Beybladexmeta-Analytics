import { Link, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, Medal, Award, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { format } from "date-fns";
import { useComboDetails } from "@/hooks/useComboDetails";
import { BeybladeImage } from "@/components/common/BeybladeImage";
import { DesktopComboVisuals, DesktopComboVisualsSkeleton } from "@/components/combo/desktop/DesktopComboVisuals";
import { DesktopComboStats, DesktopComboStatsSkeleton } from "@/components/combo/desktop/DesktopComboStats";
import { DesktopTournamentHistory } from "@/components/combo/desktop/DesktopTournamentHistory";

import { DesktopComboTrend, DesktopComboTrendSkeleton } from "@/components/combo/desktop/DesktopComboTrend";

export default function ComboDetail() {
  const {
    decodedId,
    combo,
    rank,
    comboLoading,
    comboError,
    tournaments,
    allTournaments,
    tourLoading,
    totalTournaments,
    currentPage,
    totalPages,
    setCurrentPage,
    handleShare,
    getComboTitle,
    getCanonicalUrl,
    getOgImageUrl,
    season
  } = useComboDetails();

  const [location, setLocation] = useLocation();

  const handleSeasonChange = (newSeason: string) => {
    const searchParams = new URLSearchParams(window.location.search);
    if (newSeason && newSeason !== "All Time") {
      searchParams.set("season", newSeason);
    } else {
      searchParams.delete("season");
    }
    const newSearch = searchParams.toString();
    setLocation(`${window.location.pathname}${newSearch ? `?${newSearch}` : ""}`);
  };

  const getRankIcon = (r: number) => {
    if (r === 1) return <Trophy className="w-8 h-8 text-yellow-500" />;
    if (r === 2) return <Medal className="w-8 h-8 text-slate-400" />;
    if (r === 3) return <Award className="w-8 h-8 text-amber-700" />;
    return null;
  };

  if (comboLoading) {
    return (
      <div className="min-h-screen bg-background p-4 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-44" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <DesktopComboVisualsSkeleton />
              <DesktopComboStatsSkeleton />
            </div>
            <div className="space-y-6">
              <DesktopComboTrendSkeleton />
              <Card className="border-border/50 bg-card/30 backdrop-blur-md">
                <CardHeader>
                  <Skeleton className="h-7 w-48 mb-2" />
                  <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!combo && !comboLoading) {
    return (
      <div className="min-h-screen bg-background p-4 pb-24">
        <div className="max-w-2xl mx-auto space-y-6">
          <Link href="/analytics">
            <a
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md hover:bg-accent hover:text-accent-foreground transition-colors no-underline min-w-[44px] min-h-[44px]"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
              Indietro
            </a>
          </Link>
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">
                {comboError ? `Errore: ${comboError.message}` : "Combo non trovata"}
              </p>
              {decodedId && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Key: {decodedId}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!combo) return null;

  const allComponents = [
    { label: "Blade", value: combo.blade, folder: "blades" },
    { label: "Assist Blade", value: combo.assistBlade, folder: "assist-blades" },
    { label: "Ratchet", value: combo.ratchet, folder: "ratchets" },
    { label: "Bit", value: combo.bit, folder: "bits" },
    { label: "Lock Chip", value: combo.lockChip, folder: "chips" },
  ];

  const components = allComponents.filter((component) => {
    const value = component.value;
    return (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value.toUpperCase() !== "NONE" &&
      value !== "-"
    );
  });

  const comboTitle = getComboTitle();
  const canonical = getCanonicalUrl();
  const imageUrl = getOgImageUrl();

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <Seo
        title={`${comboTitle} · Combo`}
        description={`Dettagli della combo: ${comboTitle}. Rank #${rank}.`}
        canonical={canonical}
        type="article"
        imageUrl={imageUrl}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": comboTitle,
          "author": {
            "@type": "Organization",
            "name": "Beyblade X Meta"
          },
          "datePublished": combo.dataCreazione,
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": canonical
          },
          "image": imageUrl
        }}
      />

      {/* Shared Back Button & Share */}
      <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between">
        <Link href="/analytics">
          <a
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md hover:bg-accent hover:text-accent-foreground transition-colors no-underline min-w-[44px] min-h-[44px]"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Indietro
          </a>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden lg:block">
            <Select
              value={season || "All Time"}
              onValueChange={handleSeasonChange}
            >
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Seleziona Stagione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Time">All Time</SelectItem>
                <SelectItem value="Off Season 2025">Off Season 2025</SelectItem>
                <SelectItem value="Season 2026">Season 2026</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleShare}
            variant="ghost"
            className="gap-2 px-4 py-2 text-sm font-medium rounded-md min-w-[44px] min-h-[44px] h-auto hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Share2 className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">Condividi</span>
          </Button>
        </div>
      </div>

      {/* === DESKTOP LAYOUT (>= lg) === */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        {/* Left Column: Visuals */}
        <div className="lg:col-span-5 h-full">
          <div className="sticky top-24 space-y-6">

            <DesktopComboVisuals combo={combo} rank={rank} />
            {tourLoading ? (
              <DesktopComboTrendSkeleton />
            ) : (
              <DesktopComboTrend tournaments={allTournaments} season={season} />
            )}
          </div>
        </div>

        {/* Right Column: Stats & History */}
        <div className="lg:col-span-7 space-y-6">
          <DesktopComboStats combo={combo} />
          <DesktopTournamentHistory
            tournaments={tournaments}
            loading={tourLoading}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalTournaments={totalTournaments}
          />

        </div>
      </div>

      {/* === MOBILE LAYOUT (< lg) - PRESERVED === */}
      <div className="lg:hidden max-w-2xl mx-auto space-y-6">

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl">Dettagli combo</CardTitle>
                <CardDescription>Rank #{rank} nella classifica</CardDescription>
              </div>
              {rank <= 3 && (
                <div data-testid={`icon-rank-${rank}`}>{getRankIcon(rank)}</div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">

            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 py-4">
              {components.map((component) => (
                <div key={component.label} className="flex flex-col items-center gap-2 group">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-muted/50 to-muted rounded-xl border shadow-sm flex items-center justify-center p-2 transition-transform group-hover:scale-105">
                    <BeybladeImage
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
                      data-testid={`text-${component.label.toLowerCase().replace(/\s+/g, "-")}`}
                      title={component.value}
                    >
                      {component.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statistiche tornei</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">1st Place</p>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-first-place"
                    >
                      {combo.primiPosti}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">2nd Place</p>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-second-place"
                    >
                      {combo.secondiPosti}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">3rd Place</p>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-third-place"
                    >
                      {combo.terziPosti}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">4th Place</p>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-fourth-place"
                    >
                      {combo.quartiPosti}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Score</p>
                    <p
                      className="text-2xl font-bold text-primary"
                      data-testid="text-total-score"
                    >
                      {combo.punteggioTotale}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Apparizione tornei recenti</CardTitle>
                <CardDescription className="text-xs">
                  Clicca un torneo per vedere i dettagli
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {tourLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 bg-muted/30 animate-pulse rounded" />
                    ))}
                  </div>
                ) : totalTournaments === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessun torneo trovato
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {tournaments.map((t) => (
                        <Link
                          key={`${t.tournamentId}-${t.playerId}`}
                          href={`/tournaments/${encodeURIComponent(t.tournamentId)}`}
                        >
                          <a className="block no-underline">
                            <Card className="p-3 cursor-pointer hover-elevate active-elevate-2 transition-colors">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">
                                    {t.tournamentName || t.tournament_name || `Torneo ${t.tournamentId}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {t.playerName} • {t.date ? format(new Date(t.date), 'dd MMM yyyy') : 'Data sconosciuta'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-xs">
                                    #{t.placement}
                                  </Badge>
                                </div>
                              </div>
                            </Card>
                          </a>
                        </Link>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          aria-label="Pagina precedente"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {currentPage} di {totalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          aria-label="Pagina successiva"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
