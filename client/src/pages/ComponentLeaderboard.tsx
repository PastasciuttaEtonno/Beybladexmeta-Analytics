import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";

function ComponentImage({ folder, name }: { folder: string; name: string }) {
  const attempts = [
    name.toLowerCase().replace(/\s+/g, ""),
    name.toLowerCase().replace(/\s+/g, "-"),
    name
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/\s+/g, "-"),
  ];
  const sources = [
    ...attempts.map((v) => `/public-objects/${folder}/${v}.webp`),
    ...attempts.map((v) => `/public-objects/${folder}/${v}.png`),
  ];

  return (
    <img
      src={sources[0]}
      onError={(e) => {
        const img = e.currentTarget;
        const idx = sources.indexOf(img.src.replace(window.location.origin, ""));
        const next = sources[idx + 1];
        if (next) img.src = next;
      }}
      alt={name}
      className="w-14 h-14 object-contain"
    />
  );
}

export default function ComponentLeaderboard() {
  const [match, params] = useRoute("/leaderboard/:type");
  const [, setLocation] = useLocation();
  const type = (params?.type || "blade").toLowerCase();
  const titleMap: Record<string, string> = {
    blade: "Top Blades",
    ratchet: "Top Ratchets",
    bit: "Top Bits",
  };
  const folderMap: Record<string, string> = {
    blade: "blades",
    ratchet: "ratchets",
    bit: "bits",
  };

  const { data, isLoading } = useQuery<{ items: any[]; type: string; limit: number }>({
    queryKey: ["/api/stats/leaderboard", type],
    queryFn: async () => {
      const resp = await fetch(`/api/stats/leaderboard/${type}?limit=10`);
      if (!resp.ok) throw new Error("Failed to fetch leaderboard");
      return resp.json();
    },
  });

  const items = data?.items || [];
  const title = titleMap[type] || "Leaderboard";
  const folder = folderMap[type] || "blades";

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title={title} action={<HeaderLogo />} />
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Card key={i} className="h-20 bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-2">
            {items.map((row, index) => (
              <Card key={`${type}-${index}`} className="p-3 flex items-center gap-3">
                <div className="w-10 text-center">
                  <Badge variant="secondary" className="text-xs">
                    {index + 1}
                  </Badge>
                </div>
                <div className="w-16 h-16">
                  <ComponentImage folder={folder} name={row[type]} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{row[type]}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Score: {Number(row.punteggioTotale).toLocaleString()}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      1st: {row.primiPosti}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      2nd: {row.secondiPosti}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      3rd: {row.terziPosti}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-6 text-center">No data</Card>
        )}
      </main>
    </div>
  );
}