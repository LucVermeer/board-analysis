import { describe, expect, it } from 'vitest';
import { resolveLogoEncodingPlan, scaleToFit } from '../logo-image-utils';

describe('resolveLogoEncodingPlan', () => {
  it('keeps JPEG as JPEG (white-filled — no alpha channel to lose)', () => {
    expect(resolveLogoEncodingPlan('image/jpeg')).toEqual({
      kind: 'canvas',
      outputMimeType: 'image/jpeg',
      outputFileName: 'logo.jpg',
      quality: 0.85,
      fillWhite: true,
    });
  });

  it('re-encodes png and webp as PNG with transparency preserved (no white fill)', () => {
    for (const mimeType of ['image/png', 'image/webp']) {
      expect(resolveLogoEncodingPlan(mimeType)).toEqual({
        kind: 'canvas',
        outputMimeType: 'image/png',
        outputFileName: 'logo.png',
        fillWhite: false,
      });
    }
  });

  it('passes GIFs through untouched (canvas would flatten animation)', () => {
    expect(resolveLogoEncodingPlan('image/gif')).toEqual({ kind: 'passthrough' });
  });

  it('rejects anything else, including SVG', () => {
    expect(resolveLogoEncodingPlan('image/svg+xml')).toBeNull();
    expect(resolveLogoEncodingPlan('application/pdf')).toBeNull();
  });
});

describe('scaleToFit', () => {
  it('never upscales', () => {
    expect(scaleToFit(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });

  it('scales the longest side down to the cap, keeping aspect', () => {
    expect(scaleToFit(1024, 512, 512)).toEqual({ width: 512, height: 256 });
    expect(scaleToFit(512, 2048, 512)).toEqual({ width: 128, height: 512 });
  });

  it('never collapses a side to zero', () => {
    expect(scaleToFit(10000, 1, 512)).toEqual({ width: 512, height: 1 });
  });
});
