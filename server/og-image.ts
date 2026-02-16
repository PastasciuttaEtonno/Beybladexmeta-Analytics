import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs/promises';


// Helper to sanitize filenames for MinIO lookup
function getVariations(name: string): string[] {
    return [
        name.toLowerCase().replace(/\s+/g, ""),
        name.toLowerCase().replace(/\s+/g, "-"),
        name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/\s+/g, "-")
    ];
}

export async function generateComboImage(combo: any): Promise<Buffer> {
    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background - Clean Dark Theme (User Request: "white or black with shadows")
    // We'll go with a rich dark theme to match the app's premium feel.
    ctx.fillStyle = '#111111'; // Almost black
    ctx.fillRect(0, 0, width, height);

    // Subtle radial gradient for depth
    const radial = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
    radial.addColorStop(0, '#1a1a1a');
    radial.addColorStop(1, '#000000');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    // Grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let i = 0; i < width; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
    }
    for (let i = 0; i < height; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }

    // Text Styling
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';

    // Title
    ctx.font = 'bold 60px Arial';
    const title = [
        combo.lockChip?.toLowerCase() !== 'none' ? combo.lockChip : '',
        combo.blade,
        combo.assistBlade?.toLowerCase() !== 'none' ? combo.assistBlade : '',
        combo.ratchet?.toLowerCase() !== 'none' ? combo.ratchet : '',
        combo.bit
    ].filter(Boolean).join(' • ');

    ctx.fillText(title, width / 2, 100);

    // Rank Badge (mock visual)
    if (typeof combo.rank === 'number') {
        ctx.fillStyle = '#f59e0b'; // Amber 500
        ctx.font = 'bold 40px Arial';
        ctx.fillText(`Rank #${combo.rank}`, width / 2, 160);
    }

    // Draw White Logo (Top Right)
    try {
        const logoPath = path.join(process.cwd(), 'client', 'public', 'meta logoWhite.png');
        const logoBuffer = await fs.readFile(logoPath);
        const logoImg = await loadImage(logoBuffer);

        // Target width 150px, maintain aspect ratio
        const logoWidth = 150;
        const scale = logoWidth / logoImg.width;
        const logoHeight = logoImg.height * scale;

        const logoX = width - logoWidth - 40; // 40px padding from right
        const logoY = 40; // 40px padding from top

        ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
        console.error("Failed to load logo for OG image:", e);
    }

    // Load Component Images
    // We need to fetch from the public MinIO URL.
    // NOTE: In a real production env with strict network policies, fetching from localhost might be safer,
    // but here we use the configured public URL.
    const baseUrl = (process.env.VITE_PUBLIC_MINIO_URL || 'https://minio.vasquezlisciotto.dev/').replace(/\/$/, "");

    const loadComponentImage = async (folder: string, name: string) => {
        if (!name || name.toLowerCase() === 'none') return null;

        const variations = getVariations(name);

        // Priority 1: Try all WebP variations
        for (const filename of variations) {
            try {
                return await loadImage(`${baseUrl}/beyblades/${folder}/${filename}.webp`);
            } catch (e) {
                // Continue
            }
        }

        // Priority 2: Try all PNG variations
        for (const filename of variations) {
            try {
                return await loadImage(`${baseUrl}/beyblades/${folder}/${filename}.png`);
            } catch (e) {
                // Continue
            }
        }

        console.warn(`Failed to load image for ${name} in ${folder} (tried variations: ${variations.join(', ')})`);
        return null;
    };

    try {
        const [bladeImg, ratchetImg, bitImg] = await Promise.all([
            loadComponentImage('blades', combo.blade),
            loadComponentImage('ratchets', combo.ratchet),
            loadComponentImage('bits', combo.bit)
        ]);

        // Layout: Blade Center, others smaller below
        const centerX = width / 2;
        const centerY = height / 2 + 50;

        // Drop Shadow for components
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 20;

        // Helper to draw image maintaining aspect ratio
        const drawImageContain = (img: any, x: number, y: number, maxSize: number) => {
            const scale = Math.min(maxSize / img.width, maxSize / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
        };

        if (bladeImg) {
            drawImageContain(bladeImg, centerX, centerY - 50, 320); // Slightly larger
        } else {
            // Fallback for missing blade
            ctx.fillStyle = '#222';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY - 50, 150, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#666';
            ctx.font = '30px Arial';
            ctx.fillText(combo.blade || 'Blade', centerX, centerY - 40);
        }

        if (ratchetImg) {
            drawImageContain(ratchetImg, centerX - 350, centerY, 220); // Larger side images
        }

        if (bitImg) {
            drawImageContain(bitImg, centerX + 350, centerY, 220); // Larger side images, adjusted position
        }

    } catch (err) {
        console.error("Error loading component images for OG generation", err);
        // Continue drawing text-only if images fail
    }

    // Footer / Branding
    ctx.fillStyle = '#94a3b8'; // Slate 400
    ctx.font = '30px Arial';
    ctx.fillText('Beyblade X Meta Analytics', width / 2, height - 40);

    return canvas.toBuffer('image/png');
}
