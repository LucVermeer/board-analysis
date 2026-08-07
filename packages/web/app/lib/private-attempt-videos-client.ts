import { getBackendHttpUrl } from '@/app/lib/backend-url';

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

function endpoint(path = ''): string {
  const baseUrl = getBackendHttpUrl();
  if (!baseUrl) throw new PrivateAttemptApiError('SERVICE_UNAVAILABLE', 'Video service unavailable', 503);
  return `${baseUrl}/api/private-attempt-videos${path}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    uploadOffset?: number;
  };
  if (!response.ok) {
    throw new PrivateAttemptApiError(
      payload.code ?? 'REQUEST_FAILED',
      payload.error ?? 'Recording request failed',
      response.status,
      payload.uploadOffset,
    );
  }
  return payload as T;
}

function authHeaders(token: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

export async function createPrivateAttemptUpload(token: string, input: CreatePrivateAttemptUploadInput) {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  return parseResponse<{ video: PrivateAttemptUpload; uploadOffset: number }>(response);
}

export async function getPrivateAttemptUpload(token: string, videoUuid: string) {
  const response = await fetch(endpoint(`/${encodeURIComponent(videoUuid)}`), {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  return parseResponse<{ video: PrivateAttemptUpload; uploadOffset: number }>(response);
}

export async function appendPrivateAttemptChunk(
  token: string,
  videoUuid: string,
  uploadOffset: number,
  chunk: Blob,
): Promise<number> {
  const response = await fetch(endpoint(`/${encodeURIComponent(videoUuid)}/chunks`), {
    method: 'PATCH',
    headers: authHeaders(token, {
      'Content-Type': 'application/octet-stream',
      'Upload-Offset': String(uploadOffset),
    }),
    body: chunk,
  });
  const payload = await parseResponse<{ uploadOffset: number }>(response);
  return payload.uploadOffset;
}

export async function finalizePrivateAttemptUpload(token: string, videoUuid: string, durationMs: number) {
  const response = await fetch(endpoint(`/${encodeURIComponent(videoUuid)}/finalize`), {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ durationMs }),
  });
  return parseResponse<{ video: PrivateAttemptUpload }>(response);
}

export async function deletePrivateAttemptUpload(token: string, videoUuid: string): Promise<void> {
  const response = await fetch(endpoint(`/${encodeURIComponent(videoUuid)}`), {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  await parseResponse<{ deleted: true }>(response);
}
