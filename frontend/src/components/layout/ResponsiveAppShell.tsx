import { AdsLayout } from "./AdsLayout";
import { DesktopLayout } from "./DesktopLayout";

interface ResponsiveAppShellProps {
    children: React.ReactNode;
}

export function ResponsiveAppShell({ children }: ResponsiveAppShellProps) {
    return (
        <>
            {/* Mobile Layout (< 768px) */}
            <div className="md:hidden">
                <AdsLayout>{children}</AdsLayout>
            </div>

            {/* Desktop Layout (>= 768px) */}
            <div className="hidden md:block">
                <DesktopLayout>{children}</DesktopLayout>
            </div>
        </>
    );
}
