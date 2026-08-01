import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { sql } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import { playlists } from '@boardsesh/db/schema/app';
import { db } from '../db/client';
import { playlistMutations } from '../graphql/resolvers/playlists/mutations';
import { playlistQueries } from '../graphql/resolvers/playlists/queries';

const FIXTURE_RUN_ID = crypto.randomUUID();
const PLAYLIST_UUID = `issue-4016-${FIXTURE_RUN_ID}`;
const SEEDED_CLIMB_UUID = `4016-seed-${FIXTURE_RUN_ID}`;
const ADDED_CLIMB_UUID = `4016-add-${FIXTURE_RUN_ID}`;
const OWNER_ID = `issue-4016-owner-${FIXTURE_RUN_ID}`;
const EDITOR_ID = `issue-4016-editor-${FIXTURE_RUN_ID}`;
const VIEWER_ID = `issue-4016-viewer-${FIXTURE_RUN_ID}`;
const UNRELATED_ID = `issue-4016-unrelated-${FIXTURE_RUN_ID}`;

function makeCtx(userId: string): ConnectionContext {
  return {
    connectionId: `issue-4016-${userId}`,
    isAuthenticated: true,
    userId,
  };
}

async function ownedLibrary(userId: string) {
  return playlistQueries.allUserPlaylists(null, { input: {} }, makeCtx(userId));
}

async function expectExactAuthorizationError(operation: () => Promise<unknown>, expectedMessage: string) {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(expectedMessage);
    return;
  }

  throw new Error(`Expected authorization error: ${expectedMessage}`);
}

describe('playlist ownership role matrix — real Postgres (#4016)', () => {
  beforeAll(async () => {
    await db.execute(sql`
      INSERT INTO users (id, email, name)
      VALUES
        (${OWNER_ID}, ${`${OWNER_ID}@test.invalid`}, 'Playlist owner'),
        (${EDITOR_ID}, ${`${EDITOR_ID}@test.invalid`}, 'Playlist editor'),
        (${VIEWER_ID}, ${`${VIEWER_ID}@test.invalid`}, 'Playlist viewer'),
        (${UNRELATED_ID}, ${`${UNRELATED_ID}@test.invalid`}, 'Unrelated user')
      ON CONFLICT (id) DO NOTHING
    `);

    await db.execute(sql`
      INSERT INTO board_climbs (uuid, board_type, layout_id, setter_username, name, description, frames, is_listed)
      VALUES
        (${SEEDED_CLIMB_UUID}, 'kilter', 1, 'setter', 'Role matrix climb', '', 'p1r1', true),
        (${ADDED_CLIMB_UUID}, 'kilter', 1, 'setter', 'Role matrix added climb', '', 'p1r2', true)
      ON CONFLICT (uuid) DO NOTHING
    `);

    const [playlist] = await db
      .insert(playlists)
      .values({
        uuid: PLAYLIST_UUID,
        boardType: 'kilter',
        layoutId: 1,
        name: 'Role matrix playlist',
        isPublic: false,
      })
      .onConflictDoNothing()
      .returning({ id: playlists.id });

    if (!playlist) {
      throw new Error(`Fixture playlist ${PLAYLIST_UUID} already exists`);
    }

    await db.execute(sql`
      INSERT INTO playlist_ownership (playlist_id, user_id, role)
      VALUES
        (${playlist.id}, ${OWNER_ID}, 'owner'),
        (${playlist.id}, ${EDITOR_ID}, 'editor'),
        (${playlist.id}, ${VIEWER_ID}, 'viewer')
    `);
    await db.execute(sql`
      INSERT INTO playlist_climbs (playlist_id, climb_uuid, angle, position)
      VALUES (${playlist.id}, ${SEEDED_CLIMB_UUID}, 40, 0)
    `);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM playlists WHERE uuid = ${PLAYLIST_UUID}`);
    await db.execute(sql`DELETE FROM board_climbs WHERE uuid IN (${SEEDED_CLIMB_UUID}, ${ADDED_CLIMB_UUID})`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER_ID}, ${EDITOR_ID}, ${VIEWER_ID}, ${UNRELATED_ID})`);
  });

  it('shows only the owner in libraries and edit-picker memberships', async () => {
    const ownerLibrary = await ownedLibrary(OWNER_ID);
    const editorLibrary = await ownedLibrary(EDITOR_ID);
    const viewerLibrary = await ownedLibrary(VIEWER_ID);

    expect(ownerLibrary.totalCount).toBe(1);
    expect(ownerLibrary.playlists).toHaveLength(1);
    expect(ownerLibrary.playlists[0]).toMatchObject({ uuid: PLAYLIST_UUID, userRole: 'owner' });
    expect(editorLibrary).toMatchObject({ totalCount: 0, playlists: [] });
    expect(viewerLibrary).toMatchObject({ totalCount: 0, playlists: [] });

    const scopedOwnerLibrary = (await playlistQueries.userPlaylists(
      null,
      { input: { boardType: 'kilter', layoutId: 1 } },
      makeCtx(OWNER_ID),
    )) as Array<{ uuid: string }>;
    const scopedEditorLibrary = (await playlistQueries.userPlaylists(
      null,
      { input: { boardType: 'kilter', layoutId: 1 } },
      makeCtx(EDITOR_ID),
    )) as Array<{ uuid: string }>;
    const scopedViewerLibrary = (await playlistQueries.userPlaylists(
      null,
      { input: { boardType: 'kilter', layoutId: 1 } },
      makeCtx(VIEWER_ID),
    )) as Array<{ uuid: string }>;

    expect(scopedOwnerLibrary.map((playlist) => playlist.uuid)).toEqual([PLAYLIST_UUID]);
    expect(scopedEditorLibrary).toEqual([]);
    expect(scopedViewerLibrary).toEqual([]);

    for (const [userId, expectedMemberships] of [
      [OWNER_ID, [PLAYLIST_UUID]],
      [EDITOR_ID, []],
      [VIEWER_ID, []],
    ] as const) {
      await expect(
        playlistQueries.playlistsForClimb(
          null,
          { input: { boardType: 'kilter', layoutId: 1, climbUuid: SEEDED_CLIMB_UUID } },
          makeCtx(userId),
        ),
      ).resolves.toEqual(expectedMemberships);

      await expect(
        playlistQueries.playlistsForClimbs(
          null,
          { input: { boardType: 'kilter', layoutId: 1, climbUuids: [SEEDED_CLIMB_UUID] } },
          makeCtx(userId),
        ),
      ).resolves.toEqual(
        expectedMemberships.length > 0 ? [{ climbUuid: SEEDED_CLIMB_UUID, playlistUuids: [PLAYLIST_UUID] }] : [],
      );
    }
  });

  it.each([
    ['editor', EDITOR_ID],
    ['viewer', VIEWER_ID],
  ])('keeps private playlist and climb reads for the %s role', async (expectedRole, userId) => {
    await expect(playlistQueries.playlist(null, { playlistId: PLAYLIST_UUID }, makeCtx(userId))).resolves.toMatchObject(
      {
        uuid: PLAYLIST_UUID,
        userRole: expectedRole,
      },
    );

    const result = await playlistQueries.playlistClimbs(
      null,
      { input: { playlistId: PLAYLIST_UUID } },
      makeCtx(userId),
    );
    expect(result.totalCount).toBe(1);
    expect(result.climbs.map((climb) => climb.uuid)).toEqual([SEEDED_CLIMB_UUID]);
  });

  it('allows only the owner to update playlist metadata', async () => {
    const ownerUpdatedName = 'Owner-updated role matrix playlist';

    await expect(
      playlistMutations.updatePlaylist(
        null,
        { input: { playlistId: PLAYLIST_UUID, name: ownerUpdatedName } },
        makeCtx(OWNER_ID),
      ),
    ).resolves.toMatchObject({ uuid: PLAYLIST_UUID, name: ownerUpdatedName, userRole: 'owner' });

    for (const [role, userId] of [
      ['editor', EDITOR_ID],
      ['viewer', VIEWER_ID],
      ['unrelated', UNRELATED_ID],
    ] as const) {
      await expectExactAuthorizationError(
        () =>
          playlistMutations.updatePlaylist(
            null,
            { input: { playlistId: PLAYLIST_UUID, name: `${role} must not update this playlist` } },
            makeCtx(userId),
          ),
        'Playlist not found or you do not have permission to edit it',
      );
    }

    const [playlistRow] = await db.execute(sql`
      SELECT name FROM playlists WHERE uuid = ${PLAYLIST_UUID}
    `);
    expect((playlistRow as { name: string }).name).toBe(ownerUpdatedName);
  });

  it.each([
    ['editor', EDITOR_ID],
    ['viewer', VIEWER_ID],
    ['unrelated', UNRELATED_ID],
  ])('denies all playlist-content and library-order writes to the %s caller', async (_callerKind, userId) => {
    const context = makeCtx(userId);
    const deniedWrites = [
      {
        operation: () =>
          playlistMutations.addClimbToPlaylist(
            null,
            { input: { playlistId: PLAYLIST_UUID, climbUuid: ADDED_CLIMB_UUID, angle: 90 } },
            context,
          ),
        expectedMessage: 'Playlist not found or you do not have permission to edit it',
      },
      {
        operation: () =>
          playlistMutations.removeClimbFromPlaylist(
            null,
            { input: { playlistId: PLAYLIST_UUID, climbUuid: SEEDED_CLIMB_UUID } },
            context,
          ),
        expectedMessage: 'Playlist not found or you do not have permission to edit it',
      },
      {
        operation: () =>
          playlistMutations.reorderPlaylistClimb(
            null,
            { input: { playlistId: PLAYLIST_UUID, climbUuid: SEEDED_CLIMB_UUID, newIndex: 0 } },
            context,
          ),
        expectedMessage: 'Playlist not found or you do not have permission to edit it',
      },
      {
        operation: () => playlistMutations.updatePlaylistLastAccessed(null, { playlistId: PLAYLIST_UUID }, context),
        expectedMessage: 'Playlist not found or access denied',
      },
    ];

    for (const { operation, expectedMessage } of deniedWrites) {
      await expectExactAuthorizationError(operation, expectedMessage);
    }
  });

  it('allows the owner to perform all four writes', async () => {
    const context = makeCtx(OWNER_ID);

    await expect(
      playlistMutations.addClimbToPlaylist(
        null,
        { input: { playlistId: PLAYLIST_UUID, climbUuid: ADDED_CLIMB_UUID, angle: 90 } },
        context,
      ),
    ).resolves.toMatchObject({ climbUuid: ADDED_CLIMB_UUID, angle: 90 });
    await expect(
      playlistMutations.reorderPlaylistClimb(
        null,
        { input: { playlistId: PLAYLIST_UUID, climbUuid: ADDED_CLIMB_UUID, newIndex: 0 } },
        context,
      ),
    ).resolves.toBe(true);
    await expect(
      playlistMutations.updatePlaylistLastAccessed(null, { playlistId: PLAYLIST_UUID }, context),
    ).resolves.toBe(true);
    await expect(
      playlistMutations.removeClimbFromPlaylist(
        null,
        { input: { playlistId: PLAYLIST_UUID, climbUuid: ADDED_CLIMB_UUID } },
        context,
      ),
    ).resolves.toBe(true);

    const [playlistRow] = await db.execute(sql`
      SELECT last_accessed_at FROM playlists WHERE uuid = ${PLAYLIST_UUID}
    `);
    const addedRows = await db.execute(sql`
      SELECT id FROM playlist_climbs
      WHERE playlist_id = (SELECT id FROM playlists WHERE uuid = ${PLAYLIST_UUID})
        AND climb_uuid = ${ADDED_CLIMB_UUID}
    `);
    expect((playlistRow as { last_accessed_at: unknown }).last_accessed_at).not.toBeNull();
    expect(Array.from(addedRows)).toHaveLength(0);
  });
});
