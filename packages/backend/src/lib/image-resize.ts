import sharp from 'sharp';
import type { Readable } from 'stream';

/**
 * Bounded allowlist of resize widths (px). Keeping this small caps how
 * many cached S3 variants we ever mint and stops a caller from creating
 * unbounded keys. Values cover the on-device display sizes: avatars
 * (28–60pt logical at 2–3× DPR) and beta-video thumbnails (44–140pt at
 * 2× DPR). Requests for any other value serve the original, unresized.
 */
export const ALLOWED_IMAGE_SIZES = [44, 64, 80, 128, 140, 280] as const;
export type AllowedImageSize = (typeof ALLOWED_IMAGE_SIZES)[number];

/**
 * Parse a `?size=` query value against the allowlist. Returns null for
 * missing / non-numeric / out-of-allowlist values, in which case the
 * caller serves the original image (back-compat).
 */
export function parseSizeParam(raw: string | null | undefined): AllowedImageSize | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return (ALLOWED_IMAGE_SIZES as readonly number[]).includes(parsed) ? (parsed as AllowedImageSize) : null;
}

/**
 * S3 key for a resized variant of a base object, e.g.
 * `avatars/u1.jpg` → `avatars/u1.jpg@140.jpg`. Variants are always JPEG.
 */
export function resizedVariantKey(baseKey: string, size: AllowedImageSize): string {
  return `${baseKey}@${size}.jpg`;
}

/**
 * Resize an image buffer to fill a size×size square, re-encoding as JPEG.
 * Never upscales beyond the source (`withoutEnlargement`), so a small
 * source is returned at its own size rather than blown up.
 */
export async function resizeImageBuffer(input: Buffer, size: AllowedImageSize): Promise<Buffer> {
  return sharp(input).resize(size, size, { fit: 'cover', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

/** Collect a readable stream into a single Buffer. */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
  }
  return Buffer.concat(chunks);
}
