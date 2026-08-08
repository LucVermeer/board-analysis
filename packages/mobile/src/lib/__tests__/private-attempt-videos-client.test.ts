import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { File } from 'expo-file-system';

const { authenticatedFetch, ensureFreshToken, getAuthToken, nativeUpload } = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  ensureFreshToken: vi.fn(),
  getAuthToken: vi.fn(),
  nativeUpload: vi.fn(),
}));

vi.mock('expo-file-system', () => ({
  File: class {
    exists = false;

    create() {
      this.exists = true;
    }

    write() {}

    upload(...args: unknown[]) {
      return nativeUpload(...args);
    }

    delete() {
      this.exists = false;
    }
  },
  FileMode: { ReadOnly: 'r' },
  Paths: { cache: 'cache' },
  UploadType: { BINARY_CONTENT: 0 },
}));
vi.mock('../auth-interceptor', () => ({ authenticatedFetch, ensureFreshToken }));
vi.mock('../auth-store', () => ({ getAuthToken }));
vi.mock('../env', () => ({ BACKEND_URL: 'https://backend.test' }));

import {
  createPrivateAttemptUpload,
  PrivateAttemptApiError,
  uploadPrivateAttemptFile,
} from '../private-attempt-videos-client';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  authenticatedFetch.mockReset();
  ensureFreshToken.mockReset();
  ensureFreshToken.mockResolvedValue(true);
  getAuthToken.mockReset();
  getAuthToken.mockResolvedValue('test-token');
  nativeUpload.mockReset();
});

describe('private attempt video client', () => {
  it('creates an authenticated MoonBoard upload with the supplied identity snapshot', async () => {
    authenticatedFetch.mockResolvedValueOnce(
      jsonResponse({ video: { uuid: 'video-1', status: 'uploading' }, uploadOffset: 0 }),
    );
    const input = {
      clientRecordingId: 'recording-1',
      climbUuid: 'climb-1',
      layoutId: 3 as const,
      angle: 40,
      isMirror: false,
      boardId: null,
      sessionId: 'session-1',
      mimeType: 'video/mp4',
      recordedAt: '2026-08-08T12:00:00.000Z',
    };

    await expect(createPrivateAttemptUpload(input)).resolves.toMatchObject({ uploadOffset: 0 });
    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://backend.test/api/private-attempt-videos',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
  });

  it('repairs an offset mismatch and resumes from the server-authoritative byte', async () => {
    const chunkSize = 4 * 1024 * 1024;
    const totalSize = chunkSize * 2 + 23;
    const handle = {
      offset: 0,
      readBytes: vi.fn((length: number) => new Uint8Array(length)),
      close: vi.fn(),
    };
    const file = { size: totalSize, open: vi.fn(() => handle) } as unknown as File;
    nativeUpload
      .mockResolvedValueOnce({ body: JSON.stringify({ uploadOffset: chunkSize }), status: 200, headers: {} })
      .mockResolvedValueOnce({
        body: JSON.stringify({ code: 'OFFSET_MISMATCH', error: 'offset mismatch', uploadOffset: 123 }),
        status: 409,
        headers: {},
      })
      .mockResolvedValueOnce({ body: JSON.stringify({ uploadOffset: chunkSize + 123 }), status: 200, headers: {} })
      .mockResolvedValueOnce({ body: JSON.stringify({ uploadOffset: totalSize }), status: 200, headers: {} });

    await expect(uploadPrivateAttemptFile('video-1', file, 0)).resolves.toBe(totalSize);
    expect(nativeUpload.mock.calls.map(([, options]) => options.headers['Upload-Offset'])).toEqual([
      '0',
      String(chunkSize),
      '123',
      String(chunkSize + 123),
    ]);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it('surfaces structured API errors', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse({ code: 'RECORDING_TOO_LARGE', error: 'too large' }, 413));

    await expect(
      createPrivateAttemptUpload({
        clientRecordingId: 'recording-1',
        climbUuid: 'climb-1',
        layoutId: 3,
        angle: 40,
        isMirror: false,
        boardId: null,
        sessionId: null,
        mimeType: 'video/mp4',
        recordedAt: '2026-08-08T12:00:00.000Z',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrivateAttemptApiError>>({ code: 'RECORDING_TOO_LARGE', status: 413 }),
    );
  });
});
