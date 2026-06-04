import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextColor, readableDarkText, readableLightText } from '../grade-chip-colors';

describe('grade chip color helpers', () => {
  it('uses dark text on light grade colors', () => {
    expect(readableTextColor('#FFEB3B')).toBe(readableDarkText);
    expect(readableTextColor('#F44336')).toBe(readableDarkText);
  });

  it('uses light text on dark grade colors', () => {
    expect(readableTextColor('#A11B4A')).toBe(readableLightText);
    expect(readableTextColor('#2A0054')).toBe(readableLightText);
  });

  it('chooses a color with at least AA contrast for known grade colors', () => {
    for (const gradeColor of ['#FFEB3B', '#F44336', '#E53935', '#A11B4A', '#2A0054']) {
      const selectedTextColor = readableTextColor(gradeColor);
      expect(contrastRatio(gradeColor, selectedTextColor)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
