import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ConnectionContext } from '@boardsesh/shared-schema';

type MockTickRow = {
  uuid: string;
  userId: string;
  boardType: string;
  climbUuid: string;
  angle: number;
  isMirror: boolean | null;
  status: 'flash' | 'send' | 'attempt';
  attemptCount: number;
  quality: number | null;
  difficulty: number | null;
  isBenchmark: boolean | null;
  comment: string | null;
  climbedAt: string;
  createdAt: string;
  updatedAt: string;
};

const dbMocks = vi.hoisted(() => {
  const state: {
    existingRows: unknown[];
    updatedRows: unknown[];
    updatePayload: Record<string, unknown> | null;
  } = {
    existingRows: [],
    updatedRows: [],
    updatePayload: null,
  };

  return {
    state,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => state.existingRows),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((payload: Record<string, unknown>) => {
          state.updatePayload = payload;
          return {
            where: vi.fn(() => ({
              returning: vi.fn(() => state.updatedRows),
            })),
          };
        }),
      })),
    },
  };
});

const queueMocks = vi.hoisted(() => ({
  queueClimbStatsRecompute: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../db/client', () => ({ db: dbMocks.db }));
vi.mock('../graphql/resolvers/ticks/debounced-climb-stats-publisher', () => queueMocks);
vi.mock('../utils/logger', () => loggerMocks);

import { UpdateTickInputSchema } from '../validation/schemas/ticks';
import { tickMutations } from '../graphql/resolvers/ticks/mutations';

function makeTickRow(overrides: Partial<MockTickRow> = {}): MockTickRow {
  const now = '2026-06-01T10:30:00.000Z';
  return {
    uuid: 'tick-1',
    userId: 'user-1',
    boardType: 'kilter',
    climbUuid: 'climb-1',
    angle: 40,
    isMirror: false,
    status: 'flash',
    attemptCount: 1,
    quality: null,
    difficulty: null,
    isBenchmark: false,
    comment: null,
    climbedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const authenticatedContext: ConnectionContext = {
  connectionId: 'connection-1',
  transport: 'ws',
  isAuthenticated: true,
  userId: 'user-1',
};

beforeEach(() => {
  dbMocks.state.existingRows = [];
  dbMocks.state.updatedRows = [];
  dbMocks.state.updatePayload = null;
  dbMocks.db.select.mockClear();
  dbMocks.db.update.mockClear();
  queueMocks.queueClimbStatsRecompute.mockClear();
  loggerMocks.logger.warn.mockClear();
});

describe('UpdateTickInputSchema', () => {
  it('accepts a one-try send so existing quick-tick rows remain editable', () => {
    expect(() =>
      UpdateTickInputSchema.parse({
        status: 'send',
        attemptCount: 1,
        quality: 4,
        difficulty: 22,
        comment: 'Still counts',
      }),
    ).not.toThrow();
  });

  it('still rejects flashes with attempt counts above one', () => {
    expect(() =>
      UpdateTickInputSchema.parse({
        status: 'flash',
        attemptCount: 2,
      }),
    ).toThrowError(/Flash requires attemptCount of 1/);
  });

  it('accepts a climbed-at timestamp for date edits', () => {
    expect(() =>
      UpdateTickInputSchema.parse({
        climbedAt: '2026-06-01T10:30:00.000Z',
      }),
    ).not.toThrow();
  });

  it('rejects invalid climbed-at timestamps', () => {
    expect(() =>
      UpdateTickInputSchema.parse({
        climbedAt: 'not a date',
      }),
    ).toThrowError(/Climbed at must be a valid date/);
  });

  it('rejects future climbed-at timestamps', () => {
    expect(() =>
      UpdateTickInputSchema.parse({
        climbedAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    ).toThrowError(/Climbed at cannot be in the future/);
  });
});

describe('tickMutations.updateTick', () => {
  it('coerces attempt count when an existing flash tick is updated without status', async () => {
    const existingTick = makeTickRow({ attemptCount: 1, status: 'flash' });
    const updatedTick = makeTickRow({ attemptCount: 1, status: 'flash' });
    dbMocks.state.existingRows = [existingTick];
    dbMocks.state.updatedRows = [updatedTick];

    const result = await tickMutations.updateTick(
      null,
      {
        uuid: existingTick.uuid,
        input: { attemptCount: 5 },
      },
      authenticatedContext,
    );

    expect(dbMocks.state.updatePayload).toMatchObject({ attemptCount: 1 });
    expect(result).toMatchObject({
      uuid: existingTick.uuid,
      status: 'flash',
      attemptCount: 1,
    });
    expect(loggerMocks.logger.warn).toHaveBeenCalledWith(
      '[updateTick] Coerced flash tick attemptCount to 1',
      expect.objectContaining({
        tickUuid: existingTick.uuid,
        userId: authenticatedContext.userId,
        previousAttemptCount: existingTick.attemptCount,
      }),
    );
    expect(queueMocks.queueClimbStatsRecompute).toHaveBeenCalledWith('kilter', 'climb-1', 40);
  });
});
