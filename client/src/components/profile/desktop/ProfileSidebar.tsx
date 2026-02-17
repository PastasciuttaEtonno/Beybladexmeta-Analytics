import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User } from "@shared/schema";
import { Edit2, ShieldCheck, Gamepad2 } from "lucide-react";
import { Link } from "wouter";

interface ProfileSidebarProps {
    user: any;
}

export function ProfileSidebar({ user }: ProfileSidebarProps) {
    if (!user) {
        return (
            <div className="flex flex-col min-[1175px]:h-full items-center p-6 min-[1175px]:p-8">
                <div className="w-24 h-24 min-[1175px]:w-32 min-[1175px]:h-32 rounded-full border-4 border-dashed border-border/50 flex items-center justify-center mb-6 bg-muted/20">
                    <Gamepad2 className="w-10 h-10 min-[1175px]:w-12 min-[1175px]:h-12 text-muted-foreground/40" />
                </div>
                <div className="text-center w-full mb-8">
                    <h2 className="text-xl min-[1175px]:text-2xl font-bold tracking-tight text-foreground mb-1">
                        Bentornato!
                    </h2>
                    <p className="text-sm text-muted-foreground font-medium">
                        Accedi per gestire il tuo profilo e i tornei.
                    </p>
                </div>
                <div className="w-full max-w-[240px]">
                    <Link href="/login">
                        <a className="inline-flex items-center justify-center w-full h-11 px-6 py-2 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                            Accedi / Registrati
                        </a>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-[1175px]:h-full items-center p-6 min-[1175px]:p-8">
            {/* Avatar Section */}
            <div className="relative mb-6">
                <div className="w-24 h-24 min-[1175px]:w-32 min-[1175px]:h-32 rounded-full overflow-hidden border-4 border-background shadow-xl bg-primary/10 flex items-center justify-center">
                    {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-3xl min-[1175px]:text-4xl font-bold text-primary">
                            {user.displayName?.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>
                {/* Status Badge - positioned absolute */}
                <div className="absolute -bottom-1 -right-1 min-[1175px]:-bottom-2 min-[1175px]:-right-2">
                    {user.challengerId ? (
                        <Badge className="bg-green-500 hover:bg-green-600 border-2 border-background px-2 py-0.5 min-[1175px]:px-3 min-[1175px]:py-1 gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span className="text-[10px] min-[1175px]:text-xs">Pro</span>
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="border-2 border-background px-2 py-0.5 min-[1175px]:px-3 min-[1175px]:py-1 text-[10px] min-[1175px]:text-xs">
                            Member
                        </Badge>
                    )}
                </div>
            </div>

            {/* Identity Section */}
            <div className="text-center w-full mb-6 min-[1175px]:mb-8">
                <h2 className="text-xl min-[1175px]:text-2xl font-bold tracking-tight text-foreground mb-1 truncate">
                    {user.displayName}
                </h2>
                <p className="text-sm text-muted-foreground truncate font-medium">
                    {(user as any).username || "Beyblade X Player"}
                </p>
            </div>

            {/* Mini Stats or Info - Only show on Sidebar layout for extra polish */}
            <div className="hidden min-[1175px]:block mt-auto w-full pt-8 border-t border-border/50">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Member since</span>
                    <span>2024</span>
                </div>
            </div>
        </div>
    );
}
