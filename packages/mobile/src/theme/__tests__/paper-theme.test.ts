// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// colors.ts touches Platform/PlatformColor at import; Android skips the iOS branch.
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, PlatformColor: (name: string) => name }));
// react-native-paper imports react-native at load; stub the MD3 base themes.
vi.mock('react-native-paper', () => ({
  MD3LightTheme: { dark: false, colors: { primary: 'base', elevation: {} } },
  MD3DarkTheme: { dark: true, colors: { primary: 'base', elevation: {} } },
}));

import { buildPaperTheme } from '../paper-theme';

describe('buildPaperTheme', () => {
  it('maps the brand + material surfaces onto MD3 roles (light)', () => {
    const theme = buildPaperTheme('light');
    expect(theme.colors.primary).toBe('#6D28D9');
    expect(theme.colors.onPrimary).toBe('#FFFFFF');
    expect(theme.colors.background).toBe('#F3EFFA'); // materialSurfaces.light.background
    expect(theme.colors.surface).toBe('#FFFFFF'); // secondaryBackground
    expect(theme.colors.error).toBe('#C81E1E');
    expect(theme.colors.elevation.level2).toBe('#FFFFFF'); // elevatedSurface (light)
  });

  it('uses the dark tonal surfaces for the dark scheme', () => {
    const theme = buildPaperTheme('dark');
    expect(theme.colors.background).toBe('#15101E');
    expect(theme.colors.surface).toBe('#221A33');
  });

  it('passes a provided dynamic palette straight through (Material You hook)', () => {
    const dynamic = { primary: '#123456' } as unknown as Parameters<typeof buildPaperTheme>[1];
    const theme = buildPaperTheme('light', dynamic);
    expect(theme.colors.primary).toBe('#123456');
  });
});
