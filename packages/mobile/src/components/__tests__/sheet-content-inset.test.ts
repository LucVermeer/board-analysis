import { describe, it, expect, vi } from 'vitest';

// The mobile vitest setup has no global react-native transform (the real package
// is Flow-typed), so unit tests mock it per-file. A faithful StyleSheet.flatten
// (arrays merge left-to-right; falsy entries skipped) is all this helper needs.
type Style = Record<string, unknown> | undefined | false | null | Style[];
function flatten(style: Style): Record<string, unknown> | undefined {
  if (style == null || style === false) return undefined;
  if (Array.isArray(style)) {
    const out: Record<string, unknown> = {};
    for (const entry of style) {
      const flat = flatten(entry);
      if (flat) Object.assign(out, flat);
    }
    return out;
  }
  return style;
}
vi.mock('react-native', () => ({ StyleSheet: { flatten } }));

import { withSheetBottomInset } from '../sheet-content-inset';

function effectiveBottom(style: ReturnType<typeof withSheetBottomInset>): number | undefined {
  return flatten(style as Style)?.paddingBottom as number | undefined;
}

describe('withSheetBottomInset', () => {
  it('adds the inset to a consumer paddingBottom rather than replacing it', () => {
    expect(effectiveBottom(withSheetBottomInset({ paddingBottom: 24 }, 48))).toBe(72);
  });

  it('uses the inset alone when the consumer sets no bottom padding', () => {
    const result = withSheetBottomInset({ paddingHorizontal: 16 }, 48);
    expect(effectiveBottom(result)).toBe(48);
    // Other consumer padding is preserved.
    expect(flatten(result as Style)?.paddingHorizontal).toBe(16);
  });

  it('applies the inset when the consumer passes no style at all', () => {
    expect(effectiveBottom(withSheetBottomInset(undefined, 34))).toBe(34);
  });

  it('falls back to paddingVertical, then the padding shorthand, for the existing bottom', () => {
    expect(effectiveBottom(withSheetBottomInset({ paddingVertical: 10 }, 48))).toBe(58);
    expect(effectiveBottom(withSheetBottomInset({ padding: 8 }, 48))).toBe(56);
  });

  it('returns the original style untouched when there is no bottom inset', () => {
    const original = { paddingBottom: 12 };
    expect(withSheetBottomInset(original, 0)).toBe(original);
  });
});
