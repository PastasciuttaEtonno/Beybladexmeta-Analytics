
import { useState, useMemo, useEffect } from "react";

const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

export function DesktopComponentImage({ folder, name, className }: { folder: string; name: string; className?: string }) {
    if (!name || name.toLowerCase() === "none" || name === "-") return null;

    const [attemptIndex, setAttemptIndex] = useState(0);

    const getImageVariations = (name: string, format: "png" | "webp") => {
        const variations = [
            name.toLowerCase().replace(/\s+/g, ""),
            name.toLowerCase().replace(/\s+/g, "-"),
            name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/\s+/g, "-"),
        ];
        return variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.${format}`);
    };

    const allAttempts = useMemo(() => [
        ...getImageVariations(name, "webp"),
        ...getImageVariations(name, "png"),
    ], [name, folder]);

    const [currentSrc, setCurrentSrc] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const handleImageError = () => {
        if (attemptIndex < allAttempts.length - 1) {
            setAttemptIndex((prev) => prev + 1);
            setCurrentSrc(null);
            setIsLoaded(false);
        }
    };

    useEffect(() => {
        if (!currentSrc && attemptIndex < allAttempts.length) {
            setCurrentSrc(allAttempts[attemptIndex]);
            setIsLoaded(false);
        }
    }, [attemptIndex, allAttempts, currentSrc]);

    return (
        <div className={`aspect-square relative flex items-center justify-center ${className}`}>
            {!currentSrc ? (
                <div className="text-[10px] text-muted-foreground text-center w-full">N/A</div>
            ) : (
                <img
                    src={currentSrc}
                    alt={name}
                    className={`w-full h-full object-contain filter drop-shadow-md transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onError={handleImageError}
                    onLoad={() => setIsLoaded(true)}
                />
            )}
        </div>
    );
}
