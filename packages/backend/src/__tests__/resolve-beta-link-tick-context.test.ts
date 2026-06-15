import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// db.select is called twice in resolveBetaLinkTickContext:
//   1. tick + alias left-join query  → chain: .from().leftJoin().leftJoin().where().limit()
//   2. existing beta-link check      → chain: .from().where().limit()
// Each test stubs these calls with mockImplementationOnce in order.
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
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

vi.mock('../events', () => ({ publishSocialEvent: vi.fn() }));

vi.mock('../graphql/resolvers/sessions/debounced-stats-publisher', () => ({
  publishDebouncedSessionStats: vi.fn(),
}));

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

import { resolveBetaLinkTickContext } from '../graphql/resolvers/ticks/mutations';

type TickRow = {
  uuid: string;
  userId: string;
  boardType: string;
  climbUuid: string;
  canonicalClimbUuid: string | null;
  inputCanonicalClimbUuid: string | null;
  angle: number;
  status: string;
  boardId: number | null;
};

function stubTickQuery(row: TickRow | null) {
  mockDbSelect.mockImplementationOnce((() => ({
    from: () => ({
      leftJoin: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve(row ? [row] : []),
          }),
        }),
      }),
    }),
  })) as unknown as () => never);
}

function stubBetaLinkCheck(existingLink: string | null) {
  mockDbSelect.mockImplementationOnce((() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(existingLink ? [{ link: existingLink }] : []),
      }),
    }),
  })) as unknown as () => never);
}

function makeTick(overrides: Partial<TickRow> = {}): TickRow {
  return {
    uuid: 'tick-uuid-1',
    userId: 'user-1',
    boardType: 'kilter',
    climbUuid: 'climb-1',
    canonicalClimbUuid: null,
    inputCanonicalClimbUuid: null,
    angle: 40,
    status: 'send',
    boardId: 42,
    ...overrides,
  };
}

describe('resolveBetaLinkTickContext', () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null context immediately when tickUuid is absent, never hitting the DB', async () => {
    const result = await resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1', angle: 45 }, 'user-1');
    expect(result).toEqual({ tickUuid: null, boardId: null, angle: 45 });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns null context with null angle when neither angle nor tickUuid is provided', async () => {
    const result = await resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1' }, 'user-1');
    expect(result).toEqual({ tickUuid: null, boardId: null, angle: null });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('throws TICK_NOT_FOUND when the tick UUID does not exist', async () => {
    stubTickQuery(null);
    await expect(
      resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'nonexistent-uuid' }, 'user-1'),
    ).rejects.toMatchObject({ extensions: { code: 'TICK_NOT_FOUND' } });
  });

  it('throws FORBIDDEN when the tick belongs to a different user', async () => {
    stubTickQuery(makeTick({ userId: 'other-user' }));
    await expect(
      resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'tick-uuid-1' }, 'user-1'),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('throws BETA_LINK_TICK_NOT_ASCENT when tick status is attempt', async () => {
    stubTickQuery(makeTick({ status: 'attempt' }));
    await expect(
      resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'tick-uuid-1' }, 'user-1'),
    ).rejects.toMatchObject({ extensions: { code: 'BETA_LINK_TICK_NOT_ASCENT' } });
  });

  it('throws BETA_LINK_TICK_MISMATCH when tick is for a different board type', async () => {
    stubTickQuery(makeTick({ boardType: 'tension' }));
    await expect(
      resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'tick-uuid-1' }, 'user-1'),
    ).rejects.toMatchObject({ extensions: { code: 'BETA_LINK_TICK_MISMATCH' } });
  });

  it('throws when tick climb UUID does not match the input climb UUID', async () => {
    stubTickQuery(makeTick({ climbUuid: 'climb-other', canonicalClimbUuid: null, inputCanonicalClimbUuid: null }));
    await expect(
      resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'tick-uuid-1' }, 'user-1'),
    ).rejects.toMatchObject({ extensions: { code: 'BETA_LINK_TICK_MISMATCH' } });
  });

  it('throws BETA_LINK_TICK_MISMATCH when the provided angle differs from the tick angle', async () => {
    stubTickQuery(makeTick({ angle: 40 }));
    await expect(
      resolveBetaLinkTickContext(
        { boardType: 'kilter', climbUuid: 'climb-1', angle: 45, tickUuid: 'tick-uuid-1' },
        'user-1',
      ),
    ).rejects.toMatchObject({ extensions: { code: 'BETA_LINK_TICK_MISMATCH' } });
  });

  it('does not throw for angle check when no input angle is provided', async () => {
    stubTickQuery(makeTick({ angle: 40 }));
    stubBetaLinkCheck(null);
    const result = await resolveBetaLinkTickContext(
      { boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'tick-uuid-1' },
      'user-1',
    );
    expect(result).toMatchObject({ tickUuid: 'tick-uuid-1', angle: 40 });
  });

  it('throws BETA_LINK_TICK_ALREADY_LINKED when the tick already has a beta video', async () => {
    stubTickQuery(makeTick());
    stubBetaLinkCheck('https://www.instagram.com/reel/EXISTING/');
    await expect(
      resolveBetaLinkTickContext({ boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'tick-uuid-1' }, 'user-1'),
    ).rejects.toMatchObject({ extensions: { code: 'BETA_LINK_TICK_ALREADY_LINKED' } });
  });

  it('returns full tick context on the happy path', async () => {
    stubTickQuery(makeTick());
    stubBetaLinkCheck(null);
    const result = await resolveBetaLinkTickContext(
      { boardType: 'kilter', climbUuid: 'climb-1', angle: 40, tickUuid: 'tick-uuid-1' },
      'user-1',
    );
    expect(result).toEqual({ tickUuid: 'tick-uuid-1', boardId: 42, angle: 40 });
  });

  it('accepts both flash and send status ticks', async () => {
    for (const status of ['flash', 'send'] as const) {
      mockDbSelect.mockReset();
      stubTickQuery(makeTick({ status }));
      stubBetaLinkCheck(null);
      const result = await resolveBetaLinkTickContext(
        { boardType: 'kilter', climbUuid: 'climb-1', tickUuid: 'tick-uuid-1' },
        'user-1',
      );
      expect(result.tickUuid).toBe('tick-uuid-1');
    }
  });

  it('resolves correctly when both tick and input share the same canonical UUID via aliases', async () => {
    // tick.climbUuid = 'alias-a' → canonical 'canonical-1'
    // input.climbUuid = 'alias-b' → canonical 'canonical-1'
    // Both resolve to the same canonical — should succeed.
    stubTickQuery(
      makeTick({ climbUuid: 'alias-a', canonicalClimbUuid: 'canonical-1', inputCanonicalClimbUuid: 'canonical-1' }),
    );
    stubBetaLinkCheck(null);
    const result = await resolveBetaLinkTickContext(
      { boardType: 'kilter', climbUuid: 'alias-b', tickUuid: 'tick-uuid-1' },
      'user-1',
    );
    expect(result.tickUuid).toBe('tick-uuid-1');
  });

  it('returns angle from the tick, not from the input (tick is authoritative)', async () => {
    stubTickQuery(makeTick({ angle: 30 }));
    stubBetaLinkCheck(null);
    const result = await resolveBetaLinkTickContext(
      // Matching angle passed — stored angle comes from the tick
      { boardType: 'kilter', climbUuid: 'climb-1', angle: 30, tickUuid: 'tick-uuid-1' },
      'user-1',
    );
    expect(result.angle).toBe(30);
  });
});
