import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { BladeStats, RatchetStats, BitStats } from '@shared/schema';

const getImageUrl = (component: string, type: string) => {
  const normalized = component.toLowerCase().replace(/\s+/g, '-');
  return `/api/object-storage/public/${type}/${normalized}.png`;
};

export default function Home() {
  const { data: bladeData, isLoading: bladeLoading } = useQuery<{ blade: BladeStats | null }>({
    queryKey: ['/api/stats/top/blade'],
  });

  const { data: ratchetData, isLoading: ratchetLoading } = useQuery<{ ratchet: RatchetStats | null }>({
    queryKey: ['/api/stats/top/ratchet'],
  });

  const { data: bitData, isLoading: bitLoading } = useQuery<{ bit: BitStats | null }>({
    queryKey: ['/api/stats/top/bit'],
  });

  const topBlade = bladeData?.blade;
  const topRatchet = ratchetData?.ratchet;
  const topBit = bitData?.bit;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Il Meta in Sintesi" />
      
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            I componenti più performanti nei tornei
          </p>
        </div>

        <div className="space-y-4">
          {(bladeLoading || !topBlade) ? (
            <Card className="p-6">
              <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
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
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<div class="text-3xl">🛡️</div>';
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

          {(ratchetLoading || !topRatchet) ? (
            <Card className="p-6">
              <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
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
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<div class="text-3xl">⚙️</div>';
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

          {(bitLoading || !topBit) ? (
            <Card className="p-6">
              <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
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
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<div class="text-3xl">⚡</div>';
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
