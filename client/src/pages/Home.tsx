import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Shield, Cog, Zap, Eye } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeProvider';
import { PageHeader } from '@/components/PageHeader';
import { HeaderLogo } from '@/components/HeaderLogo';
import { LeaderboardDialog } from '@/components/LeaderboardDialog';
import { useState, useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { Seo } from '@/components/Seo';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardData } from '@/hooks/useDashboardData';
import { ComponentImage } from '@/components/ComponentImage';
import { DesktopBentoGrid } from '@/components/dashboard/DesktopBentoGrid';

export default function Home() {
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const [leaderboardType, setLeaderboardType] = useState<"blade" | "ratchet" | "bit" | null>(null);
  const dialogOpen = leaderboardType !== null;
  const [activeTab, setActiveTab] = useState<'components' | 'players'>('components');
  const [selectedSeason, setSelectedSeason] = useState<string>("All Time");

  // Handle back button for dialog
  const poppedRef = useRef(false);

  useEffect(() => {
    if (dialogOpen) {
      // Push state when dialog opens
      window.history.pushState({ dialog: 'leaderboard' }, '', '');
      poppedRef.current = false;

      const handlePopState = () => {
        // User pressed back button
        poppedRef.current = true;
        setLeaderboardType(null);
      };

      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
        // If the dialog is closing but we didn't just pop state (i.e. closed via UI),
        // we need to go back in history to remove the pushed state.
        if (!poppedRef.current) {
          window.history.back();
        }
      };
    }
  }, [dialogOpen]);

  const { topBlade, topRatchet, topBit, isLoading } = useDashboardData(selectedSeason);

  const bladeLoading = isLoading;
  const ratchetLoading = isLoading;
  const bitLoading = isLoading;

  return (
    <>
      <Seo
        title="Beybladexmeta Analytics - Statistiche e Metagame Beyblade X"
        description="Il portale definitivo per l'analisi del metagame di Beyblade X in Italia. Scopri le migliori combo, i trend dei tornei e scala la classifica globale."
      />

      {/* MOBILE CONTENT (< 768px) */}
      <div className="flex flex-col min-h-screen bg-background pb-20 md:hidden">
        <PageHeader title="Home" action={<HeaderLogo />} />

        <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              if (val === 'players') {
                setLocation('/players');
              } else {
                setActiveTab('components');
              }
            }}
            className="w-full"
          >
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="components">Componenti</TabsTrigger>
              <TabsTrigger value="players">Giocatori</TabsTrigger>
            </TabsList>

            <TabsContent value="components" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Season 2026">Season 2026</SelectItem>
                      <SelectItem value="Off Season 2025">Off Season 2025</SelectItem>
                      <SelectItem value="All Time">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {bladeLoading ? (
                <Card className="p-6 space-y-4 min-h-[180px]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 bg-muted/30 rounded animate-pulse" />
                    <div className="h-7 w-32 bg-muted/30 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-muted/30 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-8 w-40 bg-muted/30 rounded animate-pulse" />
                      <div className="flex gap-2">
                        <div className="h-6 w-20 bg-muted/30 rounded animate-pulse" />
                        <div className="h-6 w-24 bg-muted/30 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                </Card>
              ) : !topBlade ? (
                <Card className="p-6 cursor-pointer min-h-[180px] transition-all hover:scale-[1.02] hover:border-purple-500/50 active:scale-[0.98]" data-testid="card-top-blade-empty" onClick={() => setLeaderboardType('blade')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-purple-500" />
                    <h2 className="text-lg font-semibold">Top Blade</h2>
                    <Eye className="w-4 h-4 text-muted-foreground ml-auto md:hidden" />
                  </div>
                  <div className="py-6 text-center">
                    <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Nessun dato disponibile
                    </p>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 space-y-4 cursor-pointer min-h-[180px] transition-all hover:scale-[1.02] hover:border-purple-500/50 active:scale-[0.98]" data-testid="card-top-blade" onClick={() => setLeaderboardType('blade')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-purple-500" />
                    <h2 className="text-lg font-semibold">Top Blade</h2>
                    <Eye className="w-4 h-4 text-muted-foreground ml-auto md:hidden" />
                  </div>

                  <div className="flex items-center gap-4">
                    <ComponentImage
                      name={topBlade.blade}
                      type="blades"
                      fallbackIcon={<Shield className="w-12 h-12 text-muted-foreground" />}
                      testId="img-top-blade"
                      priority={true}
                    />

                    <div className="flex-1">
                      <p className="text-2xl font-bold mb-2" data-testid="text-blade-name">
                        {topBlade.blade}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {topBlade.primiPosti} Primi Posti
                        </Badge>
                        <Badge variant="outline" className="text-xs" data-testid="text-blade-score">
                          Punteggio: {topBlade.punteggioTotale.toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {ratchetLoading ? (
                <Card className="p-6 space-y-4 min-h-[180px]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 bg-muted/30 rounded animate-pulse" />
                    <div className="h-7 w-32 bg-muted/30 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-muted/30 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-8 w-40 bg-muted/30 rounded animate-pulse" />
                      <div className="flex gap-2">
                        <div className="h-6 w-20 bg-muted/30 rounded animate-pulse" />
                        <div className="h-6 w-24 bg-muted/30 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                </Card>
              ) : !topRatchet ? (
                <Card className="p-6 cursor-pointer min-h-[180px] transition-all hover:scale-[1.02] hover:border-purple-500/50 active:scale-[0.98]" data-testid="card-top-ratchet-empty" onClick={() => setLeaderboardType('ratchet')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-purple-500" />
                    <h2 className="text-lg font-semibold">Top Ratchet</h2>
                    <Eye className="w-4 h-4 text-muted-foreground ml-auto md:hidden" />
                  </div>
                  <div className="py-6 text-center">
                    <Cog className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Nessun dato disponibile
                    </p>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 space-y-4 cursor-pointer min-h-[180px] transition-all hover:scale-[1.02] hover:border-purple-500/50 active:scale-[0.98]" data-testid="card-top-ratchet" onClick={() => setLeaderboardType('ratchet')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-purple-500" />
                    <h2 className="text-lg font-semibold">Top Ratchet</h2>
                    <Eye className="w-4 h-4 text-muted-foreground ml-auto md:hidden" />
                  </div>

                  <div className="flex items-center gap-4">
                    <ComponentImage
                      name={topRatchet.ratchet}
                      type="ratchets"
                      fallbackIcon={<Cog className="w-12 h-12 text-muted-foreground" />}
                      testId="img-top-ratchet"
                    />

                    <div className="flex-1">
                      <p className="text-2xl font-bold mb-2" data-testid="text-ratchet-name">
                        {topRatchet.ratchet}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {topRatchet.primiPosti} Primi Posti
                        </Badge>
                        <Badge variant="outline" className="text-xs" data-testid="text-ratchet-score">
                          Punteggio: {topRatchet.punteggioTotale.toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {bitLoading ? (
                <Card className="p-6 space-y-4 min-h-[180px]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 bg-muted/30 rounded animate-pulse" />
                    <div className="h-7 w-32 bg-muted/30 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-muted/30 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-8 w-40 bg-muted/30 rounded animate-pulse" />
                      <div className="flex gap-2">
                        <div className="h-6 w-20 bg-muted/30 rounded animate-pulse" />
                        <div className="h-6 w-24 bg-muted/30 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                </Card>
              ) : !topBit ? (
                <Card className="p-6 cursor-pointer min-h-[180px] transition-all hover:scale-[1.02] hover:border-purple-500/50 active:scale-[0.98]" data-testid="card-top-bit-empty" onClick={() => setLeaderboardType('bit')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-purple-500" />
                    <h2 className="text-lg font-semibold">Top Bit</h2>
                    <Eye className="w-4 h-4 text-muted-foreground ml-auto md:hidden" />
                  </div>
                  <div className="py-6 text-center">
                    <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Nessun dato disponibile
                    </p>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 space-y-4 cursor-pointer min-h-[180px] transition-all hover:scale-[1.02] hover:border-purple-500/50 active:scale-[0.98]" data-testid="card-top-bit" onClick={() => setLeaderboardType('bit')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-purple-500" />
                    <h2 className="text-lg font-semibold">Top Bit</h2>
                    <Eye className="w-4 h-4 text-muted-foreground ml-auto md:hidden" />
                  </div>

                  <div className="flex items-center gap-4">
                    <ComponentImage
                      name={topBit.bit}
                      type="bits"
                      fallbackIcon={<Zap className="w-12 h-12 text-muted-foreground" />}
                      testId="img-top-bit"
                    />

                    <div className="flex-1">
                      <p className="text-2xl font-bold mb-2" data-testid="text-bit-name">
                        {topBit.bit}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {topBit.primiPosti} Primi Posti
                        </Badge>
                        <Badge variant="outline" className="text-xs" data-testid="text-bit-score">
                          Punteggio: {topBit.punteggioTotale.toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <LeaderboardDialog
        type={leaderboardType}
        season={selectedSeason}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setLeaderboardType(null);
        }}
      />

      {/* DESKTOP CONTENT (>= 768px) */}
      <div className="hidden md:block max-w-[1400px] mx-auto w-full p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-black tracking-tight text-foreground/90">Il Meta in Sintesi</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">Filtra per stagione:</span>
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-[180px] bg-background/50 backdrop-blur-sm border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Season 2026">Season 2026</SelectItem>
                <SelectItem value="Off Season 2025">Off Season 2025</SelectItem>
                <SelectItem value="All Time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DesktopBentoGrid
          selectedSeason={selectedSeason}
          onSelectType={(type) => setLeaderboardType(type)}
        />

        {/* Note: In a real "split" we might render other desktop sections here */}
      </div>
    </>
  );
}
