import { useState } from "react";
import { cn } from "@/lib/utils";

// Use the public MinIO URL
const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

if (!PUBLIC_MINIO_URL) {
    console.error(
        "VITE_PUBLIC_MINIO_URL is not set. Please set this environment variable in Coolify.",
    );
}

interface BeybladeImageProps {
    folder: string;
    name: string;
    className?: string;
    "data-testid"?: string;
}

export function BeybladeImage({ folder, name, className, "data-testid": testId }: BeybladeImageProps) {
    const [attemptIndex, setAttemptIndex] = useState(0);

    if (!name || name === "None" || name === "-") return null;

    const getImageVariations = (name: string, format: "png" | "webp") => {
        const variations = [
            name.toLowerCase().replace(/\s+/g, ""),
            name.toLowerCase().replace(/\s+/g, "-"),
            name
                .replace(/([a-z])([A-Z])/g, "$1-$2")
                .toLowerCase()
                .replace(/\s+/g, "-"),
        ];
        // Build full URL to public MinIO bucket
        return variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.${format}`);
    };

    const allAttempts = [
        ...getImageVariations(name, "webp"),
        ...getImageVariations(name, "png"),
    ];

    const handleImageError = () => {
        if (attemptIndex < allAttempts.length - 1) {
            setAttemptIndex(attemptIndex + 1);
        }
    };

    return (
        <div className={cn("aspect-square flex items-center justify-center relative", className)}>
            {attemptIndex >= allAttempts.length ? (
                <div className="text-center p-2 w-full h-full flex items-center justify-center bg-muted/20 rounded-md">
                    <p className="text-[10px] text-muted-foreground w-full truncate px-1">Img N/A</p>
                </div>
            ) : (
                <img
                    key={attemptIndex}
                    src={allAttempts[attemptIndex]}
                    alt={name}
                    className="w-full h-full object-contain filter drop-shadow-md transition-all duration-300"
                    onError={handleImageError}
                    data-testid={testId || `img-${folder}-${name}`}
                    loading="lazy"
                />
            )}
        </div>
    );
}
