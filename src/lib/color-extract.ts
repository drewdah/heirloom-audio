import sharp from "sharp";

/**
 * Extract the dominant "spine" color from a cover image buffer.
 * Returns an object with { spine, bg, text } hex strings ready to use.
 *
 * Strategy:
 * 1. Resize to 64×96 (tiny) for speed
 * 2. Sample all pixels, quantize into coarse buckets
 * 3. Pick the most frequent bucket that is saturated enough to be interesting
 * 4. Derive a darker bg and a light text color from it
 */
export async function extractSpineColor(
  buffer: Buffer
): Promise<{ spine: string; bg: string; text: string } | null> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(64, 96, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Build a histogram of coarse color buckets (8 levels per channel → 512 buckets)
    const LEVELS = 8;
    const buckets: Record<string, number> = {};

    for (let i = 0; i < data.length; i += 3) {
      const r = Math.floor((data[i] / 255) * (LEVELS - 1));
      const g = Math.floor((data[i + 1] / 255) * (LEVELS - 1));
      const b = Math.floor((data[i + 2] / 255) * (LEVELS - 1));
      const key = `${r},${g},${b}`;
      buckets[key] = (buckets[key] ?? 0) + 1;
    }

    // Sort by frequency, skip near-black/white/gray buckets
    const sorted = Object.entries(buckets)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key.split(",").map(Number))
      .filter(([r, g, b]) => {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const brightness = max / (LEVELS - 1);
        // Skip very dark, very bright, or very desaturated
        return saturation > 0.25 && brightness > 0.15 && brightness < 0.92;
      });

    if (sorted.length === 0) return null;

    // Convert the top bucket back to full 0-255 range
    const [br, bg, bb] = sorted[0].map((v) => Math.round((v / (LEVELS - 1)) * 255));

    // Spine: the dominant color, moderately darkened
    const spineHex = rgbToHex(
      Math.round(br * 0.75),
      Math.round(bg * 0.75),
      Math.round(bb * 0.75)
    );

    // BG: very dark version (for the card back / no-cover state)
    const bgHex = rgbToHex(
      Math.round(br * 0.2),
      Math.round(bg * 0.2),
      Math.round(bb * 0.2)
    );

    // Text: light version of same hue for contrast
    const textHex = rgbToHex(
      Math.min(255, Math.round(br * 0.5 + 160)),
      Math.min(255, Math.round(bg * 0.5 + 140)),
      Math.min(255, Math.round(bb * 0.5 + 140))
    );

    return { spine: spineHex, bg: bgHex, text: textHex };
  } catch (e) {
    console.warn("[color-extract] Failed:", e);
    return null;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
