import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export function ParticipationsList() {
    const { data, isLoading } = useQuery({
        queryKey: ["/api/me/tournaments"],
        queryFn: async () => {
            const res = await fetch("/api/me/tournaments");
            if (!res.ok) throw new Error("Failed to fetch tournaments");
            return res.json();
        },
        retry: false,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const items: any[] = data?.tournaments || [];

    if (!items.length) {
        return <p className="text-sm text-muted-foreground">Nessun torneo trovato.</p>;
    }

    const formatDate = (d: string | null) => {
        if (!d) return 'Data sconosciuta';
        try {
            return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch { return d; }
    };

    return (
        <div className="space-y-2">
            {items.map((t) => (
                <Link key={t.tournamentId} href={`/tournaments/${encodeURIComponent(t.tournamentId)}`} asChild>
                    <a className="block no-underline">
                        <Card className="p-3 cursor-pointer hover-elevate active-elevate-2 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{t.name || `Torneo ${t.tournamentId}`}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(t.date)} • {t.platform === 'challonge' ? 'Challonge' : 'Challengermode'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {t.bestPlacement != null && (
                                        <Badge variant="secondary" className="text-xs">#{t.bestPlacement}</Badge>
                                    )}
                                </div>
                            </div>
                        </Card>
                    </a>
                </Link>
            ))}
        </div>
    );
}
