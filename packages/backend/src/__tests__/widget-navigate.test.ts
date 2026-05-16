/**
 * Tests for the widget-navigate REST handler.
 *
 * Verifies:
 * - Missing Authorization header → 401.
 * - Bearer token not registered for sessionId → 401.
 * - Bearer token registered for sessionId → 200.
 * - Per-session rate limit returns 429 after burst exhausted.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mocks (must be hoisted before importing the handler)
// ---------------------------------------------------------------------------

// The handler now looks up `(token,)` (not `(token, sessionId)`) so the
// returned row's `sessionId` can distinguish "no row at all → 401" from
// "row exists but bound to a different session → 410". The mock returns
// `{sessionId}` rows accordingly.
type MockQueueState = {
  queue: Array<{ uuid: string; climb: { uuid: string } }>;
  currentClimbQueueItem: { uuid: string; climb: { uuid: string } } | null;
};

const tokenLookupRows = vi.fn<() => Array<{ sessionId: string; userId: string | null }>>(() => []);
const trackLiveActivityWidgetNavigationMock = vi.fn();
const trackLiveActivityWidgetNavigationAttributionGapMock = vi.fn();
const getQueueStateMock = vi.fn<() => Promise<MockQueueState>>(async () => ({
  queue: [
    { uuid: 'q1', climb: { uuid: 'c1' } },
    { uuid: 'q2', climb: { uuid: 'c2' } },
  ],
  currentClimbQueueItem: { uuid: 'q1', climb: { uuid: 'c1' } },
}));

vi.mock('../db/client', () => {
  function makeChain() {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(async (_n: number) => tokenLookupRows());
    return chain;
  }
  return {
    db: {
      select: vi.fn(() => makeChain()),
    },
  };
});

vi.mock('../handlers/cors', () => ({
  applyCorsHeaders: vi.fn(() => true),
}));

vi.mock('../services/room-manager', () => ({
  roomManager: {
    getQueueState: getQueueStateMock,
  },
}));

vi.mock('../services/analytics/live-activity', () => ({
  trackLiveActivityWidgetNavigation: trackLiveActivityWidgetNavigationMock,
  trackLiveActivityWidgetNavigationAttributionGap: trackLiveActivityWidgetNavigationAttributionGapMock,
}));

vi.mock('../pubsub/index', () => ({
  pubsub: {},
}));

// Typed to match `navigateToQueueItem`'s actual signature so a future change
// to the return shape (e.g. adding fields, switching to a discriminated union)
// surfaces here as a type error instead of slipping through a `true`/truthy
// coincidence.
type NavigateToQueueItem = typeof import('../services/queue-navigation').navigateToQueueItem;
type NavigateToQueueItemResult = Awaited<ReturnType<NavigateToQueueItem>>;

const mockNavigate = vi.fn<NavigateToQueueItem>(
  async (_sessionId, _targetIndex, _roomManager, _pubsub, _clientId, _correlationId) =>
    ({
      item: { uuid: 'q1', climb: { uuid: 'c1' } },
      sequence: 1,
    }) as NonNullable<NavigateToQueueItemResult>,
);
vi.mock('../services/queue-navigation', () => ({
  navigateToQueueItem: (...args: Parameters<NavigateToQueueItem>) => mockNavigate(...args),
}));

const { handleWidgetNavigate, __resetWidgetRateLimitForTests } = await import('../handlers/widget-navigate');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'session-widget-test';
const USER_ID = 'user-widget-test';
const REGISTERED_TOKEN = 'b'.repeat(64);
const STRANGER_TOKEN = 'c'.repeat(64);

interface MockReq extends EventEmitter {
  method?: string;
  url?: string;
  headers: Record<string, string>;
  destroy: () => void;
}

function makeRequest(opts: { method: string; body?: unknown; authHeader?: string }): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = opts.method;
  emitter.url = '/api/widget/navigate';
  emitter.headers = {};
  if (opts.authHeader) emitter.headers['authorization'] = opts.authHeader;
  emitter.destroy = vi.fn();

  // Async-emit body bytes after listeners are attached
  setImmediate(() => {
    if (opts.body !== undefined) {
      emitter.emit('data', Buffer.from(JSON.stringify(opts.body), 'utf8'));
    }
    emitter.emit('end');
  });

  return emitter;
}

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, unknown>;
  writeHead: (status: number, headers?: Record<string, unknown>) => void;
  end: (body?: string) => void;
  setHeader: (name: string, value: unknown) => void;
}

function makeResponse(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: '',
    headers: {},
    writeHead(status, headers) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(body) {
      if (body !== undefined) this.body = body;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleWidgetNavigate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenLookupRows.mockReturnValue([]);
    getQueueStateMock.mockResolvedValue({
      queue: [
        { uuid: 'q1', climb: { uuid: 'c1' } },
        { uuid: 'q2', climb: { uuid: 'c2' } },
      ],
      currentClimbQueueItem: { uuid: 'q1', climb: { uuid: 'c1' } },
    });
    __resetWidgetRateLimitForTests();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(401);
    const parsed = JSON.parse(res.body) as { success: boolean };
    expect(parsed.success).toBe(false);
  });

  it('returns 401 when bearer token is not in the table at all', async () => {
    tokenLookupRows.mockReturnValue([]); // no matching row
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${STRANGER_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(401);
  });

  it('returns 410 when bearer token is bound to a different sessionId', async () => {
    // Token exists in the DB but is bound to a different session — signal
    // the widget to re-register rather than silently 401.
    tokenLookupRows.mockReturnValue([{ sessionId: 'session-other', userId: USER_ID }]);
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(410);
    const parsed = JSON.parse(res.body) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('re-register');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(trackLiveActivityWidgetNavigationMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      action: 'next',
      outcome: 'wrong_session',
      statusCode: 410,
      boundSessionId: 'session-other',
    });
  });

  it('returns 200 when bearer token is registered for sessionId', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: USER_ID }]);
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as { success: boolean };
    expect(parsed.success).toBe(true);
    expect(mockNavigate).toHaveBeenCalledOnce();
    expect(trackLiveActivityWidgetNavigationMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      action: 'next',
      outcome: 'success',
      statusCode: 200,
      queueLength: 2,
      serverCurrentIndex: 0,
      targetIndex: 1,
    });
  });

  it('tracks an aggregate attribution-gap event when the registered token has no userId', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: null }]);
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(trackLiveActivityWidgetNavigationMock).not.toHaveBeenCalled();
    expect(trackLiveActivityWidgetNavigationAttributionGapMock).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      action: 'next',
      outcome: 'success',
      statusCode: 200,
      queueLength: 2,
      serverCurrentIndex: 0,
      targetIndex: 1,
      reason: 'missing_user_id',
    });
  });

  it('returns 429 once the per-session token bucket is exhausted', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: USER_ID }]);

    // Bucket capacity is 2 — first two requests allowed, third returns 429.
    for (let i = 0; i < 2; i++) {
      const req = makeRequest({
        method: 'POST',
        authHeader: `Bearer ${REGISTERED_TOKEN}`,
        body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
      });
      const res = makeResponse();
      await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);
      expect(res.statusCode).toBe(200);
    }

    const req3 = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
    });
    const res3 = makeResponse();
    await handleWidgetNavigate(req3 as unknown as IncomingMessage, res3 as unknown as ServerResponse);

    expect(res3.statusCode).toBe(429);
    expect(trackLiveActivityWidgetNavigationMock).toHaveBeenLastCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      action: 'next',
      outcome: 'rate_limited',
      statusCode: 429,
    });
  });

  it('returns 409 and tracks when the registered widget navigates an empty queue', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: USER_ID }]);
    getQueueStateMock.mockResolvedValue({
      queue: [],
      currentClimbQueueItem: null,
    });

    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'previous', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(409);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(trackLiveActivityWidgetNavigationMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      action: 'previous',
      outcome: 'queue_empty',
      statusCode: 409,
      queueLength: 0,
    });
  });

  it('returns 409 and tracks target_out_of_bounds when navigation returns null', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: USER_ID }]);
    mockNavigate.mockResolvedValueOnce(null);

    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'previous', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(409);
    const parsed = JSON.parse(res.body) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Target index out of bounds');
    expect(trackLiveActivityWidgetNavigationMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      action: 'previous',
      outcome: 'target_out_of_bounds',
      statusCode: 409,
      queueLength: 2,
      serverCurrentIndex: 0,
      targetIndex: 1,
    });
  });

  it('returns 500 and tracks error when queue navigation throws', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: USER_ID }]);
    mockNavigate.mockRejectedValueOnce(new Error('navigation exploded'));

    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID, action: 'next', currentIndex: 0 },
    });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('navigation exploded');
    expect(trackLiveActivityWidgetNavigationMock).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      action: 'next',
      outcome: 'error',
      statusCode: 500,
    });
  });

  it('returns 405 for non-POST methods', async () => {
    const req = makeRequest({ method: 'GET' });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(405);
  });
});
