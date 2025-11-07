import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trophy, Medal, Award } from "lucide-react";

type ComboStats = {
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
  primiPosti: number;
  secondiPosti: number;
  terziPosti: number;
  punteggioTotale: number;
};

function ComponentImage({ folder, name }: { folder: string; name: string }) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  
  const getImageVariations = (name: string, format: 'png' | 'webp') => {
    const variations = [
      name.toLowerCase().replace(/\s+/g, ''),
      name.toLowerCase().replace(/\s+/g, '-'),
      name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/\s+/g, '-'),
    ];
    return variations.map(v => `/public-objects/${folder}/${v}.${format}`);
  };

  const allAttempts = [
    ...getImageVariations(name, 'png'),
    ...getImageVariations(name, 'webp'),
  ];

  const handleImageError = () => {
    if (attemptIndex < allAttempts.length - 1) {
      setAttemptIndex(attemptIndex + 1);
    }
  };

  return (
    <div className="aspect-square bg-muted rounded-md overflow-hidden flex items-center justify-center">
      {attemptIndex >= allAttempts.length ? (
        <div className="text-center p-4">
          <p className="text-sm text-muted-foreground">Image not available</p>
        </div>
      ) : (
        <img
          key={attemptIndex}
          src={allAttempts[attemptIndex]}
          alt={name}
          className="w-full h-full object-contain"
          onError={handleImageError}
          data-testid={`img-${folder}`}
        />
      )}
    </div>
  );
}

export default function ComboDetail() {
  const [, params] = useRoute("/combo/:id");
  const [, setLocation] = useLocation();
  
  const comboId = params?.id;

  const { data, isLoading } = useQuery<{ combos: ComboStats[] }>({
    queryKey: ["/api/stats/combos"],
  });

  if (!comboId) {
    return null;
  }

  const decodedId = decodeURIComponent(comboId);
  const combo = data?.combos.find(c => 
    `${c.blade}|${c.assistBlade}|${c.ratchet}|${c.bit}|${c.lockChip}` === decodedId
  );

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-8 h-8 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-8 h-8 text-slate-400" />;
    if (rank === 3) return <Award className="w-8 h-8 text-amber-700" />;
    return null;
  };

  const rank = combo && data ? data.combos.findIndex(c => 
    `${c.blade}|${c.assistBlade}|${c.ratchet}|${c.bit}|${c.lockChip}` === decodedId
  ) + 1 : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 pb-24">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-64 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!combo) {
    return (
      <div className="min-h-screen bg-background p-4 pb-24">
        <div className="max-w-2xl mx-auto space-y-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/analytics")}
            className="gap-2"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">Combo not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const allComponents = [
    { label: "Blade", value: combo.blade, folder: "blades" },
    { label: "Assist Blade", value: combo.assistBlade, folder: "assist-blades" },
    { label: "Ratchet", value: combo.ratchet, folder: "ratchets" },
    { label: "Bit", value: combo.bit, folder: "bits" },
    { label: "Lock Chip", value: combo.lockChip, folder: "chips" },
  ];

  const components = allComponents.filter(component => {
    const value = component.value;
    return value !== null && 
           value !== undefined && 
           value !== "" && 
           value.toUpperCase() !== "NONE" &&
           value !== "-";
  });

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/analytics")}
          className="gap-2"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leaderboard
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-2xl">Combo Details</CardTitle>
                <CardDescription>
                  Rank #{rank} in the leaderboard
                </CardDescription>
              </div>
              {rank <= 3 && (
                <div data-testid={`icon-rank-${rank}`}>
                  {getRankIcon(rank)}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              {components.map((component) => (
                <Card key={component.label} className="overflow-hidden">
                  <CardHeader className="space-y-0.5 pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {component.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-3">
                    <ComponentImage folder={component.folder} name={component.value} />
                    <p className="text-center text-sm font-medium truncate" data-testid={`text-${component.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      {component.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tournament Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">1st Place</p>
                    <p className="text-2xl font-bold" data-testid="text-first-place">
                      {combo.primiPosti}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">2nd Place</p>
                    <p className="text-2xl font-bold" data-testid="text-second-place">
                      {combo.secondiPosti}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">3rd Place</p>
                    <p className="text-2xl font-bold" data-testid="text-third-place">
                      {combo.terziPosti}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Score</p>
                    <p className="text-2xl font-bold text-primary" data-testid="text-total-score">
                      {combo.punteggioTotale}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
