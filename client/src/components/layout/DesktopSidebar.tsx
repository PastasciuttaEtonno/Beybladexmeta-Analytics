import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Home, BarChart3, Star, Trophy, User, Sun, Moon } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useTheme } from "@/contexts/ThemeProvider";

const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/favorites', icon: Star, label: 'Preferiti' },
    { path: '/tournaments', icon: Trophy, label: 'Tornei' },
    { path: '/profile', icon: User, label: 'Profilo' },
];

export function DesktopSidebar() {
    const [location] = useLocation();
    const { theme, toggleTheme } = useTheme();
    const logoSrc = theme === "dark" ? "/meta logoWhite.svg" : "/meta logo.svg";

    return (
        <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 border-r border-border bg-background/80 backdrop-blur-md">
            <div className="p-2 border-b border-border flex justify-center">
                <img src={logoSrc} alt="Beybladexmeta Analytics Logo" className="h-24 w-auto" data-testid="img-header-logo" />
            </div>

            <nav className="flex-1 p-4 space-y-4">
                {navItems.map(({ path, icon: Icon, label }) => {
                    const isActive = location === path;
                    return (
                        <Link key={path} href={path}>
                            <a
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group no-underline",
                                    isActive
                                        ? "bg-primary/10 text-primary font-medium shadow-sm border border-primary/20"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "group-hover:text-primary transition-colors")} />
                                {label}
                            </a>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-border space-y-4">
                <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 px-4 py-2 w-full rounded-xl transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground group"
                >
                    {theme === "dark" ? (
                        <>
                            <Sun className="w-5 h-5 group-hover:text-yellow-500 transition-colors" />
                            <span>Light Mode</span>
                        </>
                    ) : (
                        <>
                            <Moon className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                            <span>Dark Mode</span>
                        </>
                    )}
                </button>

                <div className="p-4 rounded-xl bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground font-medium">Beybladexmeta Analytics</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Version 1.0.0</p>
                </div>
            </div>
        </aside>
    );
}
