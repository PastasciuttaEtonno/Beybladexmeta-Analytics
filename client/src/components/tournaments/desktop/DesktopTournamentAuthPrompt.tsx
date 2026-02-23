import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

interface DesktopTournamentAuthPromptProps {
    platform: "challengermode" | "challonge";
}

export function DesktopTournamentAuthPrompt({ platform }: DesktopTournamentAuthPromptProps) {
    const platformName = platform === "challonge" ? "Challonge" : "Challengermode";

    return (
        <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-md px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
                Accedi con <span className="font-semibold text-foreground">{platformName}</span> per registrare le combo usate in questo torneo.
            </p>
            <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={() => { window.location.href = "/login"; }}
            >
                <LogIn className="w-4 h-4" />
                Accedi con {platformName}
            </Button>
        </div>
    );
}
