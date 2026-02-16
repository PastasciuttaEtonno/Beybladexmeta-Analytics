
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

// Helper to sanitize filenames for MinIO lookup
function sanitizeName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

export async function generateComboImage(combo: any): Promise<Buffer> {
    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background - Dark Gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f172a'); // Slate 900
    gradient.addColorStop(1, '#1e293b'); // Slate 800
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add subtle pattern or accent
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
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

    // Load Component Images
    // We need to fetch from the public MinIO URL.
    // NOTE: In a real production env with strict network policies, fetching from localhost might be safer,
    // but here we use the configured public URL.
    const baseUrl = process.env.VITE_PUBLIC_MINIO_URL || 'https://analytics.beybladexmeta.com/api/files';

    const loadComponentImage = async (folder: string, name: string) => {
        if (!name || name.toLowerCase() === 'none') return null;
        const filename = sanitizeName(name);
        // Try webp then png
        try {
            return await loadImage(`${baseUrl}/beyblades/${folder}/${filename}.png`);
        } catch {
            try {
                return await loadImage(`${baseUrl}/beyblades/${folder}/${filename}.webp`);
            } catch (e) {
                console.error(`Failed to load image for ${name} in ${folder}:`, e);
                return null; // Return null on failure, we'll confirm we can draw without it
            }
        }
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

        if (bladeImg) {
            const size = 300;
            ctx.drawImage(bladeImg, centerX - size / 2, centerY - size / 2 - 50, size, size);
        } else {
            // Fallback for missing blade
            ctx.fillStyle = '#334155';
            ctx.beginPath();
            ctx.arc(centerX, centerY - 50, 150, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#94a3b8';
            ctx.font = '30px Arial';
            ctx.fillText(combo.blade || 'Blade', centerX, centerY - 40);
        }

        if (ratchetImg) {
            const size = 180;
            ctx.drawImage(ratchetImg, centerX - 350, centerY, size, size);
        }

        if (bitImg) {
            const size = 180;
            ctx.drawImage(bitImg, centerX + 170, centerY, size, size);
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
