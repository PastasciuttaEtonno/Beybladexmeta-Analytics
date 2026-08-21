import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { MobileLeaderboardList } from "@/components/leaderboard/MobileLeaderboardList";
import { DesktopLeaderboardTable } from "@/components/leaderboard/DesktopLeaderboardTable";

type LeaderboardType = "blade" | "ratchet" | "bit";

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
      <DialogContent className="max-w-sm md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-2xl font-bold">{title}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="h-20 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <>
            <MobileLeaderboardList items={items} activeType={activeType} folder={folder} />
            <DesktopLeaderboardTable items={items} activeType={activeType} folder={folder} />
          </>
        ) : (
          <Card className="p-6 text-center">No data</Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
