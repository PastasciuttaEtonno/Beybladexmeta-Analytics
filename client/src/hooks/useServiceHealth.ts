import { useEffect, useState } from "react";

type ServiceStatus = "unknown" | "ok" | "unavailable";

/**
 * Polls /api/health to detect if the database is reachable.
 * Returns "ok" | "unavailable" | "unknown" (initial state).
 */
export function useServiceHealth(pollIntervalMs = 20_000): ServiceStatus {
    const [status, setStatus] = useState<ServiceStatus>("unknown");

    const check = async () => {
        try {
            const res = await fetch("/api/health", { credentials: "include" });
            if (!res.ok) {
                setStatus("unavailable");
                return;
            }
            const data = await res.json();
            setStatus(data.db === "ok" ? "ok" : "unavailable");
        } catch {
            setStatus("unavailable");
        }
    };

    useEffect(() => {
        check();
        const id = setInterval(check, pollIntervalMs);
        return () => clearInterval(id);
    }, [pollIntervalMs]);

    return status;
}
