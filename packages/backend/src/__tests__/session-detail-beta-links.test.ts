import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import * as dbSchema from '@boardsesh/db/schema';

// ---------------------------------------------------------------------------
// Mock harness
// ---------------------------------------------------------------------------
// `sessionDetail` drives several differently-shaped Drizzle fluent chains plus
// two raw `dbRead.execute(sql)` calls. Rather than emulate one rigid chain (as
// session-feed-query.test.ts does for the single sessionGroupedFeed query), we
// install a dispatching `dbRead` that branches on the table passed to
// `.from(...)`. Every chain resolves to a row array; the beta-links branch is
// counted so we can assert the per-session batch is a single query (no N+1
// per tick) and that the resolver groups the returned rows back onto each tick
// by climb.
//
// The is_listed = true / KayaClimb exclusion are SQL predicates evaluated by
// Postgres, so a pure mock cannot exercise the DB filter itself. We therefore
// (a) assert the resolver builds those predicates into the beta-links WHERE
// clause, and (b) have the mock return only the rows the real query would
// (the listed, non-Kaya link), proving the resolver surfaces exactly that row
// per tick.

const betaLinkTestState = vi.hoisted(() => {
  // Rows the *real* board_beta_links query would return after Postgres applies
  // `is_listed = true AND link !~* kayaclimb`. The unlisted row and the Kaya
  // row are intentionally absent — the DB drops them — so the resolver should
  // only ever see / surface the listed Instagram link.
  const betaLinkRowsByQuery: Array<Record<string, unknown>[]> = [];

  const executeMock = vi.fn();
  const betaLinkWhereClauses: unknown[] = [];
  const betaLinkSelectCallCount = { value: 0 };
  // Tick rows the big sessionDetail select resolves to. Mutated per-test; the
  // mock reads it live so each case controls its own session shape.
  const state: {
    betaLinkRowsByQuery: Array<Record<string, unknown>[]>;
    executeMock: typeof executeMock;
    betaLinkWhereClauses: unknown[];
    betaLinkSelectCallCount: { value: number };
    tickRows: Record<string, unknown>[];
  } = {
    betaLinkRowsByQuery,
    executeMock,
    betaLinkWhereClauses,
    betaLinkSelectCallCount,
    tickRows: [],
  };
  return state;
});

// Resolve a fluent select chain to a row array. Drizzle's builder is then-able
// (awaiting it runs the query), and also chains .from/.leftJoin/.where/.orderBy
// /.limit. We model that with a thenable proxy that ignores every intermediate
// call and resolves to `rows` when awaited.
function makeChain(rows: Record<string, unknown>[], onWhere?: (clause: unknown) => void) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  chain.leftJoin = passthrough;
  chain.innerJoin = passthrough;
  chain.orderBy = passthrough;
  chain.limit = passthrough;
  chain.groupBy = passthrough;
  chain.where = (clause: unknown) => {
    onWhere?.(clause);
    return chain;
  };
  // Make the chain awaitable -> resolves to the row array.
  chain.then = (resolve: (value: Record<string, unknown>[]) => unknown) => resolve(rows);
  return chain;
}

vi.mock('../db/client', () => {
  const select = vi.fn(() => ({
    from: (table: unknown) => {
      if (table === dbSchema.boardBetaLinks) {
        betaLinkTestState.betaLinkSelectCallCount.value += 1;
        const callIndex = betaLinkTestState.betaLinkSelectCallCount.value - 1;
        const rows = betaLinkTestState.betaLinkRowsByQuery[callIndex] ?? [];
        return makeChain(rows, (clause) => betaLinkTestState.betaLinkWhereClauses.push(clause));
      }
      if (table === dbSchema.boardSessions) {
        return makeChain([
          {
            id: 'party-1',
            name: 'Lunch Laps',
            goal: 'Finish the set',
            createdByUserId: 'user-1',
          },
        ]);
      }
      if (table === dbSchema.boardseshTicks) {
        return makeChain(betaLinkTestState.tickRows);
      }
      if (table === dbSchema.voteCounts) {
        // Both the per-tick batch (entityType='tick') and the session-level
        // count resolve through here; an empty array is a valid result for
        // both (no votes recorded).
        return makeChain([]);
      }
      if (table === dbSchema.comments) {
        return makeChain([{ count: 0 }]);
      }
      if (table === dbSchema.sessionHealthKitWorkouts) {
        return makeChain([]);
      }
      return makeChain([]);
    },
  }));

  const fakeDb = {
    select,
    // totalAttempts CTE + fetchParticipants both call dbRead.execute(sql).
    // rowsFromResult requires an array; returning [] keeps both happy.
    execute: betaLinkTestState.executeMock,
  };
  return { db: fakeDb, dbRead: fakeDb };
});

// Serialize a captured WHERE condition to real Postgres text using drizzle's
// own compiler — the same path the resolver uses to emit SQL. Far less brittle
// than hand-walking queryChunks: column names render as their snake_case
// identifiers (e.g. "is_listed") and inline `sql` fragments (the kayaclimb
// regex) render verbatim, so we can assert both predicates are present.
const pgDialect = new PgDialect();
function conditionToText(node: unknown): string {
  try {
    return pgDialect.sqlToQuery(node as SQL).sql;
  } catch {
    return '';
  }
}

const { sessionDetail } = await import('../graphql/resolvers/social/session-feed').then(
  (module) => module.sessionFeedQueries,
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeTickRow(overrides: {
  uuid: string;
  climbUuid: string;
  climbName: string;
  boardType?: string;
  angle?: number;
  status?: string;
}) {
  const boardType = overrides.boardType ?? 'kilter';
  const angle = overrides.angle ?? 40;
  return {
    tick: {
      uuid: overrides.uuid,
      userId: 'user-1',
      climbUuid: overrides.climbUuid,
      boardType,
      angle,
      status: overrides.status ?? 'send',
      attemptCount: 1,
      difficulty: 10,
      quality: 3,
      isMirror: false,
      isBenchmark: false,
      comment: null,
      climbedAt: '2024-01-15T10:00:00.000Z',
    },
    climbName: overrides.climbName,
    climbDescription: '',
    setterUsername: 'setter',
    layoutId: 1,
    frames: 'p1r1',
    difficultyName: 'V10',
    consensusDifficulty: 10,
  };
}

const LISTED_INSTAGRAM_LINK = 'https://www.instagram.com/p/LISTED/';
const LISTED_TIKTOK_LINK = 'https://www.tiktok.com/@climber/video/123';

describe('sessionDetail per-tick betaLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    betaLinkTestState.betaLinkRowsByQuery.length = 0;
    betaLinkTestState.betaLinkWhereClauses.length = 0;
    betaLinkTestState.betaLinkSelectCallCount.value = 0;
    // execute() backs the totalAttempts CTE and fetchParticipants; both go
    // through rowsFromResult, which requires an array.
    betaLinkTestState.executeMock.mockResolvedValue([]);
  });

  it('attaches a betaLinks array to every tick', async () => {
    betaLinkTestState.tickRows = [makeTickRow({ uuid: 'tick-1', climbUuid: 'climb-a', climbName: 'Crimpathon' })];
    // Real DB already dropped unlisted + Kaya rows; only the listed IG link
    // survives to the resolver.
    betaLinkTestState.betaLinkRowsByQuery.push([
      {
        boardType: 'kilter',
        climbUuid: 'climb-a',
        link: LISTED_INSTAGRAM_LINK,
        foreignUsername: 'marco',
        angle: 40,
        thumbnail: 'https://cdn.example/thumb.jpg',
        isListed: true,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
    ]);

    const result = await sessionDetail(undefined, { sessionId: 'party-1' });

    expect(result).not.toBeNull();
    expect(result?.ticks).toHaveLength(1);
    for (const tick of result?.ticks ?? []) {
      expect(Array.isArray(tick.betaLinks)).toBe(true);
    }
    expect(result?.ticks[0]?.betaLinks).toEqual([
      {
        climbUuid: 'climb-a',
        link: LISTED_INSTAGRAM_LINK,
        foreignUsername: 'marco',
        angle: 40,
        thumbnail: 'https://cdn.example/thumb.jpg',
        isListed: true,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
    ]);
  });

  it('only includes is_listed links and excludes KayaClimb URLs', async () => {
    betaLinkTestState.tickRows = [makeTickRow({ uuid: 'tick-1', climbUuid: 'climb-a', climbName: 'Crimpathon' })];
    // The mock returns what Postgres would after applying the is_listed/Kaya
    // predicates: only the listed, non-Kaya Instagram link. (The unlisted link
    // and the kayaclimb.com link the test "seeds" below never come back.)
    betaLinkTestState.betaLinkRowsByQuery.push([
      {
        boardType: 'kilter',
        climbUuid: 'climb-a',
        link: LISTED_INSTAGRAM_LINK,
        foreignUsername: 'marco',
        angle: 40,
        thumbnail: null,
        isListed: true,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
    ]);

    const result = await sessionDetail(undefined, { sessionId: 'party-1' });

    const links = result?.ticks[0]?.betaLinks ?? [];
    expect(links.map((betaLink) => betaLink.link)).toEqual([LISTED_INSTAGRAM_LINK]);
    // No unlisted link leaked through.
    expect(links.every((betaLink) => betaLink.isListed === true)).toBe(true);
    // No kayaclimb.com URL leaked through.
    expect(links.some((betaLink) => /kayaclimb\.com/i.test(betaLink.link))).toBe(false);

    // The is_listed = true and KayaClimb-exclusion predicates must actually be
    // in the WHERE clause the resolver sent to board_beta_links — that's what
    // makes the DB drop the unlisted/Kaya rows. Assert on the serialized SQL so
    // a future refactor that drops a predicate fails here.
    const betaWhereText = betaLinkTestState.betaLinkWhereClauses.map(conditionToText).join(' | ');
    expect(betaWhereText).toContain('is_listed');
    expect(betaWhereText.toLowerCase()).toContain('kayaclimb');
  });

  it('batches all climbs into a single query and groups links by climb (no per-tick N+1)', async () => {
    // Three ticks across two distinct climbs (climb-a twice, climb-b once).
    betaLinkTestState.tickRows = [
      makeTickRow({ uuid: 'tick-1', climbUuid: 'climb-a', climbName: 'Crimpathon' }),
      makeTickRow({ uuid: 'tick-2', climbUuid: 'climb-a', climbName: 'Crimpathon' }),
      makeTickRow({ uuid: 'tick-3', climbUuid: 'climb-b', climbName: 'Slopefest' }),
    ];
    // Single batched result for both climbs; climb-a has the IG link, climb-b
    // has a TikTok link. climb-b's row arrives in the same query.
    betaLinkTestState.betaLinkRowsByQuery.push([
      {
        boardType: 'kilter',
        climbUuid: 'climb-a',
        link: LISTED_INSTAGRAM_LINK,
        foreignUsername: 'marco',
        angle: 40,
        thumbnail: null,
        isListed: true,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        boardType: 'kilter',
        climbUuid: 'climb-b',
        link: LISTED_TIKTOK_LINK,
        foreignUsername: 'sam',
        angle: 40,
        thumbnail: null,
        isListed: true,
        createdAt: '2024-01-11T00:00:00.000Z',
      },
    ]);

    const result = await sessionDetail(undefined, { sessionId: 'party-1' });

    // Exactly one query hit board_beta_links for the whole session, regardless
    // of the three ticks / two climbs — the N+1 guard.
    expect(betaLinkTestState.betaLinkSelectCallCount.value).toBe(1);

    const ticks = result?.ticks ?? [];
    const byUuid = new Map(ticks.map((tick) => [tick.uuid, tick] as const));

    // Both ticks on climb-a get climb-a's link...
    expect(byUuid.get('tick-1')?.betaLinks?.map((link) => link.link)).toEqual([LISTED_INSTAGRAM_LINK]);
    expect(byUuid.get('tick-2')?.betaLinks?.map((link) => link.link)).toEqual([LISTED_INSTAGRAM_LINK]);
    // ...and the climb-b tick gets climb-b's link — correct grouping by climb.
    expect(byUuid.get('tick-3')?.betaLinks?.map((link) => link.link)).toEqual([LISTED_TIKTOK_LINK]);

    // A climb's links never bleed onto another climb's ticks.
    expect(byUuid.get('tick-3')?.betaLinks?.some((link) => link.link === LISTED_INSTAGRAM_LINK)).toBe(false);
  });

  it('returns an empty betaLinks array for climbs with no stored links', async () => {
    betaLinkTestState.tickRows = [
      makeTickRow({ uuid: 'tick-1', climbUuid: 'climb-a', climbName: 'Crimpathon' }),
      makeTickRow({ uuid: 'tick-2', climbUuid: 'climb-z', climbName: 'No Beta Here' }),
    ];
    // Only climb-a has a link; climb-z returns nothing from the batch query.
    betaLinkTestState.betaLinkRowsByQuery.push([
      {
        boardType: 'kilter',
        climbUuid: 'climb-a',
        link: LISTED_INSTAGRAM_LINK,
        foreignUsername: 'marco',
        angle: 40,
        thumbnail: null,
        isListed: true,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
    ]);

    const result = await sessionDetail(undefined, { sessionId: 'party-1' });

    const byUuid = new Map((result?.ticks ?? []).map((tick) => [tick.uuid, tick] as const));
    expect(byUuid.get('tick-1')?.betaLinks?.map((link) => link.link)).toEqual([LISTED_INSTAGRAM_LINK]);
    // Climb with no stored links surfaces an empty array, never undefined.
    expect(byUuid.get('tick-2')?.betaLinks).toEqual([]);
  });
});
