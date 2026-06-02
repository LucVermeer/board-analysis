import { describe, it, expect, vi } from 'vitest';

// Mock react-native so StyleSheet.create is a pass-through identity function.
// Platform/PlatformColor/useColorScheme are needed because Text now pulls in
// the theme provider (→ colors.ts) for its adaptive default colour.
vi.mock('react-native', () => ({
  Text: 'Text',
  Platform: { OS: 'ios', select: (specifics: Record<string, unknown>) => specifics.ios },
  PlatformColor: (name: string) => ({ semantic: name }),
  useColorScheme: () => 'light',
  StyleSheet: {
    create: <T extends Record<string, Record<string, unknown>>>(styles: T): T => styles,
  },
}));

// Import after mock so StyleSheet.create returns raw objects
import { variantStyles, type TextVariant } from '../Text';

// ── Helpers ─────────────────────────────────────────────────────────────

const allVariantNames: TextVariant[] = [
  'largeTitle',
  'title1',
  'title2',
  'title3',
  'headline',
  'body',
  'callout',
  'subheadline',
  'footnote',
  'caption1',
  'caption2',
];

// ── Tests ───────────────────────────────────────────────────────────────

describe('variantStyles', () => {
  it('defines all 11 Apple HIG text variants', () => {
    const definedVariants = Object.keys(variantStyles);
    expect(definedVariants).toHaveLength(11);
    for (const variant of allVariantNames) {
      expect(variantStyles[variant]).toBeDefined();
    }
  });

  it.each(allVariantNames)('variant "%s" has fontSize, fontWeight, and lineHeight', (variant) => {
    const style = variantStyles[variant];
    expect(typeof style.fontSize).toBe('number');
    expect(typeof style.fontWeight).toBe('string');
    expect(typeof style.lineHeight).toBe('number');
  });

  it.each(allVariantNames)('variant "%s" has lineHeight greater than fontSize', (variant) => {
    const style = variantStyles[variant];
    expect(style.lineHeight).toBeGreaterThan(style.fontSize as number);
  });

  it('font sizes follow Apple HIG scale', () => {
    expect(variantStyles.largeTitle.fontSize).toBe(34);
    expect(variantStyles.title1.fontSize).toBe(28);
    expect(variantStyles.title2.fontSize).toBe(22);
    expect(variantStyles.title3.fontSize).toBe(20);
    expect(variantStyles.headline.fontSize).toBe(17);
    expect(variantStyles.body.fontSize).toBe(17);
    expect(variantStyles.callout.fontSize).toBe(16);
    expect(variantStyles.subheadline.fontSize).toBe(15);
    expect(variantStyles.footnote.fontSize).toBe(13);
    expect(variantStyles.caption1.fontSize).toBe(12);
    expect(variantStyles.caption2.fontSize).toBe(11);
  });

  it('font sizes decrease monotonically from largeTitle through caption2 (headline=body tie allowed)', () => {
    const sizes = allVariantNames.map((variant) => variantStyles[variant].fontSize as number);
    for (let index = 1; index < sizes.length; index++) {
      expect(sizes[index]).toBeLessThanOrEqual(sizes[index - 1]);
    }
  });
});
