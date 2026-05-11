import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(() => {
    throw new Error('db.select should not be called for non-Instagram URLs');
  }),
}));

vi.mock('../db/client', () => ({
  db: {
    select: mockDbSelect,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../events', () => ({
  publishSocialEvent: vi.fn(),
}));

vi.mock('../jobs/inferred-session-builder', () => ({
  assignInferredSession: vi.fn(),
}));

vi.mock('../graphql/resolvers/sessions/debounced-stats-publisher', () => ({
  publishDebouncedSessionStats: vi.fn(),
}));

vi.mock('../lib/beta-link-thumbnails', () => ({
  cacheInstagramThumbnail: vi.fn(),
  isS3Configured: vi.fn(() => false),
}));

// Stub the rate limiter; the gate test only cares about the early-return path
// for non-Instagram URLs, where applyRateLimit shouldn't even be reached.
const { mockApplyRateLimit } = vi.hoisted(() => ({
  mockApplyRateLimit: vi.fn(async () => {}),
}));
vi.mock('../graphql/resolvers/shared/helpers', async () => {
  const actual = await vi.importActual<typeof import('../graphql/resolvers/shared/helpers')>(
    '../graphql/resolvers/shared/helpers',
  );
  return { ...actual, applyRateLimit: mockApplyRateLimit };
});

const fakeCtx = { userId: 'test-user', isAuthenticated: true } as unknown as Parameters<
  typeof import('../graphql/resolvers/ticks/mutations').validateAndEnrichBetaLinkInsert
>[0];

import { validateAndEnrichBetaLinkInsert, videoUrlForTickStatus } from '../graphql/resolvers/ticks/mutations';
import { escapeLikePattern } from '../utils/like-pattern';

const fetchMock = vi.fn(() => {
  throw new Error('fetch should not be called for non-Instagram URLs');
});

describe('validateAndEnrichBetaLinkInsert (gate)', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    mockDbSelect.mockClear();
    mockApplyRateLimit.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns insert plan with null enrichment for TikTok URLs without hitting fetch or DB', async () => {
    const result = await validateAndEnrichBetaLinkInsert(
      fakeCtx,
      'kilter',
      '00000000-0000-0000-0000-000000000000',
      'https://www.tiktok.com/@user/video/12345',
      { onSameClimbDup: 'throw' },
    );

    expect(result).toEqual({ action: 'insert', thumbnail: null, foreignUsername: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns insert plan for short-form TikTok URLs', async () => {
    const result = await validateAndEnrichBetaLinkInsert(
      fakeCtx,
      'tension',
      '00000000-0000-0000-0000-000000000000',
      'https://vm.tiktok.com/abc123',
      { onSameClimbDup: 'skip' },
    );

    expect(result).toEqual({ action: 'insert', thumbnail: null, foreignUsername: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('does not invoke the rate limiter for non-Instagram URLs', async () => {
    await validateAndEnrichBetaLinkInsert(
      fakeCtx,
      'kilter',
      '00000000-0000-0000-0000-000000000000',
      'https://www.tiktok.com/@user/video/12345',
      { onSameClimbDup: 'throw' },
    );
    expect(mockApplyRateLimit).not.toHaveBeenCalled();
  });

  // Locks in that the rate limit fires before the dedup DB probe for IG
  // URLs. If the order flips, an authenticated caller could enumerate "is
  // this shortcode attached to any climb on this board?" without burning
  // budget by watching the error variant (cross-climb vs same-climb vs
  // none). The fetch mock will throw if we reach the IG-fetch step, so the
  // rate limiter has to short-circuit before either the DB or the network
  // is touched.
  it('applies the rate limit before any DB or network access for Instagram URLs', async () => {
    const order: string[] = [];
    mockApplyRateLimit.mockImplementationOnce(async () => {
      order.push('rate-limit');
      throw new Error('rate limited');
    });
    mockDbSelect.mockImplementation((() => {
      order.push('db');
      return {
        from: () => ({
          innerJoin: () => ({ where: () => Promise.resolve([]) }),
        }),
      };
    }) as unknown as () => never);

    await expect(
      validateAndEnrichBetaLinkInsert(
        fakeCtx,
        'kilter',
        '00000000-0000-0000-0000-000000000000',
        'https://www.instagram.com/reel/ABC123xyz/',
        { onSameClimbDup: 'throw' },
      ),
    ).rejects.toThrow('rate limited');

    expect(order).toEqual(['rate-limit']);
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('videoUrlForTickStatus', () => {
  it('returns the URL for flash/send', () => {
    const url = 'https://www.instagram.com/reel/ABC123/';
    expect(videoUrlForTickStatus('flash', url)).toBe(url);
    expect(videoUrlForTickStatus('send', url)).toBe(url);
  });

  it('returns null for attempt status (beta only attaches on successful ascents)', () => {
    expect(videoUrlForTickStatus('attempt', 'https://www.instagram.com/reel/ABC123/')).toBeNull();
  });

  it('returns null when no URL is provided', () => {
    expect(videoUrlForTickStatus('send', null)).toBeNull();
    expect(videoUrlForTickStatus('send', undefined)).toBeNull();
    expect(videoUrlForTickStatus('flash', '')).toBeNull();
  });
});

describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards in shortcodes', () => {
    expect(escapeLikePattern('A_B')).toBe('A\\_B');
    expect(escapeLikePattern('A%B')).toBe('A\\%B');
    expect(escapeLikePattern('A_B%C_D')).toBe('A\\_B\\%C\\_D');
  });

  it('escapes backslashes before adding new escape sequences', () => {
    expect(escapeLikePattern('A\\B')).toBe('A\\\\B');
    expect(escapeLikePattern('A\\_B')).toBe('A\\\\\\_B');
  });

  it('passes plain alphanumerics through unchanged', () => {
    expect(escapeLikePattern('ABC123xyz')).toBe('ABC123xyz');
    expect(escapeLikePattern('DLM2nf9S1h6')).toBe('DLM2nf9S1h6');
  });
});

// findInstagramShortcodeConflict drives the dedup decisions for both call
// sites. We test it by short-circuiting the drizzle chain mock so we can feed
// the rows we want directly.
describe('findInstagramShortcodeConflict', () => {
  const stubDbReturning = (rows: Array<{ climbName: string | null; climbUuid: string }>) => {
    // Drizzle's chained query builder is heavily typed; for unit tests we
    // only need the runtime shape. Cast through unknown to bypass the
    // void-returning signature `mockDbSelect` got from its initial setup.
    mockDbSelect.mockImplementation((() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    })) as unknown as () => never);
  };

  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it('returns same-climb when the existing row is on the same climb', async () => {
    const { findInstagramShortcodeConflict } = await import('../graphql/resolvers/ticks/mutations');
    stubDbReturning([{ climbName: 'Cut to the Chase', climbUuid: 'climb-1' }]);
    const result = await findInstagramShortcodeConflict(
      'kilter',
      'climb-1',
      'https://www.instagram.com/reel/ABC123xyz/',
    );
    expect(result).toEqual({ kind: 'same-climb' });
  });

  it('returns cross-climb with the other climb name when the row is on a different climb', async () => {
    const { findInstagramShortcodeConflict } = await import('../graphql/resolvers/ticks/mutations');
    stubDbReturning([{ climbName: 'The Project', climbUuid: 'climb-other' }]);
    const result = await findInstagramShortcodeConflict(
      'kilter',
      'climb-1',
      'https://www.instagram.com/reel/ABC123xyz/',
    );
    expect(result).toEqual({ kind: 'cross-climb', climbName: 'The Project' });
  });

  it('falls back to "another climb" if the conflicting row has a null climb name', async () => {
    const { findInstagramShortcodeConflict } = await import('../graphql/resolvers/ticks/mutations');
    stubDbReturning([{ climbName: null, climbUuid: 'climb-other' }]);
    const result = await findInstagramShortcodeConflict(
      'kilter',
      'climb-1',
      'https://www.instagram.com/reel/ABC123xyz/',
    );
    expect(result).toEqual({ kind: 'cross-climb', climbName: 'another climb' });
  });

  it('returns none when no rows match', async () => {
    const { findInstagramShortcodeConflict } = await import('../graphql/resolvers/ticks/mutations');
    stubDbReturning([]);
    const result = await findInstagramShortcodeConflict(
      'kilter',
      'climb-1',
      'https://www.instagram.com/reel/ABC123xyz/',
    );
    expect(result).toEqual({ kind: 'none' });
  });

  it('returns none for non-Instagram URLs (no shortcode to look up)', async () => {
    const { findInstagramShortcodeConflict } = await import('../graphql/resolvers/ticks/mutations');
    const result = await findInstagramShortcodeConflict(
      'kilter',
      'climb-1',
      'https://www.tiktok.com/@user/video/12345',
    );
    expect(result).toEqual({ kind: 'none' });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});
