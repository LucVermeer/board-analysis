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

const tokenLookupRows = vi.fn<() => Array<{ token: string }>>(() => []);

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
    getQueueState: vi.fn(async () => ({
      queue: [
        { uuid: 'q1', climb: { uuid: 'c1' } },
        { uuid: 'q2', climb: { uuid: 'c2' } },
      ],
      currentClimbQueueItem: { uuid: 'q1', climb: { uuid: 'c1' } },
    })),
  },
}));

vi.mock('../pubsub/index', () => ({
  pubsub: {},
}));

const mockNavigate = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('../services/queue-navigation', () => ({
  navigateToQueueItem: (...args: unknown[]) => mockNavigate(...args),
}));

const { handleWidgetNavigate, __resetWidgetRateLimitForTests } = await import('../handlers/widget-navigate');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'session-widget-test';
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

  it('returns 401 when bearer token is not registered for sessionId', async () => {
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

  it('returns 200 when bearer token is registered for sessionId', async () => {
    tokenLookupRows.mockReturnValue([{ token: REGISTERED_TOKEN }]);
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
  });

  it('returns 429 once the per-session token bucket is exhausted', async () => {
    tokenLookupRows.mockReturnValue([{ token: REGISTERED_TOKEN }]);

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
  });

  it('returns 405 for non-POST methods', async () => {
    const req = makeRequest({ method: 'GET' });
    const res = makeResponse();
    await handleWidgetNavigate(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(405);
  });
});
