import { describe, it, expect, beforeAll } from 'vite-plus/test';
import { sql } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { db } from '../db/client';
import { playlistQueries } from '../graphql/resolvers/playlists/queries';

// Seeds use raw `sql` rather than `db.insert(...)` because the integration test
// DB is built from a minimal hand-maintained DDL (schema-sql.ts), not the full
// Drizzle schema — the query builder emits every default-bearing column which
// that DDL omits, so a builder insert fails. Naming only the columns the test
// DDL declares is the genuine raw-SQL exception.

// Integration test (real DB) for #3891: specific-board mode size-filters the
// climb join on `compatible_size_ids`. MoonBoard has one fixed product size, so
// its climbs carry NULL there — and the old `sizeId = ANY(NULL)` predicate is
// NULL, never true, so every MoonBoard row was dropped. A MoonBoard playlist
// therefore returned zero climbs to the play drawer's queue-replacement fetch
// while the (all-boards-mode) detail list looked fine, and swiping in the drawer
// had a one-item queue to walk.
//
// The pair "MoonBoard climbs come back" + "a size-incompatible Kilter climb is
// still excluded" is load-bearing: either alone is satisfied by deleting the
// predicate outright.

const MOONBOARD_PLAYLIST_UUID = 'pl-board-scope-moon';
const KILTER_PLAYLIST_UUID = 'pl-board-scope-kilter';
const MOONBOARD_SIZE_ID = 1;
const KILTER_SIZE_ID = 25;

function makeCtx(overrides: Partial<ConnectionContext> = {}): ConnectionContext {
  return {
    connectionId: 'conn-1',
    isAuthenticated: false,
    userId: null,
    sessionId: null,
    boardPath: null,
    controllerId: null,
    controllerApiKey: null,
    ...overrides,
  } as ConnectionContext;
}

async function seedClimb(
  boardType: string,
  uuid: string,
  name: string,
  layoutId: number,
  compatibleSizeIds: number[] | null,
) {
  // Bind the array as a Postgres array literal cast to int[] — a JS array bound
  // directly is expanded into a `(a, b, c)` record by the driver.
  const sizeIdsLiteral = compatibleSizeIds === null ? null : `{${compatibleSizeIds.join(',')}}`;
  await db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, description, frames, is_listed, compatible_size_ids)
    VALUES (${uuid}, ${boardType}, ${layoutId}, 'setter', ${name}, '', 'p1r1', true, ${sizeIdsLiteral}::int[])
  `);
}

async function seedStats(boardType: string, uuid: string, angle: number) {
  await db.execute(sql`
    INSERT INTO board_climb_stats (board_type, climb_uuid, angle, display_difficulty, difficulty_average, quality_average, ascensionist_count, benchmark_difficulty)
    VALUES (${boardType}, ${uuid}, ${angle}, 18, 18, 3.0, 10, 0)
  `);
}

describe('playlistClimbs — board-scoped size filtering (real DB)', () => {
  beforeAll(async () => {
    // Playlist tables aren't in the global per-file reset list, so own the cleanup.
    await db.execute(sql`TRUNCATE TABLE playlist_climbs, playlist_ownership, playlists RESTART IDENTITY CASCADE`);

    // MoonBoard: one fixed size, so the ingest leaves compatible_size_ids NULL.
    await seedClimb('moonboard', 'moon-1', 'Moon One', 7, null);
    await seedClimb('moonboard', 'moon-2', 'Moon Two', 7, null);
    await seedStats('moonboard', 'moon-1', 40);
    await seedStats('moonboard', 'moon-2', 40);

    // Kilter: real size variants. `kilter-fits` is climbable on the queried size
    // (among others), `kilter-other` is not.
    await seedClimb('kilter', 'kilter-fits', 'Fits This Size', 1, [7, KILTER_SIZE_ID, 28]);
    await seedClimb('kilter', 'kilter-other', 'Different Size Only', 1, [99]);
    await seedStats('kilter', 'kilter-fits', 40);
    await seedStats('kilter', 'kilter-other', 40);

    // Explicit ids keep the playlist_climbs FK references trivial; the TRUNCATE
    // ... RESTART IDENTITY above frees ids 1 and 2.
    await db.execute(sql`
      INSERT INTO playlists (id, uuid, board_type, layout_id, name, is_public)
      VALUES (1, ${MOONBOARD_PLAYLIST_UUID}, 'moonboard', 7, 'Minimoon circuit', true),
             (2, ${KILTER_PLAYLIST_UUID}, 'kilter', 1, 'Kilter sizes', true)
    `);
    await db.execute(sql`
      INSERT INTO playlist_climbs (playlist_id, climb_uuid, angle, position)
      VALUES (1, 'moon-1', 40, 0), (1, 'moon-2', 40, 1),
             (2, 'kilter-fits', 40, 0), (2, 'kilter-other', 40, 1)
    `);
  });

  it('returns a MoonBoard playlist’s climbs in board-scoped mode, in position order', async () => {
    const result = await playlistQueries.playlistClimbs(
      null,
      {
        input: {
          playlistId: MOONBOARD_PLAYLIST_UUID,
          boardName: 'moonboard',
          layoutId: 7,
          sizeId: MOONBOARD_SIZE_ID,
          angle: 40,
        },
      },
      makeCtx(),
    );

    // Before the fix this was `[]` while totalCount said 2 — the play drawer then
    // built a one-item queue and prev/next had nowhere to go.
    expect(result.climbs.map((climb) => climb.uuid)).toEqual(['moon-1', 'moon-2']);
    expect(result.totalCount).toBe(2);
  });

  it('still excludes a Kilter climb that does not fit the requested size', async () => {
    const result = await playlistQueries.playlistClimbs(
      null,
      {
        input: {
          playlistId: KILTER_PLAYLIST_UUID,
          boardName: 'kilter',
          layoutId: 1,
          sizeId: KILTER_SIZE_ID,
          angle: 40,
        },
      },
      makeCtx(),
    );

    // The size filter must still bite on size-scoped boards: `kilter-other` is
    // only climbable on size 99. Deleting the predicate (rather than gating it on
    // board type) would make the MoonBoard case above pass and break this one.
    expect(result.climbs.map((climb) => climb.uuid)).toEqual(['kilter-fits']);
  });

  it('keeps a size-compatible Kilter climb whose array holds several sizes', async () => {
    // Pins the array-containment direction of the `= ANY(...)` → `@> ARRAY[...]`
    // rewrite: the requested size is one element of a multi-element array, not the
    // whole array.
    const result = await playlistQueries.playlistClimbs(
      null,
      { input: { playlistId: KILTER_PLAYLIST_UUID, boardName: 'kilter', layoutId: 1, sizeId: 7, angle: 40 } },
      makeCtx(),
    );

    expect(result.climbs.map((climb) => climb.uuid)).toEqual(['kilter-fits']);
  });

  it('agrees with all-boards mode about which MoonBoard climbs are in the playlist', async () => {
    // The user-visible invariant behind the bug report: the detail list
    // (all-boards mode) and the play drawer's queue fetch (board-scoped mode)
    // must contain the same climbs, however each is implemented.
    const boardScoped = await playlistQueries.playlistClimbs(
      null,
      {
        input: {
          playlistId: MOONBOARD_PLAYLIST_UUID,
          boardName: 'moonboard',
          layoutId: 7,
          sizeId: MOONBOARD_SIZE_ID,
          angle: 40,
        },
      },
      makeCtx(),
    );
    const allBoards = await playlistQueries.playlistClimbs(
      null,
      { input: { playlistId: MOONBOARD_PLAYLIST_UUID, activeBoardName: 'moonboard', activeAngle: 40 } },
      makeCtx(),
    );

    expect(new Set(boardScoped.climbs.map((climb) => climb.uuid))).toEqual(
      new Set(allBoards.climbs.map((climb) => climb.uuid)),
    );
  });
});
