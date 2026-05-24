import { describe, it, expect } from 'vitest';
import {
  getGradeColorWithOpacity,
  isLightColor,
  getGradeTextColor,
  getGradeTintColor,
  hexToHSL,
} from '../grade-display';

describe('getGradeColorWithOpacity', () => {
  it('returns an rgba string for a valid hex color', () => {
    expect(getGradeColorWithOpacity('#FF5722', 0.5)).toBe('rgba(255, 87, 34, 0.5)');
  });

  it('uses default opacity of 0.7', () => {
    expect(getGradeColorWithOpacity('#FF5722')).toBe('rgba(255, 87, 34, 0.7)');
  });

  it('returns a fallback rgba for undefined color', () => {
    expect(getGradeColorWithOpacity(undefined)).toBe('rgba(200, 200, 200, 0.7)');
  });

  it('handles hex without # prefix', () => {
    expect(getGradeColorWithOpacity('FF5722', 0.5)).toBe('rgba(255, 87, 34, 0.5)');
  });
});

describe('isLightColor', () => {
  it('returns true for white', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
  });

  it('returns false for black', () => {
    expect(isLightColor('#000000')).toBe(false);
  });

  it('returns true for a light yellow', () => {
    expect(isLightColor('#FFEB3B')).toBe(true);
  });

  it('returns false for a dark red', () => {
    expect(isLightColor('#B71C1C')).toBe(false);
  });
});

describe('getGradeTextColor', () => {
  it('returns white for a dark background', () => {
    expect(getGradeTextColor('#000000')).toBe('#FFFFFF');
  });

  it('returns black for a light background', () => {
    expect(getGradeTextColor('#FFFFFF')).toBe('#000000');
  });

  it('returns inherit for undefined input', () => {
    expect(getGradeTextColor(undefined)).toBe('inherit');
  });
});

describe('getGradeTintColor', () => {
  it('returns an hsl string for a valid difficulty', () => {
    const result = getGradeTintColor('6a/V3');
    expect(result).toBeDefined();
    expect(result).toMatch(/^hsl/);
  });

  it('returns undefined for null difficulty', () => {
    expect(getGradeTintColor(null)).toBeUndefined();
  });

  it('returns undefined for undefined difficulty', () => {
    expect(getGradeTintColor(undefined)).toBeUndefined();
  });

  it('returns a light variant when requested', () => {
    const result = getGradeTintColor('6a/V3', 'light');
    expect(result).toBeDefined();
    expect(result).toMatch(/^hsl\(/);
    expect(result).toContain('94%');
  });

  it('returns a session variant when requested', () => {
    const result = getGradeTintColor('6a/V3', 'session');
    expect(result).toBeDefined();
    expect(result).toMatch(/^hsl\(/);
    expect(result).toContain('82%');
  });

  it('returns dark mode variant with lower lightness', () => {
    const defaultResult = getGradeTintColor('6a/V3', 'default', true);
    expect(defaultResult).toBeDefined();
    expect(defaultResult).toMatch(/^hsla\(/);
  });

  it('returns dark mode light variant', () => {
    const result = getGradeTintColor('6a/V3', 'light', true);
    expect(result).toBeDefined();
    expect(result).toMatch(/^hsl\(/);
    expect(result).toContain('22%');
  });
});

describe('hexToHSL', () => {
  it('converts pure red correctly', () => {
    const result = hexToHSL('#FF0000');
    expect(result.h).toBe(0);
    expect(result.s).toBeCloseTo(1, 5);
    expect(result.l).toBeCloseTo(0.5, 5);
  });

  it('converts pure green correctly', () => {
    const result = hexToHSL('#00FF00');
    expect(result.h).toBe(120);
    expect(result.s).toBeCloseTo(1, 5);
    expect(result.l).toBeCloseTo(0.5, 5);
  });

  it('converts gray correctly', () => {
    const result = hexToHSL('#808080');
    expect(result.h).toBe(0);
    expect(result.s).toBe(0);
    expect(result.l).toBeCloseTo(0.502, 2);
  });

  it('converts pure blue correctly', () => {
    const result = hexToHSL('#0000FF');
    expect(result.h).toBe(240);
    expect(result.s).toBeCloseTo(1, 5);
    expect(result.l).toBeCloseTo(0.5, 5);
  });

  it('converts white correctly', () => {
    const result = hexToHSL('#FFFFFF');
    expect(result.h).toBe(0);
    expect(result.s).toBe(0);
    expect(result.l).toBeCloseTo(1, 5);
  });
});
