import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { climbMutations } from '../graphql/resolvers/climbs/mutations';

const { mockDb, mockPublishSocialEvent, insertCalls } = vi.hoisted(() => {
  const insertCalls: Array<{ table: unknown; values: unknown }> = [];

  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    execute: vi.fn(),
  };

  const mockPublishSocialEvent = vi.fn().mockResolvedValue(undefined);

  return { mockDb, mockPublishSocialEvent, insertCalls };
});

vi.mock('../db/client', () => ({
  db: mockDb,
}));

vi.mock('../events', () => ({
  publishSocialEvent: mockPublishSocialEvent,
}));

vi.mock('../utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('../utils/redis-rate-limiter', () => ({
  checkRateLimitRedis: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(overrides: Partial<ConnectionContext> = {}): ConnectionContext {
  return {
    connectionId: 'conn-1',
    isAuthenticated: true,
    userId: 'user-123',
    sessionId: null,
    boardPath: null,
    controllerId: null,
    controllerApiKey: null,
    ...overrides,
  } as ConnectionContext;
}

function createMockChain(resolveValue: unknown = [], onValues?: (values: unknown) => void): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const methods = [
    'from',
    'where',
    'leftJoin',
    'orderBy',
    'limit',
    'values',
    'set',
    'returning',
    'onConflictDoNothing',
    'onConflictDoUpdate',
  ];

  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolveValue).then(resolve);

  for (const method of methods) {
    chain[method] = vi.fn((...args: unknown[]) => {
      if (method === 'values' && onValues) {
        onValues(args[0]);
      }
      return chain;
    });
  }

  return chain;
}

describe('climb mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.length = 0;
    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) =>
      callback(mockDb),
    );
  });

  it('stores non-draft Aurora climbs as listed', async () => {
    mockDb.select.mockReturnValueOnce(
      createMockChain([{ name: 'Alice', displayName: 'Alice Setter', image: null, avatarUrl: null }]),
    );
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.saveClimb(
      {},
      {
        input: {
          boardType: 'kilter',
          layoutId: 1,
          name: 'Test Aurora Climb',
          description: '',
          isDraft: false,
          frames: 'p1r43',
          angle: 40,
        },
      },
      makeCtx(),
    );

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].values).toMatchObject({
      isDraft: false,
      isListed: true,
    });
    expect(insertCalls[1].values).toMatchObject({
      boardType: 'kilter',
      angle: 40,
      ascensionistCount: 0,
    });
  });

  it('skips the stats seed for draft Aurora climbs', async () => {
    mockDb.select.mockReturnValueOnce(
      createMockChain([{ name: 'Alice', displayName: 'Alice Setter', image: null, avatarUrl: null }]),
    );
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.saveClimb(
      {},
      {
        input: {
          boardType: 'kilter',
          layoutId: 1,
          name: 'Draft Aurora Climb',
          description: '',
          isDraft: true,
          frames: 'p1r43',
          angle: 40,
        },
      },
      makeCtx(),
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      isDraft: true,
      isListed: false,
    });
  });

  it('stores non-draft MoonBoard climbs as listed', async () => {
    mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockDb.select
      .mockReturnValueOnce(
        createMockChain([{ name: 'Alice', displayName: 'Alice Setter', image: null, avatarUrl: null }]),
      )
      .mockReturnValueOnce(createMockChain([{ difficulty: 17 }]));
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.saveMoonBoardClimb(
      {},
      {
        input: {
          boardType: 'moonboard',
          layoutId: 3,
          name: 'MoonBoard Climb',
          description: '',
          holds: {
            start: ['A1'],
            hand: ['B2'],
            finish: ['C3'],
          },
          angle: 40,
          isDraft: false,
          userGrade: '6A+',
          isBenchmark: false,
        },
      },
      makeCtx(),
    );

    expect(insertCalls[0].values).toMatchObject({
      isDraft: false,
      isListed: true,
    });
    expect(insertCalls[1].values).toEqual([
      expect.objectContaining({
        boardType: 'moonboard',
        climbUuid: expect.any(String),
        holdId: 1,
        holdState: 'STARTING',
      }),
      expect.objectContaining({
        boardType: 'moonboard',
        climbUuid: expect.any(String),
        holdId: 13,
        holdState: 'HAND',
      }),
      expect.objectContaining({
        boardType: 'moonboard',
        climbUuid: expect.any(String),
        holdId: 25,
        holdState: 'FINISH',
      }),
    ]);
    expect(insertCalls[2].values).toMatchObject({
      boardType: 'moonboard',
      angle: 40,
      displayDifficulty: 17,
      benchmarkDifficulty: null,
      difficultyAverage: 17,
    });
  });

  it('seeds a stats row for MoonBoard climbs saved without a grade', async () => {
    mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockDb.select.mockReturnValueOnce(
      createMockChain([{ name: 'Bob', displayName: 'Bob Setter', image: null, avatarUrl: null }]),
    );
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.saveMoonBoardClimb(
      {},
      {
        input: {
          boardType: 'moonboard',
          layoutId: 3,
          name: 'No-grade MoonBoard',
          description: '',
          holds: {
            start: ['A1'],
            hand: ['B2'],
            finish: ['C3'],
          },
          angle: 40,
          isDraft: false,
        },
      },
      makeCtx(),
    );

    const statsInsert = insertCalls.find(
      (call) =>
        typeof call.values === 'object' &&
        call.values !== null &&
        'ascensionistCount' in call.values &&
        'angle' in call.values,
    );
    expect(statsInsert?.values).toMatchObject({
      boardType: 'moonboard',
      angle: 40,
      ascensionistCount: 0,
    });
    expect(statsInsert?.values).not.toHaveProperty('displayDifficulty');
    expect(statsInsert?.values).not.toHaveProperty('difficultyAverage');
  });

  it('skips the stats seed for draft MoonBoard climbs without a grade', async () => {
    mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockDb.select.mockReturnValueOnce(
      createMockChain([{ name: 'Bob', displayName: 'Bob Setter', image: null, avatarUrl: null }]),
    );
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.saveMoonBoardClimb(
      {},
      {
        input: {
          boardType: 'moonboard',
          layoutId: 3,
          name: 'Draft No-grade MoonBoard',
          description: '',
          holds: { start: ['A1'], hand: ['B2'], finish: ['C3'] },
          angle: 40,
          isDraft: true,
        },
      },
      makeCtx(),
    );

    // climb_holds rows are still inserted, but no board_climb_stats row should appear.
    const statsInsert = insertCalls.find(
      (call) => typeof call.values === 'object' && call.values !== null && 'ascensionistCount' in call.values,
    );
    expect(statsInsert).toBeUndefined();
  });

  it('seeds a stats row with the grade for draft MoonBoard climbs that supplied one', async () => {
    mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockDb.select
      .mockReturnValueOnce(createMockChain([{ name: 'Bob', displayName: 'Bob Setter', image: null, avatarUrl: null }]))
      .mockReturnValueOnce(createMockChain([{ difficulty: 17 }]));
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.saveMoonBoardClimb(
      {},
      {
        input: {
          boardType: 'moonboard',
          layoutId: 3,
          name: 'Draft Graded MoonBoard',
          description: '',
          holds: { start: ['A1'], hand: ['B2'], finish: ['C3'] },
          angle: 40,
          isDraft: true,
          userGrade: '6A+',
          isBenchmark: false,
        },
      },
      makeCtx(),
    );

    // We preserve the grade for draft MoonBoard climbs even though the search
    // filter masks the draft. Otherwise the user's grade would be lost on
    // publish (updateClimb has no userGrade source to reconstruct it from).
    const statsInsert = insertCalls.find(
      (call) => typeof call.values === 'object' && call.values !== null && 'displayDifficulty' in call.values,
    );
    expect(statsInsert?.values).toMatchObject({
      boardType: 'moonboard',
      angle: 40,
      displayDifficulty: 17,
      difficultyAverage: 17,
    });
  });

  it('seeds a stats row on draft → publish transition in updateClimb', async () => {
    mockDb.select
      .mockReturnValueOnce(
        createMockChain([
          {
            uuid: 'climb-1',
            userId: 'user-123',
            isDraft: true,
            publishedAt: null,
            createdAt: '2026-05-14T20:00:00.000Z',
            angle: 35,
            setterUsername: 'Alice Setter',
          },
        ]),
      )
      .mockReturnValueOnce(
        createMockChain([{ name: 'Alice', displayName: 'Alice Setter', image: null, avatarUrl: null }]),
      );
    mockDb.update = vi.fn().mockReturnValue(createMockChain(undefined));
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.updateClimb(
      {},
      {
        input: {
          boardType: 'kilter',
          uuid: 'climb-1',
          isDraft: false,
        },
      },
      makeCtx(),
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      boardType: 'kilter',
      climbUuid: 'climb-1',
      angle: 35,
      ascensionistCount: 0,
      faUsername: 'Alice Setter',
    });
    // Prove the full publish path ran past the stats insert — getUserProfile is
    // called inside the `transitioningToPublished` block and feeds the social
    // event payload, so a successful publish event call means both the second
    // select mock was consumed and publishSocialEvent received it.
    expect(mockPublishSocialEvent).toHaveBeenCalledTimes(1);
    expect(mockPublishSocialEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'climb.created',
        entityId: 'climb-1',
        metadata: expect.objectContaining({ setterDisplayName: 'Alice Setter' }),
      }),
    );
  });

  it('throws when publishing a draft without an angle', async () => {
    mockDb.select.mockReturnValueOnce(
      createMockChain([
        {
          uuid: 'climb-no-angle',
          userId: 'user-123',
          isDraft: true,
          publishedAt: null,
          createdAt: '2026-05-14T20:00:00.000Z',
          angle: null,
          setterUsername: null,
        },
      ]),
    );
    mockDb.update = vi.fn().mockReturnValue(createMockChain(undefined));
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await expect(
      climbMutations.updateClimb(
        {},
        { input: { boardType: 'kilter', uuid: 'climb-no-angle', isDraft: false } },
        makeCtx(),
      ),
    ).rejects.toThrow('Cannot publish climb without an angle');

    // The throw must fire BEFORE the board_climbs update — otherwise the caller
    // sees a 500 but the row is left in a half-published state (isDraft = false,
    // publishedAt = now, no stats row), which is the bug this PR is fixing.
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });

  it('seeds a stats row on angle change for a published climb in updateClimb', async () => {
    const publishedAt = new Date(Date.now() - 60 * 1000).toISOString();
    mockDb.select.mockReturnValueOnce(
      createMockChain([
        {
          uuid: 'climb-2',
          userId: 'user-123',
          isDraft: false,
          publishedAt,
          createdAt: publishedAt,
          angle: 35,
          setterUsername: 'Bob Setter',
        },
      ]),
    );
    mockDb.update = vi.fn().mockReturnValue(createMockChain(undefined));
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.updateClimb(
      {},
      {
        input: {
          boardType: 'kilter',
          uuid: 'climb-2',
          angle: 40,
        },
      },
      makeCtx(),
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      boardType: 'kilter',
      climbUuid: 'climb-2',
      angle: 40,
      ascensionistCount: 0,
      faUsername: 'Bob Setter',
    });
  });

  it('does not re-seed stats on a no-op publish/angle update', async () => {
    const publishedAt = new Date(Date.now() - 60 * 1000).toISOString();
    mockDb.select.mockReturnValueOnce(
      createMockChain([
        {
          uuid: 'climb-3',
          userId: 'user-123',
          isDraft: false,
          publishedAt,
          createdAt: publishedAt,
          angle: 35,
          setterUsername: 'Carol Setter',
        },
      ]),
    );
    mockDb.update = vi.fn().mockReturnValue(createMockChain(undefined));
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await climbMutations.updateClimb(
      {},
      {
        input: {
          boardType: 'kilter',
          uuid: 'climb-3',
          name: 'Renamed',
        },
      },
      makeCtx(),
    );

    expect(insertCalls).toHaveLength(0);
  });

  it('rejects duplicate MoonBoard climbs before inserting', async () => {
    mockDb.execute
      .mockResolvedValueOnce([
        {
          uuid: 'existing-uuid',
          name: 'Already There',
          ascensionist_count: 12,
          signature: '1:STARTING,13:HAND,25:FINISH',
        },
      ])
      .mockResolvedValueOnce([]);
    mockDb.select.mockReturnValueOnce(
      createMockChain([{ name: 'Alice', displayName: 'Alice Setter', image: null, avatarUrl: null }]),
    );
    mockDb.insert.mockImplementation((table: unknown) =>
      createMockChain(undefined, (values) => insertCalls.push({ table, values })),
    );

    await expect(
      climbMutations.saveMoonBoardClimb(
        {},
        {
          input: {
            boardType: 'moonboard',
            layoutId: 3,
            name: 'MoonBoard Climb',
            description: '',
            holds: {
              start: ['A1'],
              hand: ['B2'],
              finish: ['C3'],
            },
            angle: 40,
            isDraft: false,
          },
        },
        makeCtx(),
      ),
    ).rejects.toThrow('A MoonBoard climb with the same holds already exists: "Already There"');

    expect(insertCalls).toHaveLength(0);
    expect(mockPublishSocialEvent).not.toHaveBeenCalled();
  });

  it('deletes an owned draft climb', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ uuid: 'draft-1', userId: 'user-123', isDraft: true }]));
    mockDb.delete.mockReturnValue(createMockChain([{ uuid: 'draft-1' }]));

    const result = await climbMutations.deleteDraftClimb(
      {},
      {
        uuid: 'draft-1',
        boardType: 'kilter',
      },
      makeCtx(),
    );

    expect(result).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledTimes(4);
  });

  it('rejects non-owned draft deletion', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ uuid: 'draft-1', userId: 'other-user', isDraft: true }]));
    mockDb.delete.mockReturnValue(createMockChain([{ uuid: 'draft-1' }]));

    await expect(
      climbMutations.deleteDraftClimb(
        {},
        {
          uuid: 'draft-1',
          boardType: 'kilter',
        },
        makeCtx(),
      ),
    ).rejects.toThrow('You can only delete your own draft climbs');

    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('rejects published climb deletion', async () => {
    mockDb.select.mockReturnValueOnce(createMockChain([{ uuid: 'published-1', userId: 'user-123', isDraft: false }]));
    mockDb.delete.mockReturnValue(createMockChain([{ uuid: 'published-1' }]));

    await expect(
      climbMutations.deleteDraftClimb(
        {},
        {
          uuid: 'published-1',
          boardType: 'kilter',
        },
        makeCtx(),
      ),
    ).rejects.toThrow('Published climbs cannot be deleted here');

    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
