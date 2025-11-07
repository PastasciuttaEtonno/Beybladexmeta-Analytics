import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Shield, Cog, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeProvider';
import type { BladeStats, RatchetStats, BitStats } from '@shared/schema';

const getImageUrl = (component: string, type: string) => {
  const normalized = component.toLowerCase().replace(/\s+/g, '-');
  return `/public-objects/${type}/${normalized}.png`;
};

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
                <div className="w-24 h-24 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
                  <img
                    src={getImageUrl(topBlade.blade, 'blades')}
                    alt={topBlade.blade}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        e.currentTarget.remove();
                        const icon = document.createElement('div');
                        icon.className = 'flex items-center justify-center';
                        const svg = '<svg class="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>';
                        icon.innerHTML = svg;
                        parent.appendChild(icon);
                      }
                    }}
                    data-testid="img-top-blade"
                  />
                </div>
                
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
                <div className="w-24 h-24 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
                  <img
                    src={getImageUrl(topRatchet.ratchet, 'ratchets')}
                    alt={topRatchet.ratchet}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        e.currentTarget.remove();
                        const icon = document.createElement('div');
                        icon.className = 'flex items-center justify-center';
                        const svg = '<svg class="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>';
                        icon.innerHTML = svg;
                        parent.appendChild(icon);
                      }
                    }}
                    data-testid="img-top-ratchet"
                  />
                </div>
                
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
                <div className="w-24 h-24 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
                  <img
                    src={getImageUrl(topBit.bit, 'bits')}
                    alt={topBit.bit}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        e.currentTarget.remove();
                        const icon = document.createElement('div');
                        icon.className = 'flex items-center justify-center';
                        const svg = '<svg class="w-12 h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>';
                        icon.innerHTML = svg;
                        parent.appendChild(icon);
                      }
                    }}
                    data-testid="img-top-bit"
                  />
                </div>
                
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
