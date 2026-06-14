import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the values passed to the boardBetaLinks insert so we can assert the
// save-side normalization stores the canonical (param-free) Instagram URL.
const { insertedValues, selectMock } = vi.hoisted(() => ({
  insertedValues: { current: null as Record<string, unknown> | null },
  // Dedup probe (findInstagramShortcodeConflict) — return no conflict.
  selectMock: vi.fn(() => ({
    from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([]) }) }),
  })),
}));

vi.mock('../db/client', () => ({
  db: {
    select: selectMock,
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValues.current = values;
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
  },
}));

vi.mock('../events', () => ({ publishSocialEvent: vi.fn() }));
vi.mock('../graphql/resolvers/sessions/debounced-stats-publisher', () => ({
  publishDebouncedSessionStats: vi.fn(),
}));

vi.mock('../utils/instagram-beta-validation', async () => {
  const actual = await vi.importActual<typeof import('../utils/instagram-beta-validation')>(
    '../utils/instagram-beta-validation',
  );
  return {
    ...actual,
    validateInstagramBetaLink: vi.fn(async () => ({ mediaId: 'DZlVfVhxKJZ', username: 'climber', imageUrl: null })),
  };
});

vi.mock('../lib/beta-link-thumbnails', async () => {
  const actual = await vi.importActual<typeof import('../lib/beta-link-thumbnails')>('../lib/beta-link-thumbnails');
  return { ...actual, cacheInstagramThumbnail: vi.fn(), isS3Configured: vi.fn(() => false) };
});

vi.mock('../redis/client', () => ({
  redisClientManager: {
    isRedisConnected: () => false,
    getClients: () => ({ publisher: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }),
  },
}));

vi.mock('../graphql/resolvers/shared/helpers', async () => {
  const actual = await vi.importActual<typeof import('../graphql/resolvers/shared/helpers')>(
    '../graphql/resolvers/shared/helpers',
  );
  return { ...actual, applyRateLimit: vi.fn(async () => {}) };
});

import { tickMutations } from '../graphql/resolvers/ticks/mutations';

const ctx = { userId: 'user-1', isAuthenticated: true } as unknown as Parameters<
  typeof tickMutations.attachBetaLink
>[2];

describe('attachBetaLink save-side normalization', () => {
  beforeEach(() => {
    insertedValues.current = null;
    selectMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the link and shortcode stripped of the igsh share-attribution param', async () => {
    const result = await tickMutations.attachBetaLink(
      undefined,
      {
        input: {
          boardType: 'kilter',
          climbUuid: '00000000-0000-0000-0000-000000000000',
          link: 'https://www.instagram.com/reel/DZlVfVhxKJZ/?igsh=NHB5ZXljZjV3bzB3',
        },
      },
      ctx,
    );

    expect(result).toBe(true);
    expect(insertedValues.current).toMatchObject({
      link: 'https://www.instagram.com/reel/DZlVfVhxKJZ/',
      shortcode: 'DZlVfVhxKJZ',
    });
  });
});
