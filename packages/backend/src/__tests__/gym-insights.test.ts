import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { db } from '../db/client';
import { socialGymInsightsQueries } from '../graphql/resolvers/social/gym-insights';

/**
 * Real-DB coverage for the owner Insights query (gymStats):
 *   - the read gate (owner / gym admin / gym editor allowed; plain member,
 *     stranger, anon rejected);
 *   - the current-vs-previous-window aggregation (unique climbers, ascents,
 *     top climbs with resolved name + consensus grade, busiest days);
 *   - the scoping guards: only the gym's boards count, only flash/send ticks
 *     count, and ticks outside both windows are excluded;
 *   - the empty-gym path (no boards / no ticks → zeros + empty lists).
 *
 * Seeds via raw SQL and calls the resolver directly against the per-worker test
 * DB, mirroring gym-kiosks.test.ts.
 */

const OWNER = 'gi-owner';
const ADMIN = 'gi-admin';
const EDITOR = 'gi-editor';
const MEMBER = 'gi-member';
const RANDOM = 'gi-random';
const ALL_USERS = [OWNER, ADMIN, EDITOR, MEMBER, RANDOM];

const CLIMB_PREFIX = 'gym-insights-test-climb-';
const BOARD_TYPE = 'kilter';

let connectionCounter = 0;
const authCtx = (userId: string): ConnectionContext =>
  ({ connectionId: `conn-${userId}-${connectionCounter++}`, isAuthenticated: true, userId }) as ConnectionContext;
const anonCtx = (): ConnectionContext =>
  ({ connectionId: `conn-anon-${connectionCounter++}`, isAuthenticated: false }) as ConnectionContext;

const daysAgoIso = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const insertUser = (id: string) =>
  db.execute(sql`
    INSERT INTO "users" (id, email, name, created_at, updated_at)
    VALUES (${id}, ${id + '@test.com'}, ${'User ' + id}, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);

const insertGym = async (opts: {
  ownerId: string;
  name: string;
  slug: string;
  isPublic?: boolean;
}): Promise<{ id: number; uuid: string; slug: string }> => {
  const { ownerId, name, slug, isPublic = true } = opts;
  const uuid = uuidv4();
  const result = await db.execute(sql`
    INSERT INTO gyms (uuid, name, slug, owner_id, is_public, created_at, updated_at)
    VALUES (${uuid}, ${name}, ${slug}, ${ownerId}, ${isPublic}, now(), now())
    RETURNING id
  `);
  return { id: Number(Array.from(result as Iterable<{ id: number }>)[0].id), uuid, slug };
};

let boardConfigCounter = 0;
const insertBoard = async (opts: {
  gymId: number;
  ownerId: string;
  name: string;
}): Promise<{ id: number; uuid: string }> => {
  const { gymId, ownerId, name } = opts;
  const uuid = uuidv4();
  const sizeId = 100 + boardConfigCounter++;
  const result = await db.execute(sql`
    INSERT INTO user_boards
      (uuid, slug, owner_id, board_type, layout_id, size_id, set_ids, name, gym_id, is_public, created_at, updated_at)
    VALUES (${uuid}, ${uuid}, ${ownerId}, ${BOARD_TYPE}, 1, ${sizeId}, '1,2', ${name}, ${gymId}, true, now(), now())
    RETURNING id
  `);
  return { id: Number(Array.from(result as Iterable<{ id: number }>)[0].id), uuid };
};

const insertGymMember = (gymId: number, userId: string, role: string) =>
  db.execute(sql`
    INSERT INTO gym_members (gym_id, user_id, role, created_at)
    VALUES (${gymId}, ${userId}, ${role}, now())
  `);

const insertClimb = (uuid: string, name: string) =>
  db.execute(sql`
    INSERT INTO board_climbs (uuid, board_type, layout_id, name, is_listed, is_draft)
    VALUES (${uuid}, ${BOARD_TYPE}, 1, ${name}, true, false)
    ON CONFLICT (uuid) DO NOTHING
  `);

const insertClimbStats = (climbUuid: string, angle: number, displayDifficulty: number) =>
  db.execute(sql`
    INSERT INTO board_climb_stats (board_type, climb_uuid, angle, display_difficulty)
    VALUES (${BOARD_TYPE}, ${climbUuid}, ${angle}, ${displayDifficulty})
  `);

const insertGrade = (difficulty: number, boulderName: string) =>
  db.execute(sql`
    INSERT INTO board_difficulty_grades (board_type, difficulty, boulder_name, is_listed)
    VALUES (${BOARD_TYPE}, ${difficulty}, ${boulderName}, true)
    ON CONFLICT (board_type, difficulty) DO UPDATE SET boulder_name = excluded.boulder_name
  `);

const insertTick = (opts: {
  userId: string;
  boardId: number;
  climbUuid: string;
  climbedAt: string;
  status?: 'flash' | 'send' | 'attempt';
  angle?: number;
}) =>
  db.execute(sql`
    INSERT INTO boardsesh_ticks (uuid, user_id, board_type, climb_uuid, angle, status, attempt_count, climbed_at, board_id)
    VALUES (
      ${uuidv4()}, ${opts.userId}, ${BOARD_TYPE}, ${opts.climbUuid}, ${opts.angle ?? 40},
      ${opts.status ?? 'send'}, 1, ${opts.climbedAt}::timestamptz, ${opts.boardId}
    )
  `);

const CLIMB_X = `${CLIMB_PREFIX}x`;
const CLIMB_Y = `${CLIMB_PREFIX}y`;

let publicGym: { id: number; uuid: string; slug: string };
let boardA: { id: number; uuid: string };
let boardB: { id: number; uuid: string };
let otherGymBoard: { id: number; uuid: string };

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      "gym_kiosks", "gym_members", "gym_follows", "gym_claims",
      "board_follows", "boardsesh_ticks", "user_boards", "gyms"
    RESTART IDENTITY CASCADE
  `);
  await db.execute(sql`DELETE FROM board_climb_stats WHERE climb_uuid LIKE ${CLIMB_PREFIX + '%'}`);
  await db.execute(sql`DELETE FROM board_climbs WHERE uuid LIKE ${CLIMB_PREFIX + '%'}`);
  await db.execute(sql`DELETE FROM board_difficulty_grades WHERE board_type = ${BOARD_TYPE} AND difficulty = 13`);

  await Promise.all(ALL_USERS.map(insertUser));

  publicGym = await insertGym({ ownerId: OWNER, name: 'Insights Gym', slug: 'insights-gym' });
  await insertGymMember(publicGym.id, ADMIN, 'admin');
  await insertGymMember(publicGym.id, EDITOR, 'editor');
  await insertGymMember(publicGym.id, MEMBER, 'member');
  boardA = await insertBoard({ gymId: publicGym.id, ownerId: OWNER, name: 'A Wall' });
  boardB = await insertBoard({ gymId: publicGym.id, ownerId: OWNER, name: 'B Wall' });

  const otherGym = await insertGym({ ownerId: RANDOM, name: 'Other Gym', slug: 'other-gym' });
  otherGymBoard = await insertBoard({ gymId: otherGym.id, ownerId: RANDOM, name: 'Elsewhere Wall' });

  // Catalog: two climbs; CLIMB_X carries a consensus grade (display 13.2 → 13 → "V4").
  await insertClimb(CLIMB_X, 'Crimpy Traverse');
  await insertClimb(CLIMB_Y, 'Sloper Heaven');
  await insertClimbStats(CLIMB_X, 40, 13.2);
  await insertGrade(13, 'V4');

  // Current window (last 7 days): 3 ascents, 3 distinct climbers, CLIMB_X twice.
  await insertTick({ userId: OWNER, boardId: boardA.id, climbUuid: CLIMB_X, climbedAt: daysAgoIso(1) });
  await insertTick({
    userId: ADMIN,
    boardId: boardA.id,
    climbUuid: CLIMB_X,
    climbedAt: daysAgoIso(2),
    status: 'flash',
  });
  await insertTick({ userId: EDITOR, boardId: boardB.id, climbUuid: CLIMB_Y, climbedAt: daysAgoIso(3) });

  // Previous window (7–14 days ago): 2 ascents, 2 distinct climbers.
  await insertTick({ userId: OWNER, boardId: boardA.id, climbUuid: CLIMB_X, climbedAt: daysAgoIso(9) });
  await insertTick({ userId: MEMBER, boardId: boardA.id, climbUuid: CLIMB_Y, climbedAt: daysAgoIso(11) });

  // Excluded: too old, an attempt, and a tick on another gym's board.
  await insertTick({ userId: OWNER, boardId: boardA.id, climbUuid: CLIMB_X, climbedAt: daysAgoIso(20) });
  await insertTick({
    userId: OWNER,
    boardId: boardA.id,
    climbUuid: CLIMB_X,
    climbedAt: daysAgoIso(1),
    status: 'attempt',
  });
  await insertTick({ userId: RANDOM, boardId: otherGymBoard.id, climbUuid: CLIMB_X, climbedAt: daysAgoIso(1) });
});

describe('gymStats access guard', () => {
  it('lets the owner, a gym admin, and a gym editor read stats', async () => {
    for (const user of [OWNER, ADMIN, EDITOR]) {
      const stats = await socialGymInsightsQueries.gymStats({}, { input: { gymUuid: publicGym.uuid } }, authCtx(user));
      expect(stats.gymUuid).toBe(publicGym.uuid);
    }
  });

  it('rejects a plain member', async () => {
    await expect(
      socialGymInsightsQueries.gymStats({}, { input: { gymUuid: publicGym.uuid } }, authCtx(MEMBER)),
    ).rejects.toThrow(/not authorized/i);
  });

  it('rejects a stranger', async () => {
    await expect(
      socialGymInsightsQueries.gymStats({}, { input: { gymUuid: publicGym.uuid } }, authCtx(RANDOM)),
    ).rejects.toThrow(/not authorized/i);
  });

  it('rejects an anonymous caller', async () => {
    await expect(
      socialGymInsightsQueries.gymStats({}, { input: { gymUuid: publicGym.uuid } }, anonCtx()),
    ).rejects.toThrow(/authentication required/i);
  });
});

describe('gymStats aggregation', () => {
  it('reports current and previous window counts, scoped to the gym and flash/send', async () => {
    const stats = await socialGymInsightsQueries.gymStats({}, { input: { gymUuid: publicGym.uuid } }, authCtx(OWNER));

    expect(stats.periodDays).toBe(7);
    // Current: 3 flash/send ascents by OWNER, ADMIN, EDITOR. The attempt and the
    // other-gym board tick are excluded.
    expect(stats.current.ascentCount).toBe(3);
    expect(stats.current.uniqueClimbers).toBe(3);
    // Previous: 2 ascents by OWNER + MEMBER (the 20-days-ago tick is out of range).
    expect(stats.previous.ascentCount).toBe(2);
    expect(stats.previous.uniqueClimbers).toBe(2);
  });

  it('ranks top climbs by ascents with resolved name and consensus grade', async () => {
    const stats = await socialGymInsightsQueries.gymStats({}, { input: { gymUuid: publicGym.uuid } }, authCtx(OWNER));

    expect(stats.topClimbs.length).toBe(2);
    const [top, second] = stats.topClimbs;
    expect(top.climbUuid).toBe(CLIMB_X);
    expect(top.ascentCount).toBe(2);
    expect(top.name).toBe('Crimpy Traverse');
    expect(top.gradeName).toBe('V4');
    expect(top.angle).toBe(40);

    expect(second.climbUuid).toBe(CLIMB_Y);
    expect(second.ascentCount).toBe(1);
    // CLIMB_Y has no stats row → grade falls back to null (safe degradation).
    expect(second.gradeName).toBeNull();
  });

  it('buckets busiest days so they sum to the current ascent count', async () => {
    const stats = await socialGymInsightsQueries.gymStats({}, { input: { gymUuid: publicGym.uuid } }, authCtx(OWNER));

    const total = stats.busiestDays.reduce((sum, day) => sum + day.ascentCount, 0);
    expect(total).toBe(stats.current.ascentCount);
    for (const day of stats.busiestDays) {
      expect(day.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(day.dayOfWeek).toBeLessThanOrEqual(6);
    }
  });

  it('honours the month period (30-day window)', async () => {
    const stats = await socialGymInsightsQueries.gymStats(
      {},
      { input: { gymUuid: publicGym.uuid, period: 'month' } },
      authCtx(OWNER),
    );
    expect(stats.periodDays).toBe(30);
    // The 30-day current window now also captures the two prior-week ticks and
    // the 20-days-ago tick: 3 + 2 + 1 = 6 flash/send ascents on gym boards.
    expect(stats.current.ascentCount).toBe(6);
  });
});

describe('gymStats empty gym', () => {
  it('returns zeros and empty lists for a gym with no boards', async () => {
    const emptyGym = await insertGym({ ownerId: OWNER, name: 'Empty Gym', slug: 'empty-gym' });
    const stats = await socialGymInsightsQueries.gymStats({}, { input: { gymUuid: emptyGym.uuid } }, authCtx(OWNER));
    expect(stats.current).toEqual({ uniqueClimbers: 0, ascentCount: 0 });
    expect(stats.previous).toEqual({ uniqueClimbers: 0, ascentCount: 0 });
    expect(stats.topClimbs).toEqual([]);
    expect(stats.busiestDays).toEqual([]);
  });
});
