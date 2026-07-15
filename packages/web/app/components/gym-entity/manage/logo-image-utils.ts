// Pure decision logic for the gym logo uploader. The DOM/canvas work lives in
// gym-logo-uploader.tsx; everything a unit test can pin down without a browser
// (encoding choice, dimension math, URL resolution) lives here.

/** Client-side ceiling on the PICKED file — we downscale before uploading. */
export const GYM_LOGO_MAX_INPUT_BYTES = 10 * 1024 * 1024;

/** The backend's hard Busboy cap on the UPLOADED file (POST /api/gym-logos). */
export const GYM_LOGO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Longest side of the uploaded logo after the canvas downscale. */
export const GYM_LOGO_MAX_DIMENSION = 512;

/** Mirror of the backend's mime allowlist (no SVG — script-in-logo hazard). */
export const GYM_LOGO_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export type GymLogoEncodingPlan =
  | {
      kind: 'canvas';
      /**
       * PNG for png/webp inputs: `canvas.toBlob('image/png')` keeps the alpha
       * channel, so transparent brand marks stay transparent on the dark kiosk
       * surface. This is deliberately NOT the avatar flow, which flattens onto
       * white and re-encodes as JPEG — that would put a white box behind every
       * transparent logo.
       */
      outputMimeType: 'image/png' | 'image/jpeg';
      outputFileName: string;
      /** JPEG quality; undefined for PNG (lossless). */
      quality?: number;
      /** Fill the canvas white first — only for JPEG output (no alpha channel). */
      fillWhite: boolean;
    }
  | {
      /**
       * GIFs are uploaded untouched: redrawing through a canvas would flatten
       * an animated logo to its first frame. The backend's 2MB cap still
       * applies, checked client-side before the POST.
       */
      kind: 'passthrough';
    };

/** How to prepare a picked file for upload, or null when the type is unsupported. */
export function resolveLogoEncodingPlan(inputMimeType: string): GymLogoEncodingPlan | null {
  switch (inputMimeType) {
    case 'image/jpeg':
      return {
        kind: 'canvas',
        outputMimeType: 'image/jpeg',
        outputFileName: 'logo.jpg',
        quality: 0.85,
        fillWhite: true,
      };
    case 'image/png':
    case 'image/webp':
      return { kind: 'canvas', outputMimeType: 'image/png', outputFileName: 'logo.png', fillWhite: false };
    case 'image/gif':
      return { kind: 'passthrough' };
    default:
      return null;
  }
}

/** Scale (width, height) to fit within maxDimension, never upscaling. */
export function scaleToFit(width: number, height: number, maxDimension: number): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  if (width >= height) {
    return { width: maxDimension, height: Math.max(1, Math.round((height * maxDimension) / width)) };
  }
  return { width: Math.max(1, Math.round((width * maxDimension) / height)), height: maxDimension };
}
