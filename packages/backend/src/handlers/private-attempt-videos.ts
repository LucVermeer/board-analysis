import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { applyCorsHeaders } from './cors';
import { readJsonBody, sendJson } from './http-utils';
import { authenticateSessionRequest } from './session-auth';
import {
  appendPrivateAttemptChunk,
  createPrivateAttemptUpload,
  deletePrivateAttemptVideo,
  finalizePrivateAttemptVideo,
  getPrivateAttemptVideoForOwner,
  getPrivateAttemptUploadOffset,
  markPrivateAttemptUploadFailed,
  privateAttemptAssetPath,
  PrivateAttemptVideoError,
} from '../services/private-attempt-videos';
import { logger } from '../utils/logger';

const JSON_BODY_LIMIT = 16 * 1024;
const VIDEO_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateUploadSchema = z.object({
  clientRecordingId: z.uuid(),
  climbUuid: z.string().min(1).max(100),
  layoutId: z.literal(3),
  angle: z.number().int().min(0).max(90),
  isMirror: z.boolean(),
  boardId: z.number().int().positive().nullable().optional(),
  sessionId: z.string().min(1).max(100).nullable().optional(),
  mimeType: z.string().min(1).max(200),
  recordedAt: z.iso.datetime(),
});

const FinalizeUploadSchema = z.object({
  durationMs: z.number().int().min(0),
});

type PrivateAttemptVideoRow =
  Awaited<ReturnType<typeof getPrivateAttemptVideoForOwner>> extends infer Row ? NonNullable<Row> : never;

export function serializePrivateAttemptVideo(video: PrivateAttemptVideoRow) {
  return {
    uuid: video.uuid,
    tickUuid: video.tickUuid,
    boardType: video.boardType,
    climbProvider: video.climbProvider,
    climbUuid: video.climbUuid,
    layoutId: video.layoutId,
    angle: video.angle,
    isMirror: video.isMirror,
    boardId: video.boardId,
    sessionId: video.sessionId,
    mimeType: video.mimeType,
    byteSize: video.byteSize,
    durationMs: video.durationMs,
    status: video.status,
    failureCode: video.failureCode,
    recordedAt: video.recordedAt,
    createdAt: video.createdAt,
    clientRecordingId: video.clientRecordingId,
  };
}

async function parseJson(req: IncomingMessage): Promise<unknown> {
  const rawBody = await readJsonBody(req, JSON_BODY_LIMIT);
  return JSON.parse(rawBody);
}

function sendServiceError(res: ServerResponse, error: unknown): void {
  if (error instanceof PrivateAttemptVideoError) {
    sendJson(
      res,
      error.status,
      {
        error: error.message,
        code: error.code,
        ...(error.uploadOffset != null ? { uploadOffset: error.uploadOffset } : {}),
      },
      error.uploadOffset != null ? { 'Upload-Offset': String(error.uploadOffset) } : undefined,
    );
    return;
  }
  if (error instanceof z.ZodError) {
    sendJson(res, 400, { error: 'Invalid recording metadata', code: 'INVALID_INPUT', issues: error.issues });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'INVALID_JSON' });
    return;
  }
  const errorCode = (error as NodeJS.ErrnoException).code;
  if (errorCode === 'ENOSPC') {
    sendJson(res, 507, { error: 'The local recording disk is full', code: 'DISK_FULL' });
    return;
  }
  logger.error('[PrivateAttemptVideos] Request failed', error);
  sendJson(res, 500, { error: 'Could not process the recording', code: 'INTERNAL_ERROR' });
}

async function authenticate(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
  const auth = await authenticateSessionRequest(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error, code: 'UNAUTHORIZED' });
    return null;
  }
  return auth.userId;
}

export async function handlePrivateAttemptVideoCollection(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;
  const ownerUserId = await authenticate(req, res);
  if (!ownerUserId) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    const input = CreateUploadSchema.parse(await parseJson(req));
    const video = await createPrivateAttemptUpload(ownerUserId, input);
    const uploadOffset = await getPrivateAttemptUploadOffset(video);
    sendJson(res, video.status === 'uploading' && uploadOffset === 0 ? 201 : 200, {
      video: serializePrivateAttemptVideo(video),
      uploadOffset,
    });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export async function handlePrivateAttemptVideoItem(
  req: IncomingMessage,
  res: ServerResponse,
  videoUuid: string,
  action: string | null,
): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;
  if (!VIDEO_UUID_PATTERN.test(videoUuid)) {
    sendJson(res, 404, { error: 'Recording not found', code: 'NOT_FOUND' });
    return;
  }
  const ownerUserId = await authenticate(req, res);
  if (!ownerUserId) return;

  try {
    if (action === 'chunks' && req.method === 'PATCH') {
      const rawOffset = Array.isArray(req.headers['upload-offset'])
        ? req.headers['upload-offset'][0]
        : req.headers['upload-offset'];
      const expectedOffset = Number(rawOffset);
      if (!Number.isSafeInteger(expectedOffset) || expectedOffset < 0) {
        throw new PrivateAttemptVideoError('INVALID_OFFSET', 'Upload-Offset must be a non-negative integer', 400);
      }
      try {
        const uploadOffset = await appendPrivateAttemptChunk(ownerUserId, videoUuid, expectedOffset, req);
        sendJson(res, 200, { uploadOffset }, { 'Upload-Offset': String(uploadOffset) });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
          await markPrivateAttemptUploadFailed(videoUuid, 'DISK_FULL');
        }
        throw error;
      }
      return;
    }

    if (action === 'finalize' && req.method === 'POST') {
      const input = FinalizeUploadSchema.parse(await parseJson(req));
      const video = await finalizePrivateAttemptVideo(ownerUserId, videoUuid, input.durationMs);
      sendJson(res, 200, { video: serializePrivateAttemptVideo(video) });
      return;
    }

    if (action === 'stream' && (req.method === 'GET' || req.method === 'HEAD')) {
      await streamPrivateAttemptVideo(req, res, ownerUserId, videoUuid);
      return;
    }

    if (action === null && req.method === 'GET') {
      const video = await getPrivateAttemptVideoForOwner(ownerUserId, videoUuid);
      if (!video) throw new PrivateAttemptVideoError('NOT_FOUND', 'Recording not found', 404);
      const uploadOffset = await getPrivateAttemptUploadOffset(video);
      sendJson(res, 200, { video: serializePrivateAttemptVideo(video), uploadOffset });
      return;
    }

    if (action === null && req.method === 'DELETE') {
      const deleted = await deletePrivateAttemptVideo(ownerUserId, videoUuid);
      if (!deleted) throw new PrivateAttemptVideoError('NOT_FOUND', 'Recording not found', 404);
      sendJson(res, 200, { deleted: true });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export function parsePrivateAttemptByteRange(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) throw new PrivateAttemptVideoError('INVALID_RANGE', 'Invalid byte range', 416);
  const [, startText, endText] = match;
  let start: number;
  let end: number;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new PrivateAttemptVideoError('INVALID_RANGE', 'Invalid byte range', 416);
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    throw new PrivateAttemptVideoError('INVALID_RANGE', 'Invalid byte range', 416);
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function streamPrivateAttemptVideo(
  req: IncomingMessage,
  res: ServerResponse,
  ownerUserId: string,
  videoUuid: string,
): Promise<void> {
  const video = await getPrivateAttemptVideoForOwner(ownerUserId, videoUuid);
  if (!video || video.status !== 'ready' || !video.tickUuid) {
    throw new PrivateAttemptVideoError('NOT_FOUND', 'Recording not found', 404);
  }
  const filePath = privateAttemptAssetPath(video.assetKey);
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PrivateAttemptVideoError('NOT_FOUND', 'Recording not found', 404);
    }
    throw error;
  }
  let range: { start: number; end: number } | null;
  try {
    range = parsePrivateAttemptByteRange(
      Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range,
      fileStat.size,
    );
  } catch (error) {
    if (error instanceof PrivateAttemptVideoError && error.status === 416) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileStat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
      });
      res.end();
      return;
    }
    throw error;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, fileStat.size - 1);
  const contentLength = fileStat.size === 0 ? 0 : end - start + 1;
  const status = range ? 206 : 200;
  res.writeHead(status, {
    'Content-Type': video.mimeType,
    'Content-Length': String(contentLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${fileStat.size}` } : {}),
  });
  if (req.method === 'HEAD' || contentLength === 0) {
    res.end();
    return;
  }
  const stream = createReadStream(filePath, { start, end });
  stream.on('error', (error) => {
    logger.warn('[PrivateAttemptVideos] Playback stream failed:', error);
    res.destroy(error);
  });
  stream.pipe(res);
}
