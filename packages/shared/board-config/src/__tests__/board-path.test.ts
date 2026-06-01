import { describe, it, expect } from 'vitest';
import { buildBoardPath } from '../board-path';

describe('buildBoardPath', () => {
  it('builds a path with angle', () => {
    expect(buildBoardPath('kilter', 8, 17, '26,27', 40)).toBe('kilter/8/17/26,27/40');
  });

  it('builds a path without angle', () => {
    expect(buildBoardPath('kilter', 8, 17, '26,27')).toBe('kilter/8/17/26,27');
  });

  it('accepts string ids', () => {
    expect(buildBoardPath('tension', '1', '10', '1,2', '45')).toBe('tension/1/10/1,2/45');
  });

  it('treats angle 0 as present', () => {
    expect(buildBoardPath('kilter', 8, 17, '26,27', 0)).toBe('kilter/8/17/26,27/0');
  });

  it('omits empty-string angle instead of producing a trailing slash', () => {
    expect(buildBoardPath('kilter', 8, 17, '26,27', '')).toBe('kilter/8/17/26,27');
  });
});
