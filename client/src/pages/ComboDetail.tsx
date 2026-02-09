import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trophy, Medal, Award } from "lucide-react";
import { Seo } from "@/components/Seo";

type ComboStats = {
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
  primiPosti: number;
  secondiPosti: number;
  terziPosti: number;
  quartiPosti: number;
  punteggioTotale: number;
  dataCreazione: string; // Assuming it's a string in ISO format
};

// Use the public MinIO URL like in Analytics.tsx
const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

if (!PUBLIC_MINIO_URL) {
  console.error(
    "VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.",
  );
}

function ComponentImage({ folder, name }: { folder: string; name: string }) {
  const [attemptIndex, setAttemptIndex] = useState(0);

  const getImageVariations = (name: string, format: "png" | "webp") => {
    const variations = [
      name.toLowerCase().replace(/\s+/g, ""),
      name.toLowerCase().replace(/\s+/g, "-"),
      name
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/\s+/g, "-"),
    ];
    // Build full URL to public MinIO bucket
    return variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.${format}`);
  };

  const allAttempts = [
    ...getImageVariations(name, "webp"),
    ...getImageVariations(name, "png"),
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

  const decodedId = params?.id ? decodeURIComponent(params.id) : null;

  const { data, isLoading, error } = useQuery<{ combo: ComboStats; rank: number }>({
    queryKey: ["/api/stats/combos/by-key", decodedId],
    enabled: !!decodedId,
    queryFn: async () => {
      const resp = await fetch(`/api/stats/combos/by-key?key=${encodeURIComponent(decodedId!)}`);
      if (!resp.ok) throw new Error("Failed to fetch combo");
      return resp.json();
    },
  });

  if (!comboId) {
    return null;
  }

  const combo = data?.combo;

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-8 h-8 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-8 h-8 text-slate-400" />;
    if (rank === 3) return <Award className="w-8 h-8 text-amber-700" />;
    return null;
  };

  const rank = data?.rank ?? 0;

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

  if (!combo && !isLoading) {
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
                {error ? `Errore: ${error.message}` : "Combo non trovata"}
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

  if (!combo) {
    return null;
  }

  const allComponents = [
    { label: "Blade", value: combo.blade, folder: "blades" },
    {
      label: "Assist Blade",
      value: combo.assistBlade,
      folder: "assist-blades",
    },
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

  const comboTitle = [
    combo.lockChip && combo.lockChip.toLowerCase() !== "none" ? combo.lockChip : "",
    combo.blade,
    combo.assistBlade && combo.assistBlade.toLowerCase() !== "none" ? combo.assistBlade : "",
    combo.ratchet && combo.ratchet.toLowerCase() !== "none" ? combo.ratchet : "",
    combo.bit,
  ].filter(Boolean).join(" • ");
  const canonical = `${window.location.origin}/combo/${encodeURIComponent(decodedId || "")}`;
  const origin = window.location.origin;
  const imageUrl = `${origin}/meta%20logo.svg`;

  return (
    <div className="min-h-screen bg-background p-4 pb-24">
      <Seo
        title={`${comboTitle} · Combo`}
        description={`Dettagli della combo: ${comboTitle}. Rank #${rank}.`}
        canonical={canonical}
        type="website"
        imageUrl={imageUrl}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": comboTitle,
          "url": canonical,
        }}
      />
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
            <div className="grid grid-cols-2 gap-3">
              {components.map((component) => (
                <Card key={component.label} className="overflow-hidden">
                  <CardHeader className="space-y-0.5 pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {component.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-3">
                    <ComponentImage
                      folder={component.folder}
                      name={component.value}
                    />
                    <p
                      className="text-center text-sm font-medium truncate"
                      data-testid={`text-${component.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {component.value}
                    </p>
                  </CardContent>
                </Card>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
