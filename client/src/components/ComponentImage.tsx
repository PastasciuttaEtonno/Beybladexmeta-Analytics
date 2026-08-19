import { useState } from 'react';
import { cn } from "@/lib/utils";

// Use the public MinIO URL like in Analytics.tsx
const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || '').replace(/\/$/, '');

if (!PUBLIC_MINIO_URL) {
    console.error('VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.');
}

export const getImageUrls = (component: string, folder: string): string[] => {
    // Try multiple filename variations for robustness
    const attempts = [
        component.toLowerCase().replace(/\s+/g, ''), // cobaltdragoon
        component.toLowerCase().replace(/\s+/g, '-'), // cobalt-dragoon
        component
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase()
            .replace(/\s+/g, '-') // CobaltDragoon -> cobalt-dragoon
    ];
    return [
        ...attempts.map((v) => `${PUBLIC_MINIO_URL}/${folder}/${v}.webp`),
        ...attempts.map((v) => `${PUBLIC_MINIO_URL}/${folder}/${v}.png`),
    ];
};

interface ComponentImageProps {
    name: string;
    type: string;
    fallbackIcon: React.ReactNode;
    testId: string;
    priority?: boolean;
    className?: string;
}

export function ComponentImage({
    name,
    type,
    fallbackIcon,
    testId,
    priority = false,
    className
}: ComponentImageProps) {
    const [attemptIndex, setAttemptIndex] = useState(0);
    const imageUrls = getImageUrls(name, type);

    const handleImageError = () => {
        if (attemptIndex < imageUrls.length - 1) {
            setAttemptIndex(attemptIndex + 1);
        }
    };

    return (
        <div className={cn("w-24 h-24 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden", className)}>
            {attemptIndex >= imageUrls.length ? (
                <div className="flex items-center justify-center">
                    {fallbackIcon}
                </div>
            ) : (
                <img
                    key={attemptIndex}
                    src={imageUrls[attemptIndex]}
                    alt={name}
                    className="w-full h-full object-contain"
                    onError={handleImageError}
                    data-testid={testId}
                    {...(priority ? { fetchPriority: "high", loading: "eager" } : {})}
                />
            )}
        </div>
    );
}
