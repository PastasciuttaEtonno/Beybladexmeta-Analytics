import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type LeaderboardType = "blade" | "ratchet" | "bit";

export function LeaderboardDialog({
  type,
  open,
  onOpenChange,
}: {
  type: LeaderboardType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeType: LeaderboardType = useMemo(() => (type || "blade"), [type]);

  const { data, isLoading } = useQuery<{ items: any[]; type: string; limit: number }>(
    {
      enabled: open && !!type,
      queryKey: ["/api/stats/leaderboard", activeType],
      queryFn: async () => {
        const resp = await fetch(`/api/stats/leaderboard/${activeType}?limit=10`);
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
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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
              <Card key={`${activeType}-${index}`} className="p-3 flex items-center gap-3">
                <div className="w-10 text-center">
                  <Badge variant="secondary" className="text-xs">
                    {index + 1}
                  </Badge>
                </div>
                <div className="w-14 h-14">
                  <ComponentImage folder={folder} name={row[activeType]} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{row[activeType]}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Score: {Number(row.punteggioTotale).toLocaleString()}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">1st: {row.primiPosti}</Badge>
                    <Badge variant="secondary" className="text-xs">2nd: {row.secondiPosti}</Badge>
                    <Badge variant="secondary" className="text-xs">3rd: {row.terziPosti}</Badge>
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
    ...attempts.map((v) => `/public-objects/${folder}/${v}.webp`),
    ...attempts.map((v) => `/public-objects/${folder}/${v}.png`),
  ];

  return (
    <img
      src={sources[0]}
      onError={(e) => {
        const img = e.currentTarget;
        const current = img.src.replace(window.location.origin, "");
        const idx = sources.indexOf(current);
        const next = sources[idx + 1];
        if (next) img.src = next;
      }}
      alt={name}
      className="w-14 h-14 object-contain"
    />
  );
}