import { describe, expect, it } from 'vitest';
import { resolveLogoDisplayUrl, resolveLogoEncodingPlan, resolveLogoPersistUrl, scaleToFit } from '../logo-image-utils';

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

describe('resolveLogoPersistUrl', () => {
  const uploadedPath = '/static/gym-logos/abc.png?v=123';

  it('absolutises against an https backend (split-domain production)', () => {
    expect(resolveLogoPersistUrl(uploadedPath, 'https://ws.boardsesh.com')).toBe(
      `https://ws.boardsesh.com${uploadedPath}`,
    );
  });

  it('keeps the relative path for a plain-http dev backend (schema rejects http URLs)', () => {
    expect(resolveLogoPersistUrl(uploadedPath, 'http://localhost:8080')).toBe(uploadedPath);
    expect(resolveLogoPersistUrl(uploadedPath, null)).toBe(uploadedPath);
  });

  it('leaves an already-absolute URL alone', () => {
    expect(resolveLogoPersistUrl('https://cdn.example.com/logo.png', 'https://ws.boardsesh.com')).toBe(
      'https://cdn.example.com/logo.png',
    );
  });

  it('tolerates a trailing slash on the backend base', () => {
    expect(resolveLogoPersistUrl(uploadedPath, 'https://ws.boardsesh.com/')).toBe(
      `https://ws.boardsesh.com${uploadedPath}`,
    );
  });
});

describe('resolveLogoDisplayUrl', () => {
  it('resolves relative paths against the backend regardless of scheme', () => {
    expect(resolveLogoDisplayUrl('/static/gym-logos/abc.png', 'http://localhost:8080')).toBe(
      'http://localhost:8080/static/gym-logos/abc.png',
    );
  });

  it('passes through null and absolute URLs', () => {
    expect(resolveLogoDisplayUrl(null, 'http://localhost:8080')).toBeNull();
    expect(resolveLogoDisplayUrl('https://ws.boardsesh.com/static/gym-logos/abc.png', 'http://localhost:8080')).toBe(
      'https://ws.boardsesh.com/static/gym-logos/abc.png',
    );
  });

  it('keeps the relative path when no backend base is known', () => {
    expect(resolveLogoDisplayUrl('/static/gym-logos/abc.png', null)).toBe('/static/gym-logos/abc.png');
  });
});
