import { Button } from "@/components/ui/button";
import { Gamepad2, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";

interface LinkedAccountsCardProps {
    user: any;
}

export function LinkedAccountsCard({ user }: LinkedAccountsCardProps) {
    if (!user) return null;

    const SettingsRow = ({
        icon: Icon,
        label,
        value,
        action,
        onClick,
        href
    }: {
        icon: any,
        label: string,
        value?: React.ReactNode,
        action?: React.ReactNode,
        onClick?: () => void,
        href?: string
    }) => {
        return (
            <div
                className={`flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-accent/50 ${onClick || href ? "cursor-pointer" : ""}`}
                onClick={onClick}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted text-muted-foreground">
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-medium text-sm text-foreground">
                            {label}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {value && <span className="text-xs text-muted-foreground">{value}</span>}
                    {action}
                </div>
            </div>
        );
    };

    return (
        <div className="divide-y divide-border">
            {/* Challonge */}
            <SettingsRow
                icon={Gamepad2}
                label="Challonge"
                value={(user as any)?.challongeUsername || (user?.challongeId ? "Connected" : "Not Connected")}
                action={
                    user?.challongeId ? (
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    ) : (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.location.href = "/api/challonge/login"}>Connect</Button>
                    )
                }
            />

            {/* Challengermode */}
            <SettingsRow
                icon={Gamepad2}
                label="Challengermode"
                value={(user as any)?.challengermodeUsername || (user?.challengerId ? "Connected" : "Not Connected")}
                action={
                    user?.challengerId ? (
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    ) : (
                        <Button variant="outline" size="sm" className="h-7 text-xs bg-[#171A21] text-white hover:bg-[#171A21]/90 border-0" onClick={() => window.location.href = "/api/challenger/login"}>Connect</Button>
                    )
                }
            />
        </div>
    );
}
