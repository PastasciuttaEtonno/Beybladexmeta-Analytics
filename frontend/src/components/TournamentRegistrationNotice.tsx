import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";

export function TournamentRegistrationNotice() {
    const [open, setOpen] = useState(false);
    const [, setLocation] = useLocation();

    useEffect(() => {
        const paramForce = new URLSearchParams(window.location.search).get('showTournamentRegistration');
        if (paramForce === '1') { setOpen(true); return; }
        const dismissedAtStr = localStorage.getItem("tournament_registration_dismissed_at");
        if (!dismissedAtStr) { setOpen(true); return; }
        const dismissedAt = new Date(dismissedAtStr).getTime();
        const now = Date.now();
        const oneDay = 1 * 24 * 60 * 60 * 1000;
        if (!(dismissedAt > 0) || (now - dismissedAt) > oneDay) {
            setOpen(true);
        }
    }, []);

    const close = () => {
        localStorage.setItem("tournament_registration_dismissed_at", new Date().toISOString());
        setOpen(false);
    };

    const goToTournaments = () => {
        setLocation('/tournaments');
        close();
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="fixed bottom-20 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-sm z-[60] pointer-events-auto"
                >
                    <div className="bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start gap-3">
                            <div className="space-y-1">
                                <h3 className="font-semibold text-sm leading-none">Partecipa ai Tornei</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Registra le tue combo per scalare le classifiche!
                                </p>
                            </div>
                            <button
                                onClick={close}
                                className="text-muted-foreground hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
                                aria-label="Chiudi"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={goToTournaments}
                                className="flex-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-medium"
                            >
                                Vai ai Tornei
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
