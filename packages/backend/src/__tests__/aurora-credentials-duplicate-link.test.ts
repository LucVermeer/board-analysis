import { describe, it, expect, beforeEach, vi } from 'vite-plus/test';
import { and, eq, sql } from 'drizzle-orm';

// Encryption secret for encrypt()/decrypt() used inside the save services.
process.env.AURORA_CREDENTIALS_SECRET = process.env.AURORA_CREDENTIALS_SECRET ?? 'test-aurora-secret';

// saveAuroraCredential calls AuroraClimbingClient.signIn (network). Stub it so
// the upstream user_id is deterministic; the duplicate-link guard is exercised
// against the real per-worker test DB. saveKilterCredential does no network I/O.
const signInMock = vi.fn();

vi.mock('@boardsesh/aurora-sync/api', () => ({
  AuroraClimbingClient: class {
    signIn = signInMock;
  },
  isAuroraRequestError: () => false,
}));

import { db } from '../db/client';
import { auroraCredentials, userBoardMappings } from '@boardsesh/db/schema';
import { DuplicateBoardLinkError, saveAuroraCredential, saveKilterCredential } from '../services/aurora-credentials';

const USER_A = 'dup-link-user-a';
const USER_B = 'dup-link-user-b';
const TENSION_UPSTREAM_ID = 987654;
const KILTER_SUB = 'dup-link-kilter-sub-uuid';

async function insertUser(id: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO "users" (id, email, name, created_at, updated_at)
    VALUES (${id}, ${id + '@test.com'}, ${'User ' + id}, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function clearFixtures(): Promise<void> {
  await db.execute(sql`DELETE FROM "aurora_credentials" WHERE "user_id" IN (${USER_A}, ${USER_B})`);
  await db.execute(sql`DELETE FROM "user_board_mappings" WHERE "user_id" IN (${USER_A}, ${USER_B})`);
  await db.execute(sql`DELETE FROM "users" WHERE "id" IN (${USER_A}, ${USER_B})`);
}

function auroraRows(userId: string, boardType: string) {
  return db
    .select()
    .from(auroraCredentials)
    .where(and(eq(auroraCredentials.userId, userId), eq(auroraCredentials.boardType, boardType)));
}

function mappingRows(userId: string, boardType: string) {
  return db
    .select()
    .from(userBoardMappings)
    .where(and(eq(userBoardMappings.userId, userId), eq(userBoardMappings.boardType, boardType)));
}

describe('duplicate upstream account link guard', () => {
  beforeEach(async () => {
    signInMock.mockReset();
    signInMock.mockResolvedValue({ token: 'aurora-token', user_id: TENSION_UPSTREAM_ID });
    await clearFixtures();
    await insertUser(USER_A);
    await insertUser(USER_B);
  });

  describe('Aurora (saveAuroraCredential)', () => {
    it('rejects a second user linking the same upstream account and writes nothing', async () => {
      await saveAuroraCredential({ userId: USER_A, boardType: 'tension', username: 'climber-a', password: 'pw' });

      const error = await saveAuroraCredential({
        userId: USER_B,
        boardType: 'tension',
        username: 'climber-b',
        password: 'pw',
      }).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(DuplicateBoardLinkError);
      expect((error as DuplicateBoardLinkError).code).toBe('account_already_linked');

      expect(await auroraRows(USER_B, 'tension')).toHaveLength(0);
      expect(await mappingRows(USER_B, 'tension')).toHaveLength(0);
      // User A's claim is untouched.
      expect(await auroraRows(USER_A, 'tension')).toHaveLength(1);
    });

    it('allows the same user to re-link their own account (update path)', async () => {
      await saveAuroraCredential({ userId: USER_A, boardType: 'tension', username: 'climber-a', password: 'pw1' });

      await expect(
        saveAuroraCredential({ userId: USER_A, boardType: 'tension', username: 'climber-a', password: 'pw2' }),
      ).resolves.toMatchObject({ boardType: 'tension', auroraUserId: TENSION_UPSTREAM_ID });

      expect(await auroraRows(USER_A, 'tension')).toHaveLength(1);
    });

    it('does not block a new owner when the prior claim is expired', async () => {
      await saveAuroraCredential({ userId: USER_A, boardType: 'tension', username: 'climber-a', password: 'pw' });
      await db
        .update(auroraCredentials)
        .set({ syncStatus: 'expired' })
        .where(and(eq(auroraCredentials.userId, USER_A), eq(auroraCredentials.boardType, 'tension')));

      await expect(
        saveAuroraCredential({ userId: USER_B, boardType: 'tension', username: 'climber-b', password: 'pw' }),
      ).resolves.toMatchObject({ auroraUserId: TENSION_UPSTREAM_ID });

      expect(await mappingRows(USER_B, 'tension')).toHaveLength(1);
    });
  });

  describe('Kilter (saveKilterCredential)', () => {
    it('rejects a second user linking the same Kilter sub and writes nothing', async () => {
      await saveKilterCredential({
        userId: USER_A,
        refreshToken: 'refresh-a',
        kilterUserId: KILTER_SUB,
        username: 'a',
      });

      const error = await saveKilterCredential({
        userId: USER_B,
        refreshToken: 'refresh-b',
        kilterUserId: KILTER_SUB,
        username: 'b',
      }).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(DuplicateBoardLinkError);
      expect((error as DuplicateBoardLinkError).code).toBe('account_already_linked');

      expect(await mappingRows(USER_B, 'kilter')).toHaveLength(0);
      expect(await auroraRows(USER_B, 'kilter')).toHaveLength(0);
    });

    it('allows the same user to re-link their own Kilter account (update path)', async () => {
      await saveKilterCredential({ userId: USER_A, refreshToken: 'refresh-1', kilterUserId: KILTER_SUB });

      await expect(
        saveKilterCredential({ userId: USER_A, refreshToken: 'refresh-2', kilterUserId: KILTER_SUB }),
      ).resolves.toBeUndefined();

      expect(await mappingRows(USER_A, 'kilter')).toHaveLength(1);
    });

    it('does not block a new owner when the prior Kilter claim is expired', async () => {
      await saveKilterCredential({ userId: USER_A, refreshToken: 'refresh-1', kilterUserId: KILTER_SUB });
      await db
        .update(auroraCredentials)
        .set({ syncStatus: 'expired' })
        .where(and(eq(auroraCredentials.userId, USER_A), eq(auroraCredentials.boardType, 'kilter')));

      await expect(
        saveKilterCredential({ userId: USER_B, refreshToken: 'refresh-2', kilterUserId: KILTER_SUB }),
      ).resolves.toBeUndefined();

      expect(await mappingRows(USER_B, 'kilter')).toHaveLength(1);
    });
  });
});
