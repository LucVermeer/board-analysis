import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

type TokenRow = { sessionId: string; userId: string | null };

const tokenLookupRows = vi.fn<() => TokenRow[]>(() => []);
const takeSessionDriverControlMock = vi.fn(async (_args: { sessionId: string; participantId: string }) => {});

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

vi.mock('../services/session-driver-control', () => ({
  takeSessionDriverControl: (args: { sessionId: string; participantId: string }) => takeSessionDriverControlMock(args),
}));

const { handleWidgetTakeControl } = await import('../handlers/widget-take-control');

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
  emitter.url = '/api/widget/take-control';
  emitter.headers = {};
  if (opts.authHeader) emitter.headers.authorization = opts.authHeader;
  emitter.destroy = vi.fn();

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
  return {
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
}

describe('handleWidgetTakeControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenLookupRows.mockReturnValue([]);
    takeSessionDriverControlMock.mockResolvedValue(undefined);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeRequest({ method: 'POST', body: { sessionId: SESSION_ID } });
    const res = makeResponse();

    await handleWidgetTakeControl(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(takeSessionDriverControlMock).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token is unknown', async () => {
    tokenLookupRows.mockReturnValue([]);
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${STRANGER_TOKEN}`,
      body: { sessionId: SESSION_ID },
    });
    const res = makeResponse();

    await handleWidgetTakeControl(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(takeSessionDriverControlMock).not.toHaveBeenCalled();
  });

  it('returns 410 when bearer token is bound to a different session', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: 'session-other', userId: USER_ID }]);
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID },
    });
    const res = makeResponse();

    await handleWidgetTakeControl(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(410);
    const parsed = JSON.parse(res.body) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('re-register');
    expect(takeSessionDriverControlMock).not.toHaveBeenCalled();
  });

  it('returns 403 when registered widget token has no bound userId', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: null }]);
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID },
    });
    const res = makeResponse();

    await handleWidgetTakeControl(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(403);
    expect(takeSessionDriverControlMock).not.toHaveBeenCalled();
  });

  it('claims driver control for the token-bound user', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: USER_ID }]);
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID },
    });
    const res = makeResponse();

    await handleWidgetTakeControl(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as { success: boolean };
    expect(parsed.success).toBe(true);
    expect(takeSessionDriverControlMock).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      participantId: USER_ID,
    });
  });

  it('returns 500 without leaking details when driver control fails', async () => {
    tokenLookupRows.mockReturnValue([{ sessionId: SESSION_ID, userId: USER_ID }]);
    takeSessionDriverControlMock.mockRejectedValueOnce(new Error('redis exploded'));
    const req = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: SESSION_ID },
    });
    const res = makeResponse();

    await handleWidgetTakeControl(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Internal server error');
  });

  it('returns 400 for malformed bodies and 405 for non-POST methods', async () => {
    const badBodyReq = makeRequest({
      method: 'POST',
      authHeader: `Bearer ${REGISTERED_TOKEN}`,
      body: { sessionId: '' },
    });
    const badBodyRes = makeResponse();
    await handleWidgetTakeControl(badBodyReq as unknown as IncomingMessage, badBodyRes as unknown as ServerResponse);
    expect(badBodyRes.statusCode).toBe(400);

    const getReq = makeRequest({ method: 'GET' });
    const getRes = makeResponse();
    await handleWidgetTakeControl(getReq as unknown as IncomingMessage, getRes as unknown as ServerResponse);
    expect(getRes.statusCode).toBe(405);
  });
});
