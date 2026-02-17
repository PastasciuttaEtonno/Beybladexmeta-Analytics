import { Button } from "@/components/ui/button";
import { User } from "@shared/schema";

interface LinkedAccountsCardProps {
    user: any;
}

export function LinkedAccountsCard({ user }: LinkedAccountsCardProps) {
    if (!user) return null;

    return (
        <div className="space-y-6">
            {/* Challengermode Section */}
            <div className="space-y-2">
                {user.challengerId ? (
                    <div className="p-3 bg-green-500/10 text-green-700 dark:text-green-400 rounded-md text-sm border border-green-500/20">
                        Challengermode: <strong>{(user as any).challengermodeUsername || user.challengerId}</strong>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full bg-[#171A21] text-white hover:bg-[#171A21]/90 border-0"
                        onClick={() => { window.location.href = "/api/challenger/login"; }}
                    >
                        Collega account Challengermode
                    </Button>
                )}
            </div>

            {/* Challonge Section */}
            <div className="space-y-2">
                {(user as any)?.challongeUsername || user.challongeId ? (
                    <div className="p-3 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md text-sm border border-orange-500/20">
                        Challonge: <strong>{(user as any).challongeUsername || "Challonge User"}</strong>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-orange-500 text-orange-500 hover:bg-orange-500/10"
                        onClick={() => { window.location.href = "/api/challonge/login"; }}
                    >
                        Collega account Challonge
                    </Button>
                )}
            </div>
        </div>
    );
}
