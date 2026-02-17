import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Home, BarChart3, Star, Trophy, User } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";

const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/favorites', icon: Star, label: 'Preferiti' },
    { path: '/tournaments', icon: Trophy, label: 'Tornei' },
    { path: '/profile', icon: User, label: 'Profilo' },
];

export function DesktopSidebar() {
    const [location] = useLocation();

    return (
        <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 border-r border-white/10 bg-background/80 backdrop-blur-md">
            <div className="p-6 border-b border-white/10">
                <HeaderLogo />
            </div>

            <nav className="flex-1 p-4 space-y-2">
                {navItems.map(({ path, icon: Icon, label }) => {
                    const isActive = location === path;
                    return (
                        <Link key={path} href={path}>
                            <a
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group no-underline",
                                    isActive
                                        ? "bg-primary/10 text-primary font-medium shadow-sm border border-primary/20"
                                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                )}
                            >
                                <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "group-hover:text-primary transition-colors")} />
                                {label}
                            </a>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/10">
                <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/10">
                    <p className="text-xs text-muted-foreground font-medium">Beybladexmeta Analytics</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Version 1.0.0</p>
                </div>
            </div>
        </aside>
    );
}
