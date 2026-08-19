import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
// Reverted to aliased paths as the relative paths were incorrect
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Seo } from "@/components/Seo";

// Get the public MinIO URL from the environment variables
// This should be the host, e.g., https://minio.vasquezlisciotto.dev
// We remove any trailing slash to make joining paths easier
const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(
  /\/$/,
  "",
);

if (!PUBLIC_MINIO_URL) {
  console.error(
    "VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.",
  );
}

function ComponentImage({ folder, name }: { folder: string; name: string }) {
  // These are the different filename formats we'll try
  const attempts = [
    name.toLowerCase().replace(/\s+/g, ""), // cobaltdragoon
    name.toLowerCase().replace(/\s+/g, "-"), // cobalt-dragoon
    name
      .replace(/([a-z])([A-Z])/g, "$1-$2") // CobaltDragoon -> cobalt-dragoon
      .toLowerCase()
      .replace(/\s+/g, "-"),
  ];

  // We now build the full, direct URL to your public MinIO bucket
  // Structure: {HOST}/{BUCKET}/{FOLDER}/{FILENAME}
  // Example: https://minio.vasquezlisciotto.dev/beyblades/blades/cobaltdragoon.webp
  const sources = [
    ...attempts.map(
      (v) => `${PUBLIC_MINIO_URL}/${folder}/${v}.webp`,
    ),
    ...attempts.map(
      (v) => `${PUBLIC_MINIO_URL}/${folder}/${v}.png`,
    ),
  ];

  return (
    <img
      src={sources[0]}
      onError={(e) => {
        const img = e.currentTarget;
        // The onError logic is simplified. We just find the current 'src'
        // in our sources array and try the next one.
        const idx = sources.indexOf(img.src);
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
  // This map correctly points to the sub-folders
  const folderMap: Record<string, string> = {
    blade: "blades",
    ratchet: "ratchets",
    bit: "bits",
  };
  const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

  const { data, isLoading } = useQuery<{
    items: any[];
    type: string;
    limit: number;
  }>({
    queryKey: ["/api/stats/leaderboard", type],
    queryFn: async () => {
      const resp = await fetch(
        `/api/stats/leaderboard/${type}?limit=10`,
      );
      if (!resp.ok) throw new Error("Failed to fetch leaderboard");
      return resp.json();
    },
  });

  const items = data?.items || [];
  const title = titleMap[type] || "Leaderboard";
  const folder = folderMap[type] || "blades";
  const firstName = items[0]?.[type] ? String(items[0][type]) : "";
  const imageUrl = firstName
    ? `${PUBLIC_MINIO_URL}/${folder}/${firstName.toLowerCase().replace(/\s+/g, "-")}.webp`
    : `${window.location.origin}/meta%20logo.svg`;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <Seo
        title={`${title} · Beybladexmeta`}
        description={`Classifica dei ${title.toLowerCase()}.`}
        canonical={`${window.location.origin}/leaderboard/${type}`}
        type="website"
        imageUrl={imageUrl}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": title,
          "itemListElement": items.map((row: any, index: number) => ({
            "@type": "ListItem",
            "position": index + 1,
            "name": String(row[type]),
          })),
        }}
      />
      <PageHeader title={title} action={<HeaderLogo />} />
      <main className="flex-1 px-4 py-4 w-full mx-auto space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Card
                key={i}
                className="h-20 bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-2">
            {items.map((row, index) => (
              <Card
                key={`${type}-${index}`}
                className="p-3 flex items-center gap-3"
              >
                <div className="w-10 text-center">
                  <Badge variant="secondary" className="text-xs">
                    {index + 1}
                  </Badge>
                </div>
                <div className="w-16 h-16">
                  <ComponentImage folder={folder} name={row[type]} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {row[type]}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Score:{" "}
                      {Number(row.punteggioTotale).toLocaleString()}
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
