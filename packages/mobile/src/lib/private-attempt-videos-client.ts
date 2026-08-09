import { File, FileMode, Paths, UploadType } from 'expo-file-system';
import type { VideoSource } from 'expo-video';
import { BACKEND_URL } from './env';
import { getAuthToken } from './auth-store';
import { authenticatedFetch, ensureFreshToken } from './auth-interceptor';

export type PrivateAttemptUploadStatus = 'uploading' | 'finalizing' | 'ready' | 'failed' | 'deleting';

export type PrivateAttemptUpload = {
  uuid: string;
  tickUuid: string | null;
  status: PrivateAttemptUploadStatus;
  byteSize: number;
  durationMs: number | null;
  failureCode: string | null;
};

export type CreatePrivateAttemptUploadInput = {
  clientRecordingId: string;
  climbUuid: string;
  layoutId: 3;
  angle: number;
  isMirror: boolean;
  boardId: number | null;
  sessionId: string | null;
  mimeType: string;
  recordedAt: string;
};

export class PrivateAttemptApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly uploadOffset?: number,
  ) {
    super(message);
    this.name = 'PrivateAttemptApiError';
  }
}

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_OFFSET_REPAIRS = 3;

export async function protectedPrivateAttemptVideoSource(playbackPath: string): Promise<VideoSource> {
  await ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error('Missing authentication token');
  return {
    uri: `${BACKEND_URL}${playbackPath}`,
    headers: { Authorization: `Bearer ${token}` },
    contentType: 'progressive',
    useCaching: false,
  };
}

function endpoint(path = ''): string {
  return `${BACKEND_URL}/api/private-attempt-videos${path}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    uploadOffset?: number;
  };
  if (!response.ok) {
    throw new PrivateAttemptApiError(
      payload.code ?? (response.status === 404 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_FAILED'),
      payload.error ?? 'Recording request failed',
      response.status,
      payload.uploadOffset,
    );
  }
  return payload as T;
}

function parseUploadResult<T>(body: string, status: number): T {
  let payload: { error?: string; code?: string; uploadOffset?: number } = {};
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    // A non-JSON error response still becomes a structured client error below.
  }
  if (status < 200 || status >= 300) {
    throw new PrivateAttemptApiError(
      payload.code ?? 'REQUEST_FAILED',
      payload.error ?? 'Recording request failed',
      status,
      payload.uploadOffset,
    );
  }
  return payload as T;
}

export async function createPrivateAttemptUpload(input: CreatePrivateAttemptUploadInput) {
  const response = await authenticatedFetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseResponse<{ video: PrivateAttemptUpload; uploadOffset: number }>(response);
}

export async function getPrivateAttemptUpload(videoUuid: string) {
  const response = await authenticatedFetch(endpoint(`/${encodeURIComponent(videoUuid)}`));
  return parseResponse<{ video: PrivateAttemptUpload; uploadOffset: number }>(response);
}

export async function appendPrivateAttemptChunk(
  videoUuid: string,
  uploadOffset: number,
  chunk: Blob,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(endpoint(`/${encodeURIComponent(videoUuid)}/chunks`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Upload-Offset': String(uploadOffset),
    },
    body: chunk,
    signal,
  });
  const payload = await parseResponse<{ uploadOffset: number }>(response);
  return payload.uploadOffset;
}

async function appendPrivateAttemptChunkFile(
  videoUuid: string,
  uploadOffset: number,
  chunk: File,
  signal?: AbortSignal,
): Promise<number> {
  await ensureFreshToken();
  const token = await getAuthToken();
  const result = await chunk.upload(endpoint(`/${encodeURIComponent(videoUuid)}/chunks`), {
    httpMethod: 'PATCH',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: 'application/octet-stream',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/octet-stream',
      'Upload-Offset': String(uploadOffset),
    },
    signal,
  });
  return parseUploadResult<{ uploadOffset: number }>(result.body, result.status).uploadOffset;
}

export async function uploadPrivateAttemptFile(
  videoUuid: string,
  file: File,
  initialOffset: number,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  let offset = initialOffset;
  let repairs = 0;
  const source = file.open(FileMode.ReadOnly);
  const chunk = new File(Paths.cache, `private-attempt-${videoUuid}.chunk`);

  try {
    while (offset < file.size) {
      if (signal?.aborted) {
        throw new PrivateAttemptApiError('UPLOAD_ABORTED', 'Recording upload cancelled', 499);
      }
      const end = Math.min(offset + CHUNK_SIZE, file.size);
      source.offset = offset;
      chunk.create({ overwrite: true });
      chunk.write(source.readBytes(end - offset));
      try {
        offset = await appendPrivateAttemptChunkFile(videoUuid, offset, chunk, signal);
        repairs = 0;
        onProgress?.(offset, file.size);
      } catch (error) {
        if (
          error instanceof PrivateAttemptApiError &&
          error.code === 'OFFSET_MISMATCH' &&
          error.uploadOffset != null &&
          repairs < MAX_OFFSET_REPAIRS
        ) {
          offset = error.uploadOffset;
          repairs += 1;
          continue;
        }
        throw error;
      } finally {
        if (chunk.exists) chunk.delete();
      }
    }
  } finally {
    source.close();
    if (chunk.exists) chunk.delete();
  }

  return offset;
}

export async function finalizePrivateAttemptUpload(videoUuid: string, durationMs: number) {
  const response = await authenticatedFetch(endpoint(`/${encodeURIComponent(videoUuid)}/finalize`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ durationMs }),
  });
  return parseResponse<{ video: PrivateAttemptUpload }>(response);
}

export async function deletePrivateAttemptUpload(videoUuid: string): Promise<void> {
  const response = await authenticatedFetch(endpoint(`/${encodeURIComponent(videoUuid)}`), { method: 'DELETE' });
  await parseResponse<{ deleted: true }>(response);
}
