import { describe, expect, it } from 'vitest';
import type { BoardName } from '@boardsesh/shared-schema';
import { brushRoleColor, getPaintRoles } from '../brush-roles';

describe('getPaintRoles', () => {
  it('excludes FOOT for MoonBoard saved-climb roles', () => {
    expect(getPaintRoles('moonboard')).toEqual(['STARTING', 'HAND', 'FINISH']);
  });

  // Callers read this during render, so an unknown board must degrade rather than
  // throw where nothing can catch it (#3804).
  it('returns no paint roles for a board missing from the role table', () => {
    expect(() => getPaintRoles('not-a-board' as BoardName)).not.toThrow();
    expect(getPaintRoles('not-a-board' as BoardName)).toEqual([]);
  });

  it('returns all four paint roles for Kilter', () => {
    expect(getPaintRoles('kilter')).toEqual(['STARTING', 'HAND', 'FINISH', 'FOOT']);
  });

  it('uses configured role colour overrides when painting a role', () => {
    expect(brushRoleColor('kilter', 'HAND', { HAND: '#123456' })).toBe('#123456');
  });
});
