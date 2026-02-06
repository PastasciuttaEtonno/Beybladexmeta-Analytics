import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type LeaderboardType = "blade" | "ratchet" | "bit";

// Use the public MinIO URL like in Analytics.tsx
const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

if (!PUBLIC_MINIO_URL) {
  console.error(
    "VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.",
  );
}

export function LeaderboardDialog({
  type,
  season,
  open,
  onOpenChange,
}: {
  type: LeaderboardType | null;
  season?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeType: LeaderboardType = useMemo(() => (type || "blade"), [type]);

  const { data, isLoading } = useQuery<{ items: any[]; type: string; limit: number }>(
    {
      enabled: open && !!type,
      queryKey: ["/api/stats/leaderboard", activeType, season],
      queryFn: async () => {
        const queryParams = new URLSearchParams();
        queryParams.set("limit", "10");
        if (season) queryParams.set("season", season);
        const resp = await fetch(`/api/stats/leaderboard/${activeType}?${queryParams.toString()}`);
        if (!resp.ok) throw new Error("Failed to fetch leaderboard");
        return resp.json();
      },
    }
  );

  const titleMap: Record<LeaderboardType, string> = {
    blade: "Top Blades",
    ratchet: "Top Ratchets",
    bit: "Top Bits",
  };

  const folderMap: Record<LeaderboardType, string> = {
    blade: "blades",
    ratchet: "ratchets",
    bit: "bits",
  };

  const items = data?.items || [];
  const title = titleMap[activeType];
  const folder = folderMap[activeType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="h-20 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-2">
            {items.map((row, index) => (
              <Card key={`${activeType}-${index}`} className="p-3 flex items-center gap-2">
                <div className="w-10 text-center">
                  <Badge variant="secondary" className="text-xs">
                    {index + 1}
                  </Badge>
                </div>
                <div className="w-12 h-12">
                  <ComponentImage folder={folder} name={row[activeType]} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{row[activeType]}</p>
                  <div className="mt-1 space-y-1">
                    <div className="flex">
                      <Badge variant="outline" className="text-xs">
                        Score: {Number(row.punteggioTotale).toLocaleString()}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-xs">1st: {row.primiPosti}</Badge>
                      <Badge variant="secondary" className="text-xs">2nd: {row.secondiPosti}</Badge>
                      <Badge variant="secondary" className="text-xs">3rd: {row.terziPosti}</Badge>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-6 text-center">No data</Card>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ComponentImage({ folder, name }: { folder: string; name: string }) {
  const attempts = [
    name?.toLowerCase()?.replace(/\s+/g, ""),
    name?.toLowerCase()?.replace(/\s+/g, "-"),
    name
      ?.replace(/([a-z])([A-Z])/g, "$1-$2")
      ?.toLowerCase()
      ?.replace(/\s+/g, "-"),
  ].filter(Boolean) as string[];
  const sources = [
    // Prefer PNG first, then fallback to WEBP
    ...attempts.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.png`),
    ...attempts.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.webp`),
  ];

  return (
    <img
      src={sources[0]}
      data-current-index={0}
      onError={(e) => {
        const img = e.currentTarget;
        const currentIndex = Number(img.getAttribute('data-current-index') || '0');
        const nextIndex = currentIndex + 1;
        if (nextIndex < sources.length) {
          img.setAttribute('data-current-index', String(nextIndex));
          img.src = sources[nextIndex];
        }
      }}
      alt={`${name} component image`}
      loading="lazy"
      className="w-12 h-12 object-contain"
    />
  );
}