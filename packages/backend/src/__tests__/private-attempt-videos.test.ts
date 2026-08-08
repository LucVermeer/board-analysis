import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { and, count, eq } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';
import * as dbSchema from '@boardsesh/db/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { db } from '../db/client';
import { privateAttemptVideoQueries } from '../graphql/resolvers/private-attempt-videos/queries';
import { parsePrivateAttemptByteRange, streamPrivateAttemptVideo } from '../handlers/private-attempt-videos';
import {
  appendPrivateAttemptChunk,
  createPrivateAttemptUpload,
  deletePrivateAttemptVideo,
  finalizePrivateAttemptVideo,
  getPrivateAttemptVideoForOwner,
  getPrivateAttemptUploadOffset,
  privateAttemptAssetPath,
  type CreatePrivateAttemptUploadInput,
} from '../services/private-attempt-videos';

vi.mock('../graphql/resolvers/ticks/debounced-climb-stats-publisher', () => ({
  queueClimbStatsRecompute: vi.fn(),
}));

const OWNER_ID = 'user-123';
const OTHER_USER_ID = 'private-attempt-other-user';
const CLIMB_UUID = 'mb2024-private-attempt-climb';
const VIDEO_BYTES = Buffer.from('0123456789');

let storageRoot = '';

function authContext(userId: string): ConnectionContext {
  return { connectionId: `private-attempt-${userId}`, isAuthenticated: true, userId } as ConnectionContext;
}

function chunkRequest(bytes: Buffer): IncomingMessage {
  const request = Readable.from([bytes]) as unknown as IncomingMessage;
  Object.assign(request, { headers: { 'content-length': String(bytes.length) } });
  return request;
}

class CapturingResponse extends Writable {
  status = 0;
  responseHeaders: OutgoingHttpHeaders = {};
  chunks: Buffer[] = [];

  writeHead(status: number, headers: OutgoingHttpHeaders): this {
    this.status = status;
    this.responseHeaders = headers;
    return this;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

function input(overrides: Partial<CreatePrivateAttemptUploadInput> = {}): CreatePrivateAttemptUploadInput {
  return {
    clientRecordingId: randomUUID(),
    climbUuid: CLIMB_UUID,
    layoutId: 3,
    angle: 40,
    isMirror: true,
    mimeType: 'video/webm;codecs=vp8',
    recordedAt: '2026-08-08T10:15:30.000Z',
    ...overrides,
  };
}

async function uploadAndFinalize(ownerUserId = OWNER_ID, overrides: Partial<CreatePrivateAttemptUploadInput> = {}) {
  const upload = await createPrivateAttemptUpload(ownerUserId, input(overrides));
  await appendPrivateAttemptChunk(ownerUserId, upload.uuid, 0, chunkRequest(VIDEO_BYTES));
  const ready = await finalizePrivateAttemptVideo(ownerUserId, upload.uuid, 12_345);
  return ready;
}

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'boardsesh-private-attempt-'));
  process.env.BOARDSESH_ATTEMPT_VIDEO_DIR = storageRoot;
  await db
    .insert(dbSchema.users)
    .values({
      id: OTHER_USER_ID,
      email: `${OTHER_USER_ID}@test.invalid`,
      name: 'Other User',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .insert(dbSchema.boardClimbs)
    .values({ uuid: CLIMB_UUID, boardType: 'moonboard', layoutId: 3, name: 'Exact Test Climb' })
    .onConflictDoNothing();
});

afterEach(async () => {
  await db.delete(dbSchema.privateAttemptVideos).where(eq(dbSchema.privateAttemptVideos.climbUuid, CLIMB_UUID));
  await db.delete(dbSchema.boardseshTicks).where(eq(dbSchema.boardseshTicks.climbUuid, CLIMB_UUID));
  await db.delete(dbSchema.boardClimbs).where(eq(dbSchema.boardClimbs.uuid, CLIMB_UUID));
  await db.delete(dbSchema.users).where(eq(dbSchema.users.id, OTHER_USER_ID));
  await rm(storageRoot, { force: true, recursive: true });
  delete process.env.BOARDSESH_ATTEMPT_VIDEO_DIR;
});

describe('private attempt video lifecycle', () => {
  it('finalizes one exact MB2024 attempt idempotently and serves owner-only ranges', async () => {
    const createInput = input();
    const upload = await createPrivateAttemptUpload(OWNER_ID, createInput);
    const repeatedInit = await createPrivateAttemptUpload(OWNER_ID, createInput);
    expect(repeatedInit.uuid).toBe(upload.uuid);

    await writeFile(privateAttemptAssetPath(upload.assetKey, true), VIDEO_BYTES.subarray(0, 4));
    expect(await getPrivateAttemptUploadOffset(upload)).toBe(4);
    await appendPrivateAttemptChunk(OWNER_ID, upload.uuid, 4, chunkRequest(VIDEO_BYTES.subarray(4)));
    const [first, retry] = await Promise.all([
      finalizePrivateAttemptVideo(OWNER_ID, upload.uuid, 12_345),
      finalizePrivateAttemptVideo(OWNER_ID, upload.uuid, 12_345),
    ]);

    expect(first.status).toBe('ready');
    expect(retry.tickUuid).toBe(first.tickUuid);
    expect(first).toMatchObject({
      ownerUserId: OWNER_ID,
      boardType: 'moonboard',
      climbProvider: 'boardsesh_public_graphql_search_climbs',
      climbUuid: CLIMB_UUID,
      layoutId: 3,
      angle: 40,
      isMirror: true,
      byteSize: VIDEO_BYTES.length,
      durationMs: 12_345,
    });

    const [tickCount] = await db
      .select({ value: count() })
      .from(dbSchema.boardseshTicks)
      .where(and(eq(dbSchema.boardseshTicks.userId, OWNER_ID), eq(dbSchema.boardseshTicks.climbUuid, CLIMB_UUID)));
    expect(tickCount.value).toBe(1);
    const [betaCount] = await db
      .select({ value: count() })
      .from(dbSchema.boardBetaLinks)
      .where(
        and(eq(dbSchema.boardBetaLinks.boardType, 'moonboard'), eq(dbSchema.boardBetaLinks.climbUuid, CLIMB_UUID)),
      );
    expect(betaCount.value).toBe(0);
    const [tick] = await db
      .select()
      .from(dbSchema.boardseshTicks)
      .where(eq(dbSchema.boardseshTicks.uuid, first.tickUuid!));
    expect(tick).toMatchObject({
      userId: OWNER_ID,
      boardType: 'moonboard',
      climbUuid: CLIMB_UUID,
      angle: 40,
      isMirror: true,
      status: 'attempt',
      attemptCount: 1,
      origin: 'native',
    });

    const ownerList = await privateAttemptVideoQueries.privateAttemptVideos(
      null,
      { climbUuid: CLIMB_UUID, layoutId: 3, angle: 40 },
      authContext(OWNER_ID),
    );
    const otherList = await privateAttemptVideoQueries.privateAttemptVideos(
      null,
      { climbUuid: CLIMB_UUID, layoutId: 3, angle: 40 },
      authContext(OTHER_USER_ID),
    );
    expect(ownerList).toHaveLength(1);
    expect(ownerList[0]).not.toHaveProperty('assetKey');
    expect(ownerList[0]?.playbackPath).toContain(first.uuid);
    expect(otherList).toEqual([]);

    const request = { method: 'GET', headers: { range: 'bytes=2-5' } } as IncomingMessage;
    const response = new CapturingResponse();
    await streamPrivateAttemptVideo(request, response as unknown as ServerResponse, OWNER_ID, first.uuid);
    await finished(response);
    expect(response.status).toBe(206);
    expect(response.responseHeaders['Content-Range']).toBe('bytes 2-5/10');
    expect(Buffer.concat(response.chunks).toString()).toBe('2345');
    expect(parsePrivateAttemptByteRange('bytes=-3', VIDEO_BYTES.length)).toEqual({ start: 7, end: 9 });
  });

  it('does not create ticks for failed or cancelled recordings', async () => {
    const failed = await createPrivateAttemptUpload(OWNER_ID, input());
    await expect(finalizePrivateAttemptVideo(OWNER_ID, failed.uuid, 500)).rejects.toMatchObject({
      code: 'EMPTY_RECORDING',
    });

    const cancelled = await createPrivateAttemptUpload(OWNER_ID, input());
    expect(await deletePrivateAttemptVideo(OWNER_ID, cancelled.uuid)).toBe(true);

    const [tickCount] = await db
      .select({ value: count() })
      .from(dbSchema.boardseshTicks)
      .where(eq(dbSchema.boardseshTicks.climbUuid, CLIMB_UUID));
    expect(tickCount.value).toBe(0);
  });

  it('denies another user and deletes only the asset while retaining the tick', async () => {
    const ready = await uploadAndFinalize();
    const assetPath = privateAttemptAssetPath(ready.assetKey);
    expect((await stat(assetPath)).size).toBe(VIDEO_BYTES.length);

    expect(await getPrivateAttemptVideoForOwner(OTHER_USER_ID, ready.uuid)).toBeNull();
    expect(await deletePrivateAttemptVideo(OTHER_USER_ID, ready.uuid)).toBe(false);
    await expect(
      streamPrivateAttemptVideo(
        { method: 'GET', headers: {} } as IncomingMessage,
        new CapturingResponse() as unknown as ServerResponse,
        OTHER_USER_ID,
        ready.uuid,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(await deletePrivateAttemptVideo(OWNER_ID, ready.uuid)).toBe(true);
    await expect(stat(assetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await getPrivateAttemptVideoForOwner(OWNER_ID, ready.uuid)).toBeNull();
    const [tick] = await db
      .select({ uuid: dbSchema.boardseshTicks.uuid })
      .from(dbSchema.boardseshTicks)
      .where(eq(dbSchema.boardseshTicks.uuid, ready.tickUuid!));
    expect(tick?.uuid).toBe(ready.tickUuid);
  });
});
