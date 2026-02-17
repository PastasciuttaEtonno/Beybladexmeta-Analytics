import React from 'react';

export function AdsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center min-h-screen w-full">
            <div className="flex-1 w-full max-w-2xl relative">
                {children}
            </div>
        </div>
    );
}
