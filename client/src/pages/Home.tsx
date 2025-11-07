import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Shield, Cog, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeProvider';
import { useState } from 'react';
import type { BladeStats, RatchetStats, BitStats } from '@shared/schema';

const getImageUrls = (component: string, type: string): string[] => {
  const normalized = component.toLowerCase().replace(/\s+/g, '-');
  return [
    `/public-objects/${type}/${normalized}.webp`,
    `/public-objects/${type}/${normalized}.png`,
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
    setAttemptIndex(attemptIndex + 1);
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
  
  const { data: topComponents, isLoading } = useQuery<TopComponentsResponse>({
    queryKey: ['/api/stats/top/components'],
  });

  const topBlade = topComponents?.blade;
  const topRatchet = topComponents?.ratchet;
  const topBit = topComponents?.bit;
  
  const bladeLoading = isLoading;
  const ratchetLoading = isLoading;
  const bitLoading = isLoading;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="flex items-center justify-between h-16 px-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <img
              src={theme === 'dark' ? '/meta logoWhite.svg' : '/meta logo.svg'}
              alt="Logo"
              className="h-12 w-auto"
              data-testid="img-home-logo"
            />
            <h1 className="text-xl font-bold" data-testid="text-page-title">Il Meta in Sintesi</h1>
          </div>
        </div>
      </header>
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">

        <div className="space-y-4">
          {bladeLoading ? (
            <Card className="p-6">
              <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
            </Card>
          ) : !topBlade ? (
            <Card className="p-6" data-testid="card-top-blade-empty">
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
            <Card className="p-6 space-y-4" data-testid="card-top-blade">
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
            <Card className="p-6" data-testid="card-top-ratchet-empty">
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
            <Card className="p-6 space-y-4" data-testid="card-top-ratchet">
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
            <Card className="p-6" data-testid="card-top-bit-empty">
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
            <Card className="p-6 space-y-4" data-testid="card-top-bit">
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
        </div>
      </main>
    </div>
  );
}
