import { DesktopSidebar } from "./DesktopSidebar";

interface DesktopLayoutProps {
    children: React.ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
    return (
        <div className="hidden md:flex min-h-screen bg-background text-foreground">
            {/* Fixed Background */}
            <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/20 via-background to-background" />

            <DesktopSidebar />
            <main className="flex-1 overflow-y-auto h-screen scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className="w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
