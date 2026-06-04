import { describe, expect, it } from 'vitest';
import { getPaintRoles } from '../brush-roles';

describe('getPaintRoles', () => {
  it('excludes FOOT for MoonBoard saved-climb roles', () => {
    expect(getPaintRoles('moonboard')).toEqual(['STARTING', 'HAND', 'FINISH']);
  });

  it('returns all four paint roles for Kilter', () => {
    expect(getPaintRoles('kilter')).toEqual(['STARTING', 'HAND', 'FINISH', 'FOOT']);
  });
});
