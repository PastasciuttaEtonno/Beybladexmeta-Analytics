import { DesktopSidebar } from "./DesktopSidebar";

interface DesktopLayoutProps {
    children: React.ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
    return (
        <div className="flex min-h-screen bg-background text-foreground">
            <DesktopSidebar />
            <main className="flex-1 overflow-y-auto h-screen">
                <div className="w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
