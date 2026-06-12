import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PlatformColor: (name: string) => name,
}));

import { gradeChartColor, layoutChartColor } from '../profile-chart-colors';

describe('profile chart colors', () => {
  it('uses opaque grade chart colors for light and dark schemes', () => {
    expect(gradeChartColor('V4', 'light')).toMatch(/^hsl\(/);
    expect(gradeChartColor('V4', 'dark')).toMatch(/^hsl\(/);
    expect(gradeChartColor('V4', 'light')).not.toContain('0.');
    expect(gradeChartColor('V4', 'dark')).not.toContain('0.');
  });

  it('uses scheme-aware categorical layout colors', () => {
    expect(layoutChartColor('kilter-1', 'light')).toBe('#007C92');
    expect(layoutChartColor('kilter-1', 'dark')).toBe('#22D3EE');
    expect(layoutChartColor('unknown-layout', 'light')).toMatch(/^#/);
    expect(layoutChartColor('unknown-layout', 'dark')).toMatch(/^#/);
    expect(layoutChartColor('unknown-layout', 'light')).not.toBe(layoutChartColor('unknown-layout', 'dark'));
  });
});
