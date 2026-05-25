import { describe, it, expect } from 'vitest';
import { buildClimbViewPath } from '../url-utils';

describe('buildClimbViewPath', () => {
  it('builds a correct climb view path', () => {
    expect(buildClimbViewPath('kilter', 1, 10, '12,34', 40, 'abc-123')).toBe('/kilter/1/10/12,34/40/view/abc-123');
  });

  it('handles different board names', () => {
    expect(buildClimbViewPath('tension', 2, 20, '56', 25, 'xyz-789')).toBe('/tension/2/20/56/25/view/xyz-789');
  });
});
