import { describe, expect, it } from 'vitest';
import { resolveUiVariant } from '../resolve-ui-variant';

describe('resolveUiVariant', () => {
  it("follows capability on 'auto': glass when capable, Material otherwise", () => {
    expect(resolveUiVariant('auto', true)).toBe('liquidGlass');
    expect(resolveUiVariant('auto', false)).toBe('material');
  });

  it('honours an explicit Liquid Glass choice even when capable', () => {
    expect(resolveUiVariant('liquidGlass', true)).toBe('liquidGlass');
  });

  it('honours an explicit Liquid Glass choice even on incapable hardware', () => {
    // Forced glass on a non-capable device still resolves to the glass *variant*;
    // GlassSurface degrades the actual rendering to solid.
    expect(resolveUiVariant('liquidGlass', false)).toBe('liquidGlass');
  });

  it('honours an explicit Material choice even on iOS 26 hardware', () => {
    expect(resolveUiVariant('material', true)).toBe('material');
    expect(resolveUiVariant('material', false)).toBe('material');
  });
});
