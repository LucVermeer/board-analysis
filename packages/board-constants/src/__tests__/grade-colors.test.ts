import { describe, it, expect } from 'vite-plus/test';
import {
  V_GRADE_COLORS,
  FONT_GRADE_COLORS,
  DEFAULT_GRADE_COLOR,
  getVGradeColor,
  getFontGradeColor,
  getGradeColor,
} from '../grade-colors';

describe('V_GRADE_COLORS', () => {
  it('covers V0 through V17', () => {
    for (let i = 0; i <= 17; i++) {
      expect(V_GRADE_COLORS[`V${i}`]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('FONT_GRADE_COLORS', () => {
  it('covers standard font grades', () => {
    const expected = [
      '4a',
      '4b',
      '4c',
      '5a',
      '5b',
      '5c',
      '6a',
      '6a+',
      '6b',
      '6b+',
      '6c',
      '6c+',
      '7a',
      '7a+',
      '7b',
      '7b+',
      '7c',
      '7c+',
      '8a',
      '8a+',
      '8b',
      '8b+',
      '8c',
      '8c+',
    ];
    for (const grade of expected) {
      expect(FONT_GRADE_COLORS[grade], `Missing font grade ${grade}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('getVGradeColor', () => {
  it('returns correct color for known grades', () => {
    expect(getVGradeColor('V0')).toBe('#FFD400');
    expect(getVGradeColor('V5')).toBe('#F03E3E');
    expect(getVGradeColor('V17')).toBe('#2A0054');
  });

  it('is case-insensitive', () => {
    expect(getVGradeColor('v3')).toBe('#FF6D2E');
  });

  it('strips trailing + from V-grade', () => {
    expect(getVGradeColor('V5+')).toBe('#F03E3E');
  });

  it('returns undefined for null/undefined/unknown', () => {
    expect(getVGradeColor(null)).toBeUndefined();
    expect(getVGradeColor(undefined)).toBeUndefined();
    expect(getVGradeColor('V99')).toBeUndefined();
  });
});

describe('getFontGradeColor', () => {
  it('returns correct color for known grades', () => {
    expect(getFontGradeColor('6a')).toBe('#FF6D2E');
    expect(getFontGradeColor('7b+')).toBe('#B81A5A');
  });

  it('is case-insensitive', () => {
    expect(getFontGradeColor('6A')).toBe('#FF6D2E');
  });

  it('returns undefined for null/undefined/unknown', () => {
    expect(getFontGradeColor(null)).toBeUndefined();
    expect(getFontGradeColor('9a')).toBeUndefined();
  });
});

describe('getGradeColor', () => {
  it('extracts V-grade from combined string', () => {
    expect(getGradeColor('6a/V3')).toBe('#FF6D2E');
  });

  it('falls back to font grade when no V-grade', () => {
    expect(getGradeColor('7a')).toBe('#E22A2A');
  });

  it('returns undefined for null/undefined/unrecognized', () => {
    expect(getGradeColor(null)).toBeUndefined();
    expect(getGradeColor('unknown')).toBeUndefined();
  });
});

describe('DEFAULT_GRADE_COLOR', () => {
  it('is gray', () => {
    expect(DEFAULT_GRADE_COLOR).toBe('#808080');
  });
});
