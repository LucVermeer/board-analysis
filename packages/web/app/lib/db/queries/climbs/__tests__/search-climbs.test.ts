import { describe, expect, it, vi } from 'vite-plus/test';
import type { SearchRequestPagination } from '@/app/lib/types';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/app/lib/db/db', () => ({
  getReadDb: vi.fn(),
}));

vi.mock('@boardsesh/db/queries', () => ({
  searchClimbs: vi.fn(),
}));

import { buildClimbSearchParamsJson } from '../search-climbs';

function makeSearchParams(overrides: Partial<SearchRequestPagination> = {}): SearchRequestPagination {
  return {
    page: 0,
    pageSize: 20,
    sortBy: 'ascents',
    sortOrder: 'desc',
    settername: [],
    holdsFilter: {},
    zoneBox: null,
    zoneMode: 'allHolds',
    ...overrides,
  } as SearchRequestPagination;
}

describe('buildClimbSearchParamsJson', () => {
  const zoneBox = { edgeLeft: -10, edgeRight: 10, edgeBottom: 20, edgeTop: 80 };

  it('includes zoneMode in the cache params when a zone is active', () => {
    const allHoldsParams = buildClimbSearchParamsJson(makeSearchParams({ zoneBox, zoneMode: 'allHolds' }));
    const anyHoldParams = buildClimbSearchParamsJson(makeSearchParams({ zoneBox, zoneMode: 'anyHold' }));

    expect(allHoldsParams).not.toBe(anyHoldParams);
    expect(JSON.parse(allHoldsParams)).toMatchObject({ zoneBox, zoneMode: 'allHolds' });
    expect(JSON.parse(anyHoldParams)).toMatchObject({ zoneBox, zoneMode: 'anyHold' });
  });

  it('omits zoneMode from the cache params when no zone is active', () => {
    const params = JSON.parse(buildClimbSearchParamsJson(makeSearchParams({ zoneMode: 'anyHold' }))) as Record<
      string,
      unknown
    >;

    expect(params.zoneBox).toBeNull();
    expect(params).not.toHaveProperty('zoneMode');
  });
});
