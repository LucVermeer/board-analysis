import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { db } from '../db/client';
import { socialBoardQueries, socialBoardMutations } from '../graphql/resolvers/social/boards';
import { socialGymQueries, socialGymMutations } from '../graphql/resolvers/social/gyms';

/**
 * Real-DB coverage for the moderator board/gym editing authorization
 * (issue: let community admins & leaders fix outdated catalog boards/gyms).
 *
 * The board/gym/role records that need fixing are owned by a system/import user,
 * so the authorization under test is: owner OR community admin/leader scoped to
 * the board type OR the linked gym's owner/admin may edit; a wrong-board-type
 * leader and a plain user may not. enrichBoard/enrichGym must surface the same
 * decision as `canEdit`.
 *
 * Mirrors session-feed-board-scope-integration.test.ts: inserts via raw SQL,
 * calls the resolvers directly against the per-worker test DB.
 */

const SYS_OWNER = 'bg-auth-sys-owner';
const GLOBAL_ADMIN = 'bg-auth-global-admin';
const KILTER_LEADER = 'bg-auth-kilter-leader';
const MOON_LEADER = 'bg-auth-moon-leader';
const GLOBAL_LEADER = 'bg-auth-global-leader';
const PLAIN_USER = 'bg-auth-plain-user';
const GYM_ADMIN_MEMBER = 'bg-auth-gym-admin';
const CLIMBER = 'bg-auth-climber';

const ALL_USERS = [SYS_OWNER, GLOBAL_ADMIN, KILTER_LEADER, MOON_LEADER, GLOBAL_LEADER, PLAIN_USER, GYM_ADMIN_MEMBER];

const authCtx = (userId: string): ConnectionContext =>
  ({ connectionId: `conn-${userId}`, isAuthenticated: true, userId }) as ConnectionContext;

const anonCtx = (): ConnectionContext => ({ connectionId: 'conn-anon', isAuthenticated: false }) as ConnectionContext;

const insertUser = (id: string) =>
  db.execute(sql`
    INSERT INTO "users" (id, email, name, created_at, updated_at)
    VALUES (${id}, ${id + '@test.com'}, ${'User ' + id}, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);

const insertRole = (userId: string, role: string, boardType: string | null) =>
  db.execute(sql`
    INSERT INTO community_roles (user_id, role, board_type, created_at)
    VALUES (${userId}, ${role}, ${boardType}, now())
  `);

const insertGym = async (uuid: string, ownerId: string, name: string): Promise<number> => {
  const result = await db.execute(sql`
    INSERT INTO gyms (uuid, name, slug, owner_id, is_public, created_at, updated_at)
    VALUES (${uuid}, ${name}, ${uuid}, ${ownerId}, true, now(), now())
    RETURNING id
  `);
  return Number(Array.from(result as Iterable<{ id: number }>)[0].id);
};

const insertBoard = async (opts: {
  uuid: string;
  ownerId: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  gymId?: number | null;
  boardType?: string;
  name?: string;
}): Promise<number> => {
  const { uuid, ownerId, layoutId, sizeId, setIds, gymId = null, boardType = 'kilter', name = 'Board' } = opts;
  const result = await db.execute(sql`
    INSERT INTO user_boards
      (uuid, slug, owner_id, board_type, layout_id, size_id, set_ids, name, gym_id, is_public, created_at, updated_at)
    VALUES (${uuid}, ${uuid}, ${ownerId}, ${boardType}, ${layoutId}, ${sizeId}, ${setIds}, ${name}, ${gymId}, true, now(), now())
    RETURNING id
  `);
  return Number(Array.from(result as Iterable<{ id: number }>)[0].id);
};

const insertTick = (uuid: string, boardId: number, status: 'send' | 'flash' | 'attempt') =>
  db.execute(sql`
    INSERT INTO boardsesh_ticks
      (uuid, user_id, board_type, board_id, climb_uuid, angle, status, attempt_count, difficulty, climbed_at)
    VALUES (${uuid}, ${CLIMBER}, 'kilter', ${boardId}, 'bg-auth-climb', 40, ${status}, 1, 20, now())
  `);

type TickRow = {
  uuid: string;
  board_id: number;
  status: string;
  climb_uuid: string;
  angle: number;
  difficulty: number | null;
};

const ticksForBoard = async (boardId: number): Promise<TickRow[]> => {
  const result = await db.execute(sql`
    SELECT uuid, board_id, status, climb_uuid, angle, difficulty
    FROM boardsesh_ticks
    WHERE board_id = ${boardId}
    ORDER BY uuid
  `);
  return Array.from(result as Iterable<TickRow>).map((row) => ({
    uuid: row.uuid,
    board_id: Number(row.board_id),
    status: row.status,
    climb_uuid: row.climb_uuid,
    angle: Number(row.angle),
    difficulty: row.difficulty == null ? null : Number(row.difficulty),
  }));
};

const boardConfig = async (uuid: string) => {
  const result = await db.execute(sql`
    SELECT layout_id, size_id, set_ids, name FROM user_boards WHERE uuid = ${uuid}
  `);
  const row = Array.from(result as Iterable<{ layout_id: number; size_id: number; set_ids: string; name: string }>)[0];
  return { layoutId: Number(row.layout_id), sizeId: Number(row.size_id), setIds: row.set_ids, name: row.name };
};

let kilterGymUuid: string;
let kilterGymId: number;
let kilterBoardUuid: string;
let kilterBoardId: number;

beforeEach(async () => {
  // Reset only the tables this suite owns; CASCADE clears their FK dependents.
  // `users` is left intact and re-seeded idempotently to avoid a wide cascade.
  await db.execute(sql`
    TRUNCATE TABLE
      "community_roles", "gym_members", "gym_follows", "board_follows",
      "boardsesh_ticks", "user_boards", "gyms"
    RESTART IDENTITY CASCADE
  `);

  await Promise.all(ALL_USERS.map(insertUser));

  await Promise.all([
    insertRole(GLOBAL_ADMIN, 'admin', null),
    insertRole(KILTER_LEADER, 'community_leader', 'kilter'),
    insertRole(MOON_LEADER, 'community_leader', 'moonboard'),
    insertRole(GLOBAL_LEADER, 'community_leader', null),
  ]);

  kilterGymUuid = uuidv4();
  kilterGymId = await insertGym(kilterGymUuid, SYS_OWNER, 'Bonsist');

  kilterBoardUuid = uuidv4();
  kilterBoardId = await insertBoard({
    uuid: kilterBoardUuid,
    ownerId: SYS_OWNER,
    layoutId: 1,
    sizeId: 10,
    setIds: '1,2',
    gymId: kilterGymId,
    name: 'Bonsist Wall',
  });

  // A gym admin member (not the owner) — exercises the linked-gym edit path.
  await db.execute(sql`
    INSERT INTO gym_members (gym_id, user_id, role, created_at)
    VALUES (${kilterGymId}, ${GYM_ADMIN_MEMBER}, 'admin', now())
  `);
});

describe('updateBoard authorization for community moderators', () => {
  it('lets a global community admin update a board they do not own', async () => {
    const result = await socialBoardMutations.updateBoard(
      null,
      { input: { boardUuid: kilterBoardUuid, name: 'Bonsist 2019 Masters' } },
      authCtx(GLOBAL_ADMIN),
    );

    expect(result.name).toBe('Bonsist 2019 Masters');
    expect(result.ownerId).toBe(SYS_OWNER);
    expect((await boardConfig(kilterBoardUuid)).name).toBe('Bonsist 2019 Masters');
  });

  it('lets a board-type-scoped community_leader update a board they do not own', async () => {
    const result = await socialBoardMutations.updateBoard(
      null,
      { input: { boardUuid: kilterBoardUuid, angle: 40 } },
      authCtx(KILTER_LEADER),
    );

    expect(result.angle).toBe(40);
    expect(result.ownerId).toBe(SYS_OWNER);
  });

  it('lets the linked gym owner/admin member update the gym board', async () => {
    const result = await socialBoardMutations.updateBoard(
      null,
      { input: { boardUuid: kilterBoardUuid, name: 'Gym-admin edit' } },
      authCtx(GYM_ADMIN_MEMBER),
    );

    expect(result.name).toBe('Gym-admin edit');
  });

  it('rejects a community_leader scoped to the WRONG board type', async () => {
    await expect(
      socialBoardMutations.updateBoard(
        null,
        { input: { boardUuid: kilterBoardUuid, name: 'should fail' } },
        authCtx(MOON_LEADER),
      ),
    ).rejects.toThrow(/Not authorized to update this board/);

    // The board is untouched.
    expect((await boardConfig(kilterBoardUuid)).name).toBe('Bonsist Wall');
  });

  it('allows a GLOBAL community_leader (boardType null) on a kilter board', async () => {
    const result = await socialBoardMutations.updateBoard(
      null,
      { input: { boardUuid: kilterBoardUuid, name: 'Global leader edit' } },
      authCtx(GLOBAL_LEADER),
    );

    expect(result.name).toBe('Global leader edit');
  });

  it('rejects a logged-in user with no role and no ownership', async () => {
    await expect(
      socialBoardMutations.updateBoard(
        null,
        { input: { boardUuid: kilterBoardUuid, name: 'nope' } },
        authCtx(PLAIN_USER),
      ),
    ).rejects.toThrow(/Not authorized to update this board/);

    expect((await boardConfig(kilterBoardUuid)).name).toBe('Bonsist Wall');
  });
});

describe('updateBoard config change with existing ticks', () => {
  it('changes layout/size/set with ticks present and leaves the tick rows untouched', async () => {
    await Promise.all([
      insertTick('bg-auth-tick-1', kilterBoardId, 'send'),
      insertTick('bg-auth-tick-2', kilterBoardId, 'flash'),
      insertTick('bg-auth-tick-3', kilterBoardId, 'attempt'),
    ]);

    const before = await ticksForBoard(kilterBoardId);
    expect(before).toHaveLength(3);

    const result = await socialBoardMutations.updateBoard(
      null,
      { input: { boardUuid: kilterBoardUuid, layoutId: 2, sizeId: 11, setIds: '3,4' } },
      authCtx(GLOBAL_ADMIN),
    );

    // Config reflects the physical reconfiguration.
    expect(result.layoutId).toBe(2);
    expect(result.sizeId).toBe(11);
    expect(result.setIds).toBe('3,4');
    expect(await boardConfig(kilterBoardUuid)).toMatchObject({ layoutId: 2, sizeId: 11, setIds: '3,4' });

    // Old ticks are preserved verbatim — not deleted, moved, or re-pointed.
    const after = await ticksForBoard(kilterBoardId);
    expect(after).toHaveLength(3);
    expect(after).toEqual(before);
  });
});

describe('updateBoard duplicate-config uniqueness keys off the board owner', () => {
  it('blocks a config change that collides with another board owned by the BOARD OWNER', async () => {
    // The board's owner (SYS_OWNER) already has a second board with this config.
    await insertBoard({
      uuid: uuidv4(),
      ownerId: SYS_OWNER,
      layoutId: 2,
      sizeId: 11,
      setIds: '3,4',
      name: 'Owner second board',
    });

    await expect(
      socialBoardMutations.updateBoard(
        null,
        { input: { boardUuid: kilterBoardUuid, layoutId: 2, sizeId: 11, setIds: '3,4' } },
        authCtx(GLOBAL_ADMIN),
      ),
    ).rejects.toThrow(/already have a board with this configuration/);
  });

  it('does NOT block when only the editing admin owns a board with the target config', async () => {
    // The admin (caller) owns a board with the target config, but the board's
    // owner (SYS_OWNER) does not. Keying the check off the owner means the edit
    // must succeed — a caller-keyed check would have wrongly blocked it.
    await insertBoard({
      uuid: uuidv4(),
      ownerId: GLOBAL_ADMIN,
      layoutId: 9,
      sizeId: 9,
      setIds: '9,9',
      name: "Admin's own board",
    });

    const result = await socialBoardMutations.updateBoard(
      null,
      { input: { boardUuid: kilterBoardUuid, layoutId: 9, sizeId: 9, setIds: '9,9' } },
      authCtx(GLOBAL_ADMIN),
    );

    expect(result.layoutId).toBe(9);
    expect(result.sizeId).toBe(9);
    expect(result.setIds).toBe('9,9');
  });
});

describe('updateGym authorization for community moderators', () => {
  it('lets a global community admin update a gym they do not own', async () => {
    const result = await socialGymMutations.updateGym(
      null,
      { input: { gymUuid: kilterGymUuid, name: 'Bonsist (fixed)' } },
      authCtx(GLOBAL_ADMIN),
    );

    expect(result.name).toBe('Bonsist (fixed)');
    expect(result.ownerId).toBe(SYS_OWNER);
  });

  it('lets a board-type-scoped community_leader update a gym whose boards match', async () => {
    const result = await socialGymMutations.updateGym(
      null,
      { input: { gymUuid: kilterGymUuid, description: 'All holds, no neutral screw-ons' } },
      authCtx(KILTER_LEADER),
    );

    expect(result.description).toBe('All holds, no neutral screw-ons');
  });

  it('lets a GLOBAL community_leader (boardType null) update the gym', async () => {
    const result = await socialGymMutations.updateGym(
      null,
      { input: { gymUuid: kilterGymUuid, name: 'Global leader gym edit' } },
      authCtx(GLOBAL_LEADER),
    );

    expect(result.name).toBe('Global leader gym edit');
  });

  it('rejects a community_leader scoped to a board type the gym does not have', async () => {
    await expect(
      socialGymMutations.updateGym(
        null,
        { input: { gymUuid: kilterGymUuid, name: 'should fail' } },
        authCtx(MOON_LEADER),
      ),
    ).rejects.toThrow(/Not authorized: must be gym owner or admin/);
  });

  it('rejects a logged-in user with no role and no ownership', async () => {
    await expect(
      socialGymMutations.updateGym(null, { input: { gymUuid: kilterGymUuid, name: 'nope' } }, authCtx(PLAIN_USER)),
    ).rejects.toThrow(/Not authorized: must be gym owner or admin/);
  });
});

describe('enrichBoard canEdit', () => {
  const canEditBoard = async (ctx: ConnectionContext): Promise<boolean> => {
    const board = await socialBoardQueries.board(null, { boardUuid: kilterBoardUuid }, ctx);
    expect(board).not.toBeNull();
    return board!.canEdit;
  };

  it('is true for the owner', async () => {
    expect(await canEditBoard(authCtx(SYS_OWNER))).toBe(true);
  });

  it('is true for a matching-board-type community_leader and a global admin', async () => {
    expect(await canEditBoard(authCtx(KILTER_LEADER))).toBe(true);
    expect(await canEditBoard(authCtx(GLOBAL_ADMIN))).toBe(true);
  });

  it('is true for the linked gym admin member', async () => {
    expect(await canEditBoard(authCtx(GYM_ADMIN_MEMBER))).toBe(true);
  });

  it('is false for a wrong-board-type community_leader', async () => {
    expect(await canEditBoard(authCtx(MOON_LEADER))).toBe(false);
  });

  it('is false for a plain logged-in user', async () => {
    expect(await canEditBoard(authCtx(PLAIN_USER))).toBe(false);
  });

  it('is false for an anonymous viewer', async () => {
    expect(await canEditBoard(anonCtx())).toBe(false);
  });
});

describe('enrichGym canEdit', () => {
  const canEditGym = async (ctx: ConnectionContext): Promise<boolean> => {
    const gym = await socialGymQueries.gym(null, { gymUuid: kilterGymUuid }, ctx);
    expect(gym).not.toBeNull();
    return gym!.canEdit;
  };

  it('is true for the owner', async () => {
    expect(await canEditGym(authCtx(SYS_OWNER))).toBe(true);
  });

  it('is true for a matching-board-type community_leader and a global admin', async () => {
    expect(await canEditGym(authCtx(KILTER_LEADER))).toBe(true);
    expect(await canEditGym(authCtx(GLOBAL_ADMIN))).toBe(true);
  });

  it('is true for a gym admin member', async () => {
    expect(await canEditGym(authCtx(GYM_ADMIN_MEMBER))).toBe(true);
  });

  it('is false for a wrong-board-type community_leader', async () => {
    expect(await canEditGym(authCtx(MOON_LEADER))).toBe(false);
  });

  it('is false for a plain logged-in user', async () => {
    expect(await canEditGym(authCtx(PLAIN_USER))).toBe(false);
  });

  it('is false for an anonymous viewer', async () => {
    expect(await canEditGym(anonCtx())).toBe(false);
  });
});
