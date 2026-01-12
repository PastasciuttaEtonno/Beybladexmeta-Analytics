import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Shield, Cog, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeProvider';
import { PageHeader } from '@/components/PageHeader';
import { HeaderLogo } from '@/components/HeaderLogo';
import { LeaderboardDialog } from '@/components/LeaderboardDialog';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BladeStats, RatchetStats, BitStats } from '@shared/schema';

// Use the public MinIO URL like in Analytics.tsx
const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || '').replace(/\/$/, '');

if (!PUBLIC_MINIO_URL) {
  console.error('VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.');
}

const getImageUrls = (component: string, folder: string): string[] => {
  // Try multiple filename variations for robustness
  const attempts = [
    component.toLowerCase().replace(/\s+/g, ''), // cobaltdragoon
    component.toLowerCase().replace(/\s+/g, '-'), // cobalt-dragoon
    component
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/\s+/g, '-') // CobaltDragoon -> cobalt-dragoon
  ];
  return [
    ...attempts.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.webp`),
    ...attempts.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.png`),
  ];
};

function ComponentImage({ 
  name, 
  type, 
  fallbackIcon, 
  testId 
}: { 
  name: string; 
  type: string; 
  fallbackIcon: React.ReactNode;
  testId: string;
}) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const imageUrls = getImageUrls(name, type);

  const handleImageError = () => {
    if (attemptIndex < imageUrls.length - 1) {
      setAttemptIndex(attemptIndex + 1);
    }
  };

  return (
    <div className="w-24 h-24 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
      {attemptIndex >= imageUrls.length ? (
        <div className="flex items-center justify-center">
          {fallbackIcon}
        </div>
      ) : (
        <img
          key={attemptIndex}
          src={imageUrls[attemptIndex]}
          alt={name}
          className="w-full h-full object-contain"
          onError={handleImageError}
          data-testid={testId}
        />
      )}
    </div>
  );
}

interface TopComponentsResponse {
  blade: BladeStats | null;
  ratchet: RatchetStats | null;
  bit: BitStats | null;
}

export default function Home() {
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const [leaderboardType, setLeaderboardType] = useState<"blade"|"ratchet"|"bit"|null>(null);
  const dialogOpen = leaderboardType !== null;
  const [activeTab, setActiveTab] = useState<'components'|'players'>('components');
  const [selectedSeason, setSelectedSeason] = useState<string>("Off Season 2025");
  
  const { data: topComponents, isLoading } = useQuery<TopComponentsResponse>({
    queryKey: ['/api/stats/top/components', selectedSeason],
    queryFn: async () => {
      const res = await fetch(`/api/stats/top/components?season=${encodeURIComponent(selectedSeason)}`);
      if (!res.ok) throw new Error("Failed to fetch top components");
      return res.json();
    },
  });

  const topBlade = topComponents?.blade;
  const topRatchet = topComponents?.ratchet;
  const topBit = topComponents?.bit;
  
  const bladeLoading = isLoading;
  const ratchetLoading = isLoading;
  const bitLoading = isLoading;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
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
              <span className="text-sm text-muted-foreground">Stagione</span>
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
            <Card className="p-6">
              <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
            </Card>
          ) : !topBlade ? (
            <Card className="p-6 cursor-pointer" data-testid="card-top-blade-empty" onClick={() => setLeaderboardType('blade')}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold">Top Blade</h2>
              </div>
              <div className="py-6 text-center">
                <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nessun dato disponibile
                </p>
              </div>
            </Card>
          ) : (
            <Card className="p-6 space-y-4 cursor-pointer" data-testid="card-top-blade" onClick={() => setLeaderboardType('blade')}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold">Top Blade</h2>
              </div>
              
              <div className="flex items-center gap-4">
                <ComponentImage 
                  name={topBlade.blade}
                  type="blades"
                  fallbackIcon={<Shield className="w-12 h-12 text-muted-foreground" />}
                  testId="img-top-blade"
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
            <Card className="p-6">
              <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
            </Card>
          ) : !topRatchet ? (
            <Card className="p-6 cursor-pointer" data-testid="card-top-ratchet-empty" onClick={() => setLeaderboardType('ratchet')}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold">Top Ratchet</h2>
              </div>
              <div className="py-6 text-center">
                <Cog className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nessun dato disponibile
                </p>
              </div>
            </Card>
          ) : (
            <Card className="p-6 space-y-4 cursor-pointer" data-testid="card-top-ratchet" onClick={() => setLeaderboardType('ratchet')}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold">Top Ratchet</h2>
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
            <Card className="p-6">
              <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
            </Card>
          ) : !topBit ? (
            <Card className="p-6 cursor-pointer" data-testid="card-top-bit-empty" onClick={() => setLeaderboardType('bit')}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-semibold">Top Bit</h2>
              </div>
              <div className="py-6 text-center">
                <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nessun dato disponibile
                </p>
              </div>
            </Card>
          ) : (
            <Card className="p-6 space-y-4 cursor-pointer" data-testid="card-top-bit" onClick={() => setLeaderboardType('bit')}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-5 h-5 text-amber-600" />
                <h2 className="text-lg font-semibold">Top Bit</h2>
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
      <LeaderboardDialog
        type={leaderboardType}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setLeaderboardType(null);
        }}
      />
    </div>
  );
}
