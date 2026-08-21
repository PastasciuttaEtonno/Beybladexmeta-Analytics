import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
    ChevronRight,
    LogOut,
    Shield,
    FileText,
    Gamepad2,
    Link as LinkIcon,
    AlertCircle
} from "lucide-react";
import { ParticipationsList } from "@/components/profile/ParticipationsList";

import { AccountLinkingAlert } from "@/components/profile/AccountLinkingAlert";

interface ProfileSettingsPanelProps {
    user: any;
    handleLogout: () => void;
    onOpenAliases: () => void;
    /** Why the last OAuth linking attempt failed, if it did. */
    linkError?: string | null;
    onDismissLinkError?: () => void;
}

export function ProfileSettingsPanel({ user, handleLogout, onOpenAliases, linkError, onDismissLinkError }: ProfileSettingsPanelProps) {

    // Reusable Row Component
    const SettingsRow = ({
        icon: Icon,
        label,
        value,
        action,
        danger = false,
        onClick,
        href
    }: {
        icon: any,
        label: string,
        value?: React.ReactNode,
        action?: React.ReactNode,
        danger?: boolean,
        onClick?: () => void,
        href?: string
    }) => {
        const Content = (
            <div
                className={`flex items-center justify-between p-4 rounded-lg transition-colors group ${onClick || href ? "hover:bg-accent/50 cursor-pointer" : ""
                    } ${danger ? "hover:bg-destructive/10" : ""}`}
                onClick={onClick}
            >
                <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-md ${danger ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground transition-colors"}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className={`font-medium text-sm ${danger ? "text-red-500" : "text-foreground"}`}>
                            {label}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {value && <span className="text-sm text-muted-foreground">{value}</span>}
                    {action}
                    {(onClick || href) && !action && <ChevronRight className="w-4 h-4 text-muted-foreground/50" />}
                </div>
            </div>
        );

        if (href) {
            return (
                <Link href={href}>
                    <a className="block no-underline">{Content}</a>
                </Link>
            );
        }

        return Content;
    };

    return (
        <div className="flex flex-col">
            <div className="max-w-3xl w-full mx-auto p-8 space-y-8">

                {/* Header */}
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Impostazioni</h2>
                    <p className="text-sm text-muted-foreground">Gestisci le tue preferenze e le tue integrazioni.</p>
                </div>

                {/* Section 1: Integrations */}
                {user && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Integrazioni</h3>
                            {(!user?.challongeId || !user?.challengerId) && (
                                <span className="text-xs text-amber-500 font-medium flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Azione Richiesta
                                </span>
                            )}
                        </div>

                        {linkError && onDismissLinkError && (
                            <div className="mb-3">
                                <AccountLinkingAlert error={linkError} onDismiss={onDismissLinkError} />
                            </div>
                        )}

                        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-border">
                            {/* Challonge */}
                            <SettingsRow
                                icon={Gamepad2}
                                label="Challonge"
                                value={user?.challongeId ? "Connected" : "Not Connected"}
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
                                value={user?.challengerId ? "Connected" : "Not Connected"}
                                action={
                                    user?.challengerId ? (
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                    ) : (
                                        <Button variant="outline" size="sm" className="h-7 text-xs bg-[#171A21] text-white hover:bg-[#171A21]/90 border-0" onClick={() => window.location.href = "/api/challenger/login"}>Connect</Button>
                                    )
                                }
                            />

                            {/* Aliases */}
                            <SettingsRow
                                icon={LinkIcon}
                                label="Alias di Gioco"
                                value="Gestisci i nickname"
                                onClick={onOpenAliases}
                            />
                        </div>
                    </div>
                )}

                {/* Section 2: Tournaments */}
                {user?.challengerId && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tornei</h3>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                            <ParticipationsList />
                        </div>
                    </div>
                )}

                {/* Section 3: Legal */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">Legali</h3>
                    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-border">
                        <SettingsRow icon={Shield} label="Privacy Policy" href="/privacy-policy" />
                        <SettingsRow icon={FileText} label="Termini del Servizio" href="/terms" />
                    </div>
                </div>

                {/* Section 4: Danger */}
                {user && (
                    <div className="space-y-4 pb-12">
                        <h3 className="text-sm font-medium text-destructive/80 uppercase tracking-wider px-1">Danger Zone</h3>
                        <div className="bg-card border border-destructive/20 rounded-xl overflow-hidden shadow-sm">
                            <SettingsRow
                                icon={LogOut}
                                label="Sign Out"
                                danger
                                onClick={handleLogout}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
