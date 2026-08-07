import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { IncomingMessage } from 'node:http';
import { db } from '../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { logger } from '../utils/logger';

export const MOONBOARD_2024_LAYOUT_ID = 3;
export const PRIVATE_ATTEMPT_CLIMB_PROVIDER = 'boardsesh_public_graphql_search_climbs';
export const MAX_PRIVATE_ATTEMPT_BYTES = 1024 * 1024 * 1024;
export const MAX_PRIVATE_ATTEMPT_DURATION_MS = 60 * 60 * 1000;
export const MOONBOARD_2024_ANGLES = new Set([25, 40]);

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;
const ORPHAN_GRACE_MS = 60 * 60 * 1000;
const ASSET_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:webm|mp4)$/i;

const MIME_EXTENSIONS = new Map<string, 'webm' | 'mp4'>([
  ['video/webm', 'webm'],
  ['video/mp4', 'mp4'],
]);
const uploadLocks = new Map<string, Promise<void>>();

async function withUploadLock<T>(videoUuid: string, work: () => Promise<T>): Promise<T> {
  const previous = uploadLocks.get(videoUuid) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  uploadLocks.set(videoUuid, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (uploadLocks.get(videoUuid) === current) uploadLocks.delete(videoUuid);
  }
}

export class PrivateAttemptVideoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly uploadOffset?: number,
  ) {
    super(message);
    this.name = 'PrivateAttemptVideoError';
  }
}

export type CreatePrivateAttemptUploadInput = {
  clientRecordingId: string;
  climbUuid: string;
  layoutId: number;
  angle: number;
  isMirror: boolean;
  boardId?: number | null;
  sessionId?: string | null;
  mimeType: string;
  recordedAt: string;
};

function baseMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0].trim().toLowerCase();
}

export function isSupportedAttemptMimeType(mimeType: string): boolean {
  return MIME_EXTENSIONS.has(baseMimeType(mimeType));
}

export function getPrivateAttemptVideoRoot(): string {
  const configured = process.env.BOARDSESH_ATTEMPT_VIDEO_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), '.boardsesh', 'private-attempt-videos'));
}

export function privateAttemptAssetPath(assetKey: string, temporary = false): string {
  if (!ASSET_KEY_PATTERN.test(assetKey)) {
    throw new PrivateAttemptVideoError('INVALID_ASSET_KEY', 'Invalid private attempt asset key', 400);
  }
  const root = getPrivateAttemptVideoRoot();
  const fileName = temporary ? `${assetKey}.part` : assetKey;
  const resolved = path.resolve(root, fileName);
  if (path.dirname(resolved) !== root) {
    throw new PrivateAttemptVideoError('INVALID_ASSET_KEY', 'Invalid private attempt asset key', 400);
  }
  return resolved;
}

export async function ensurePrivateAttemptVideoRoot(): Promise<void> {
  await mkdir(getPrivateAttemptVideoRoot(), { recursive: true, mode: 0o700 });
}

function assertSameUpload(
  existing: typeof dbSchema.privateAttemptVideos.$inferSelect,
  input: CreatePrivateAttemptUploadInput,
): void {
  const comparableRecordedAt = (value: string): string => {
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?/.exec(value);
    return match ? `${match[1]}T${match[2]}.${(match[3] ?? '').padEnd(3, '0').slice(0, 3)}` : value;
  };
  if (
    existing.climbUuid !== input.climbUuid ||
    existing.layoutId !== input.layoutId ||
    existing.angle !== input.angle ||
    existing.isMirror !== input.isMirror ||
    existing.mimeType !== baseMimeType(input.mimeType) ||
    comparableRecordedAt(existing.recordedAt) !== comparableRecordedAt(new Date(input.recordedAt).toISOString())
  ) {
    throw new PrivateAttemptVideoError(
      'CLIENT_RECORDING_CONFLICT',
      'This recording identifier is already attached to different metadata',
      409,
    );
  }
}

async function resolveBoardId(boardId: number | null | undefined): Promise<number | null> {
  if (boardId == null) return null;
  const [board] = await db
    .select({
      id: dbSchema.userBoards.id,
      boardType: dbSchema.userBoards.boardType,
      layoutId: dbSchema.userBoards.layoutId,
    })
    .from(dbSchema.userBoards)
    .where(and(eq(dbSchema.userBoards.id, boardId), isNull(dbSchema.userBoards.deletedAt)))
    .limit(1);
  if (!board || board.boardType !== 'moonboard' || board.layoutId !== MOONBOARD_2024_LAYOUT_ID) {
    throw new PrivateAttemptVideoError('BOARD_MISMATCH', 'The active board is not a MoonBoard 2024', 400);
  }
  return board.id;
}

async function resolveSessionId(sessionId: string | null | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const [session] = await db
    .select({ id: dbSchema.boardSessions.id })
    .from(dbSchema.boardSessions)
    .where(eq(dbSchema.boardSessions.id, sessionId))
    .limit(1);
  return session?.id ?? null;
}

export async function createPrivateAttemptUpload(
  ownerUserId: string,
  input: CreatePrivateAttemptUploadInput,
): Promise<typeof dbSchema.privateAttemptVideos.$inferSelect> {
  if (input.layoutId !== MOONBOARD_2024_LAYOUT_ID) {
    throw new PrivateAttemptVideoError(
      'UNSUPPORTED_BOARD',
      'Private recording is available only for MoonBoard 2024',
      400,
    );
  }
  if (!MOONBOARD_2024_ANGLES.has(input.angle)) {
    throw new PrivateAttemptVideoError(
      'UNSUPPORTED_ANGLE',
      'MoonBoard 2024 recordings require a 25 or 40 degree angle',
      400,
    );
  }
  if (!isSupportedAttemptMimeType(input.mimeType)) {
    throw new PrivateAttemptVideoError('UNSUPPORTED_MIME_TYPE', 'This browser video format is not supported', 415);
  }

  const [existing] = await db
    .select()
    .from(dbSchema.privateAttemptVideos)
    .where(
      and(
        eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
        eq(dbSchema.privateAttemptVideos.clientRecordingId, input.clientRecordingId),
      ),
    )
    .limit(1);
  if (existing) {
    assertSameUpload(existing, input);
    return existing;
  }

  const [climb] = await db
    .select({ uuid: dbSchema.boardClimbs.uuid })
    .from(dbSchema.boardClimbs)
    .where(
      and(
        eq(dbSchema.boardClimbs.boardType, 'moonboard'),
        eq(dbSchema.boardClimbs.uuid, input.climbUuid),
        eq(dbSchema.boardClimbs.layoutId, MOONBOARD_2024_LAYOUT_ID),
      ),
    )
    .limit(1);
  if (!climb) {
    throw new PrivateAttemptVideoError('CLIMB_NOT_FOUND', 'The active MoonBoard 2024 climb was not found', 404);
  }

  await ensurePrivateAttemptVideoRoot();
  const extension = MIME_EXTENSIONS.get(baseMimeType(input.mimeType));
  if (!extension) {
    throw new PrivateAttemptVideoError('UNSUPPORTED_MIME_TYPE', 'This browser video format is not supported', 415);
  }
  const now = new Date().toISOString();
  const uuid = randomUUID();
  const assetKey = `${randomUUID()}.${extension}`;
  const [boardId, sessionId] = await Promise.all([resolveBoardId(input.boardId), resolveSessionId(input.sessionId)]);

  const [created] = await db
    .insert(dbSchema.privateAttemptVideos)
    .values({
      uuid,
      ownerUserId,
      boardType: 'moonboard',
      climbProvider: PRIVATE_ATTEMPT_CLIMB_PROVIDER,
      climbUuid: climb.uuid,
      layoutId: MOONBOARD_2024_LAYOUT_ID,
      angle: input.angle,
      isMirror: input.isMirror,
      boardId,
      sessionId,
      assetKey,
      mimeType: baseMimeType(input.mimeType),
      byteSize: 0,
      durationMs: null,
      status: 'uploading',
      recordedAt: new Date(input.recordedAt).toISOString(),
      createdAt: now,
      updatedAt: now,
      clientRecordingId: input.clientRecordingId,
    })
    .onConflictDoNothing({
      target: [dbSchema.privateAttemptVideos.ownerUserId, dbSchema.privateAttemptVideos.clientRecordingId],
    })
    .returning();

  if (created) return created;
  const [raced] = await db
    .select()
    .from(dbSchema.privateAttemptVideos)
    .where(
      and(
        eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
        eq(dbSchema.privateAttemptVideos.clientRecordingId, input.clientRecordingId),
      ),
    )
    .limit(1);
  if (!raced) {
    throw new PrivateAttemptVideoError('UPLOAD_INIT_FAILED', 'Could not initialize the recording upload', 500);
  }
  assertSameUpload(raced, input);
  return raced;
}

export async function getPrivateAttemptVideoForOwner(ownerUserId: string, videoUuid: string) {
  const [video] = await db
    .select()
    .from(dbSchema.privateAttemptVideos)
    .where(
      and(
        eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
        eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  return video ?? null;
}

export async function getPrivateAttemptUploadOffset(
  video: typeof dbSchema.privateAttemptVideos.$inferSelect,
): Promise<number> {
  if (video.status === 'ready') return video.byteSize;
  if (video.status !== 'uploading' && video.status !== 'finalizing') return video.byteSize;

  const candidates = [privateAttemptAssetPath(video.assetKey, true)];
  if (video.status === 'finalizing') candidates.push(privateAttemptAssetPath(video.assetKey));
  for (const candidate of candidates) {
    try {
      return (await stat(candidate)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return 0;
}

async function appendPrivateAttemptChunkUnlocked(
  ownerUserId: string,
  videoUuid: string,
  expectedOffset: number,
  req: IncomingMessage,
): Promise<number> {
  const video = await getPrivateAttemptVideoForOwner(ownerUserId, videoUuid);
  if (!video) throw new PrivateAttemptVideoError('NOT_FOUND', 'Recording not found', 404);
  if (video.status !== 'uploading') {
    throw new PrivateAttemptVideoError('UPLOAD_FINALIZED', 'This recording is no longer accepting video data', 409);
  }

  await ensurePrivateAttemptVideoRoot();
  const temporaryPath = privateAttemptAssetPath(video.assetKey, true);
  let currentSize = 0;
  try {
    currentSize = (await stat(temporaryPath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (currentSize !== expectedOffset) {
    throw new PrivateAttemptVideoError('OFFSET_MISMATCH', `Upload offset is ${currentSize}`, 409, currentSize);
  }

  const contentLength = Number(req.headers['content-length'] ?? 0);
  if (!Number.isFinite(contentLength) || contentLength < 0 || currentSize + contentLength > MAX_PRIVATE_ATTEMPT_BYTES) {
    throw new PrivateAttemptVideoError('RECORDING_TOO_LARGE', 'The recording is too large', 413);
  }

  const bytesWritten = await new Promise<number>((resolve, reject) => {
    const destination = createWriteStream(temporaryPath, { flags: 'a', mode: 0o600 });
    let received = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      destination.destroy();
      reject(error);
    };
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (currentSize + received > MAX_PRIVATE_ATTEMPT_BYTES) {
        fail(new PrivateAttemptVideoError('RECORDING_TOO_LARGE', 'The recording is too large', 413));
      }
    });
    req.on('aborted', () => fail(new PrivateAttemptVideoError('UPLOAD_INTERRUPTED', 'Upload interrupted', 499)));
    req.on('error', fail);
    destination.on('error', fail);
    destination.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve(received);
    });
    req.pipe(destination);
  });

  const newSize = currentSize + bytesWritten;
  await db
    .update(dbSchema.privateAttemptVideos)
    .set({ byteSize: newSize, updatedAt: new Date().toISOString(), failureCode: null })
    .where(
      and(
        eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
        eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
      ),
    );
  return newSize;
}

export async function appendPrivateAttemptChunk(
  ownerUserId: string,
  videoUuid: string,
  expectedOffset: number,
  req: IncomingMessage,
): Promise<number> {
  return withUploadLock(videoUuid, () =>
    appendPrivateAttemptChunkUnlocked(ownerUserId, videoUuid, expectedOffset, req),
  );
}

async function syncAndFinalizeAsset(assetKey: string): Promise<number> {
  const temporaryPath = privateAttemptAssetPath(assetKey, true);
  const readyPath = privateAttemptAssetPath(assetKey);
  try {
    const readyStat = await stat(readyPath);
    return readyStat.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const temporaryHandle = await open(temporaryPath, 'r+');
  try {
    await temporaryHandle.sync();
  } finally {
    await temporaryHandle.close();
  }
  try {
    await rename(temporaryPath, readyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return (await stat(readyPath)).size;
  }
  const directoryHandle = await open(getPrivateAttemptVideoRoot(), 'r');
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
  return (await stat(readyPath)).size;
}

export async function finalizePrivateAttemptVideo(
  ownerUserId: string,
  videoUuid: string,
  durationMs: number,
): Promise<typeof dbSchema.privateAttemptVideos.$inferSelect> {
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > MAX_PRIVATE_ATTEMPT_DURATION_MS) {
    throw new PrivateAttemptVideoError('INVALID_DURATION', 'Recording duration is invalid', 400);
  }
  const existing = await getPrivateAttemptVideoForOwner(ownerUserId, videoUuid);
  if (!existing) throw new PrivateAttemptVideoError('NOT_FOUND', 'Recording not found', 404);
  if (existing.status === 'ready') return existing;
  if (existing.status === 'deleting') {
    throw new PrivateAttemptVideoError('RECORDING_DELETING', 'This recording is being deleted', 409);
  }
  if (existing.status === 'failed') {
    throw new PrivateAttemptVideoError('FINALIZE_FAILED', 'This recording could not be finalized', 409);
  }

  if (existing.status === 'uploading') {
    await db
      .update(dbSchema.privateAttemptVideos)
      .set({ status: 'finalizing', failureCode: null, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
          eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
          eq(dbSchema.privateAttemptVideos.status, 'uploading'),
        ),
      );
  }

  let byteSize: number;
  try {
    byteSize = await syncAndFinalizeAsset(existing.assetKey);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const failedRows = await db
      .update(dbSchema.privateAttemptVideos)
      .set({
        status: 'failed',
        failureCode: code === 'ENOSPC' ? 'DISK_FULL' : 'FINALIZE_FAILED',
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
          eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
          eq(dbSchema.privateAttemptVideos.status, 'finalizing'),
        ),
      )
      .returning({ uuid: dbSchema.privateAttemptVideos.uuid });
    if (failedRows.length === 0) {
      const raced = await getPrivateAttemptVideoForOwner(ownerUserId, videoUuid);
      if (raced?.status === 'ready') return raced;
    }
    if (code === 'ENOENT') {
      throw new PrivateAttemptVideoError('EMPTY_RECORDING', 'No recorded video data was received', 400);
    }
    if (code === 'ENOSPC') {
      throw new PrivateAttemptVideoError('DISK_FULL', 'The local recording disk is full', 507);
    }
    throw error;
  }
  if (byteSize <= 0) {
    await markPrivateAttemptUploadFailed(videoUuid, 'EMPTY_RECORDING');
    throw new PrivateAttemptVideoError('EMPTY_RECORDING', 'No recorded video data was received', 400);
  }

  const result = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(dbSchema.privateAttemptVideos)
      .where(
        and(
          eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
          eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
        ),
      )
      .for('update')
      .limit(1);
    if (!locked) throw new PrivateAttemptVideoError('NOT_FOUND', 'Recording not found', 404);
    if (locked.status === 'ready') return { video: locked, createdTick: false };
    if (locked.status !== 'finalizing') {
      throw new PrivateAttemptVideoError(
        locked.status === 'deleting' ? 'RECORDING_DELETING' : 'FINALIZE_FAILED',
        locked.status === 'deleting' ? 'This recording is being deleted' : 'This recording could not be finalized',
        409,
      );
    }

    const tickUuid = randomUUID();
    const now = new Date().toISOString();
    await tx.insert(dbSchema.boardseshTicks).values({
      uuid: tickUuid,
      userId: ownerUserId,
      boardType: locked.boardType,
      climbUuid: locked.climbUuid,
      angle: locked.angle,
      isMirror: locked.isMirror,
      status: 'attempt',
      attemptCount: 1,
      quality: null,
      difficulty: null,
      isBenchmark: false,
      comment: '',
      climbedAt: locked.recordedAt,
      createdAt: now,
      updatedAt: now,
      sessionId: locked.sessionId,
      boardId: locked.boardId,
    });
    if (locked.sessionId) {
      await tx
        .update(dbSchema.boardSessions)
        .set({ lastActivity: new Date() })
        .where(eq(dbSchema.boardSessions.id, locked.sessionId));
    }
    const [ready] = await tx
      .update(dbSchema.privateAttemptVideos)
      .set({
        tickUuid,
        byteSize,
        durationMs,
        status: 'ready',
        failureCode: null,
        updatedAt: now,
      })
      .where(eq(dbSchema.privateAttemptVideos.uuid, videoUuid))
      .returning();
    if (!ready) throw new PrivateAttemptVideoError('FINALIZE_FAILED', 'Could not finalize the recording', 500);
    return { video: ready, createdTick: true };
  });

  if (result.createdTick) {
    const publishers: Promise<void>[] = [
      import('../graphql/resolvers/ticks/debounced-climb-stats-publisher').then(({ queueClimbStatsRecompute }) => {
        queueClimbStatsRecompute(result.video.boardType, result.video.climbUuid, result.video.angle);
      }),
    ];
    if (result.video.sessionId) {
      publishers.push(
        import('../graphql/resolvers/sessions/debounced-stats-publisher').then(({ publishDebouncedSessionStats }) => {
          publishDebouncedSessionStats(result.video.sessionId!);
        }),
      );
    }
    if (result.video.boardId != null) {
      publishers.push(
        import('../graphql/resolvers/board-presence/stats').then(({ queueBoardStatsPublish }) => {
          queueBoardStatsPublish(result.video.boardId!, result.video.boardType);
        }),
      );
    }
    const publisherResults = await Promise.allSettled(publishers);
    for (const publisherResult of publisherResults) {
      if (publisherResult.status === 'rejected') {
        logger.error('[PrivateAttemptVideos] Failed to enqueue post-finalize stats refresh', publisherResult.reason);
      }
    }
  }

  return result.video;
}

async function removeAssetFiles(assetKey: string): Promise<void> {
  await Promise.all([
    unlink(privateAttemptAssetPath(assetKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    }),
    unlink(privateAttemptAssetPath(assetKey, true)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    }),
  ]);
}

export async function deletePrivateAttemptVideo(ownerUserId: string, videoUuid: string): Promise<boolean> {
  const deletion = await db.transaction(async (tx) => {
    const [video] = await tx
      .select({ assetKey: dbSchema.privateAttemptVideos.assetKey, status: dbSchema.privateAttemptVideos.status })
      .from(dbSchema.privateAttemptVideos)
      .where(
        and(
          eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
          eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
        ),
      )
      .for('update')
      .limit(1);
    if (!video) return null;
    if (video.status !== 'deleting') {
      await tx
        .update(dbSchema.privateAttemptVideos)
        .set({ status: 'deleting', updatedAt: new Date().toISOString() })
        .where(eq(dbSchema.privateAttemptVideos.uuid, videoUuid));
    }
    return video.assetKey;
  });
  if (!deletion) return false;

  await removeAssetFiles(deletion);
  await db
    .delete(dbSchema.privateAttemptVideos)
    .where(
      and(
        eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
        eq(dbSchema.privateAttemptVideos.ownerUserId, ownerUserId),
        eq(dbSchema.privateAttemptVideos.status, 'deleting'),
      ),
    );
  return true;
}

export async function cleanupPrivateAttemptVideoStorage(): Promise<void> {
  await ensurePrivateAttemptVideoRoot();
  const staleBefore = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const staleRows = await db
    .delete(dbSchema.privateAttemptVideos)
    .where(
      and(
        inArray(dbSchema.privateAttemptVideos.status, ['uploading', 'finalizing', 'failed', 'deleting']),
        lt(dbSchema.privateAttemptVideos.updatedAt, staleBefore),
      ),
    )
    .returning({ assetKey: dbSchema.privateAttemptVideos.assetKey });
  await Promise.all(staleRows.map((row) => removeAssetFiles(row.assetKey)));

  const knownRows = await db
    .select({ assetKey: dbSchema.privateAttemptVideos.assetKey })
    .from(dbSchema.privateAttemptVideos);
  const knownAssetKeys = new Set(knownRows.map((row) => row.assetKey));
  const root = getPrivateAttemptVideoRoot();
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const assetKey = entry.name.endsWith('.part') ? entry.name.slice(0, -'.part'.length) : entry.name;
      if (!ASSET_KEY_PATTERN.test(assetKey) || knownAssetKeys.has(assetKey)) return;
      const candidatePath = path.join(root, entry.name);
      const candidateStat = await stat(candidatePath);
      if (candidateStat.mtimeMs > Date.now() - ORPHAN_GRACE_MS) return;
      await unlink(candidatePath);
    }),
  );

  if (staleRows.length > 0) {
    logger.info(`[PrivateAttemptVideos] Removed ${staleRows.length} stale upload record(s)`);
  }
}

export async function markPrivateAttemptUploadFailed(videoUuid: string, code: string): Promise<void> {
  await db
    .update(dbSchema.privateAttemptVideos)
    .set({ status: 'failed', failureCode: code, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(dbSchema.privateAttemptVideos.uuid, videoUuid),
        inArray(dbSchema.privateAttemptVideos.status, ['uploading', 'finalizing', 'failed']),
      ),
    );
}
