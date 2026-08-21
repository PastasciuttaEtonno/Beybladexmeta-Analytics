import { useEffect, useState } from "react";
import { DatabaseZap, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ServiceUnavailable() {
    const [retryIn, setRetryIn] = useState(15);
    const [checking, setChecking] = useState(false);

    const checkHealth = async () => {
        setChecking(true);
        try {
            const res = await fetch("/api/health", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                if (data.db === "ok") {
                    window.location.reload();
                    return;
                }
            }
        } catch {
            // still down
        } finally {
            setChecking(false);
        }
        setRetryIn(15);
    };

    useEffect(() => {
        const interval = setInterval(() => {
            setRetryIn((prev) => {
                if (prev <= 1) {
                    checkHealth();
                    return 15;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16 text-center">
            {/* Animated icon */}
            <div className="relative mb-8">
                <div className="w-24 h-24 rounded-full bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
                    <DatabaseZap className="w-11 h-11 text-amber-500" />
                </div>
                <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-background flex items-center justify-center ring-1 ring-border">
                    <Wifi className="w-4 h-4 text-destructive" />
                </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight mb-2">
                Servizio temporaneamente non disponibile
            </h1>
            <p className="text-muted-foreground max-w-sm mb-1">
                Il team è già al corrente del problema e sta lavorando per risolverlo.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
                Nuovo tentativo automatico tra{" "}
                <span className="font-semibold text-foreground tabular-nums">
                    {retryIn}s
                </span>
            </p>

            <Button
                variant="outline"
                onClick={checkHealth}
                disabled={checking}
                className="gap-2 min-w-[160px]"
            >
                <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                {checking ? "Verifica in corso…" : "Riprova ora"}
            </Button>

            <p className="mt-12 text-xs text-muted-foreground/50">
                Beybladexmeta Analytics
            </p>
        </div>
    );
}
