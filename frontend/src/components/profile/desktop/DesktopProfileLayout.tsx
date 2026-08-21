import { ReactNode } from "react";

interface DesktopProfileLayoutProps {
    sidebar: ReactNode;
    settingsPanel: ReactNode;
}

export function DesktopProfileLayout({ sidebar, settingsPanel }: DesktopProfileLayoutProps) {
    return (
        <div className="hidden md:flex flex-col min-[1175px]:grid min-[1175px]:grid-cols-[320px_1fr] h-screen w-full overflow-hidden">
            <div className="h-auto min-[1175px]:h-full overflow-y-auto border-b min-[1175px]:border-b-0 min-[1175px]:border-r border-border bg-card/30 backdrop-blur-sm">
                {sidebar}
            </div>
            <div className="flex-1 h-full overflow-y-auto bg-muted/5">
                {settingsPanel}
            </div>
        </div>
    );
}
