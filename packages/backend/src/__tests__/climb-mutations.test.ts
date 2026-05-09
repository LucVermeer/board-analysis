import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { climbMutations } from '../graphql/resolvers/climbs/mutations';

const { mockDb, mockPublishSocialEvent, insertCalls } = vi.hoisted(() => {
  const insertCalls: Array<{ table: unknown; values: unknown }> = [];

  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
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
    'limit',
    'values',
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

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      isDraft: false,
      isListed: true,
    });
  });

  it('stores non-draft MoonBoard climbs as listed', async () => {
    mockDb.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockDb.select
      .mockReturnValueOnce(
        createMockChain([{ name: 'Alice', displayName: 'Alice Setter', image: null, avatarUrl: null }]),
      )
      .mockReturnValueOnce(createMockChain([{ difficulty: 12 }]));
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
