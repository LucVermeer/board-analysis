import { describe, expect, it } from 'vitest';
import { contrastRatio, readableDarkText, readableLightText } from '@boardsesh/board-constants';
import {
  KIOSK_DARK_SURFACE,
  KIOSK_DEFAULT_ACCENT,
  KIOSK_MIN_ACCENT_CONTRAST,
  ensureReadableOnSurface,
  resolveKioskBrand,
} from '../brand-contrast';

describe('ensureReadableOnSurface', () => {
  it('returns an already-readable colour unchanged (normalised to #rrggbb)', () => {
    expect(ensureReadableOnSurface('#F4F1EA', KIOSK_DARK_SURFACE, KIOSK_MIN_ACCENT_CONTRAST)).toBe('#f4f1ea');
  });

  it('expands 3-digit hex', () => {
    expect(ensureReadableOnSurface('#fff', KIOSK_DARK_SURFACE, KIOSK_MIN_ACCENT_CONTRAST)).toBe('#ffffff');
  });

  it('lightens a too-dark accent until it clears the contrast floor', () => {
    // A deep navy is unreadable on the dark kiosk surface as-is.
    const original = '#1a1a5e';
    expect(contrastRatio(original, KIOSK_DARK_SURFACE)!).toBeLessThan(KIOSK_MIN_ACCENT_CONTRAST);

    const clamped = ensureReadableOnSurface(original, KIOSK_DARK_SURFACE, KIOSK_MIN_ACCENT_CONTRAST);
    expect(clamped).not.toBeNull();
    expect(contrastRatio(clamped!, KIOSK_DARK_SURFACE)!).toBeGreaterThanOrEqual(KIOSK_MIN_ACCENT_CONTRAST);
  });

  it('even pure black resolves to something readable', () => {
    const clamped = ensureReadableOnSurface('#000000', KIOSK_DARK_SURFACE, KIOSK_MIN_ACCENT_CONTRAST);
    expect(clamped).not.toBeNull();
    expect(contrastRatio(clamped!, KIOSK_DARK_SURFACE)!).toBeGreaterThanOrEqual(KIOSK_MIN_ACCENT_CONTRAST);
  });

  it('returns null for garbage input', () => {
    expect(ensureReadableOnSurface('tomato', KIOSK_DARK_SURFACE, KIOSK_MIN_ACCENT_CONTRAST)).toBeNull();
    expect(ensureReadableOnSurface('#12345', KIOSK_DARK_SURFACE, KIOSK_MIN_ACCENT_CONTRAST)).toBeNull();
    expect(ensureReadableOnSurface('', KIOSK_DARK_SURFACE, KIOSK_MIN_ACCENT_CONTRAST)).toBeNull();
  });
});

describe('resolveKioskBrand', () => {
  it('prefers the accent colour over the primary colour', () => {
    const brand = resolveKioskBrand({ brandAccentColor: '#f4f1ea', brandPrimaryColor: '#ffffff' });
    expect(brand.accent).toBe('#f4f1ea');
  });

  it('falls back to the primary colour when no accent is set', () => {
    const brand = resolveKioskBrand({ brandAccentColor: null, brandPrimaryColor: '#ffffff' });
    expect(brand.accent).toBe('#ffffff');
  });

  it('falls back to the default accent when no branding is set', () => {
    const brand = resolveKioskBrand({});
    expect(brand.accent).toBe(KIOSK_DEFAULT_ACCENT.toLowerCase());
  });

  it('skips an invalid accent and uses the next candidate', () => {
    const brand = resolveKioskBrand({ brandAccentColor: 'not-a-colour', brandPrimaryColor: '#ffffff' });
    expect(brand.accent).toBe('#ffffff');
  });

  it('clamps every resolved accent to the contrast floor', () => {
    const brand = resolveKioskBrand({ brandAccentColor: '#111111' });
    expect(contrastRatio(brand.accent, KIOSK_DARK_SURFACE)!).toBeGreaterThanOrEqual(KIOSK_MIN_ACCENT_CONTRAST);
  });

  it('derives a readable on-accent text colour', () => {
    const lightAccent = resolveKioskBrand({ brandAccentColor: '#f4f1ea' });
    expect(lightAccent.onAccent).toBe(readableDarkText);

    const midAccent = resolveKioskBrand({ brandAccentColor: '#b8524c' });
    expect([readableDarkText, readableLightText]).toContain(midAccent.onAccent);
    expect(contrastRatio(midAccent.onAccent, midAccent.accent)!).toBeGreaterThan(1);
  });
});
