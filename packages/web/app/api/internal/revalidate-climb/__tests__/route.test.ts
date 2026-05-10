import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockRevalidateTag = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  mockRevalidateTag.mockClear();
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_SECRET;
  }
});

async function importPost() {
  // Re-import per test so the module reads the current CRON_SECRET.
  vi.resetModules();
  const mod = await import('../route');
  return mod.POST;
}

function createRequest(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/internal/revalidate-climb', {
    method: 'POST',
    headers: authHeader
      ? { authorization: authHeader, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/internal/revalidate-climb', () => {
  it('returns 401 when authorization header is missing', async () => {
    const POST = await importPost();
    const response = await POST(createRequest({ climbUuid: 'AC9F' }));
    expect(response.status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token does not match CRON_SECRET', async () => {
    const POST = await importPost();
    const response = await POST(createRequest({ climbUuid: 'AC9F' }, 'Bearer wrong-secret'));
    expect(response.status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not valid JSON', async () => {
    const POST = await importPost();
    const response = await POST(createRequest('not-json', 'Bearer test-secret'));
    expect(response.status).toBe(400);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('returns 400 when climbUuid is missing', async () => {
    const POST = await importPost();
    const response = await POST(createRequest({}, 'Bearer test-secret'));
    expect(response.status).toBe(400);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('returns 400 when climbUuid is not a string', async () => {
    const POST = await importPost();
    const response = await POST(createRequest({ climbUuid: 123 }, 'Bearer test-secret'));
    expect(response.status).toBe(400);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('returns 204 and revalidates climb-${uuid} tag on a valid request', async () => {
    const POST = await importPost();
    const response = await POST(createRequest({ climbUuid: 'AC9FCF7F01FC44BD835CFC41CB2224DA' }, 'Bearer test-secret'));
    expect(response.status).toBe(204);
    expect(mockRevalidateTag).toHaveBeenCalledWith('climb-AC9FCF7F01FC44BD835CFC41CB2224DA', { expire: 0 });
  });

  it('returns 401 when CRON_SECRET is unset (server misconfig)', async () => {
    delete process.env.CRON_SECRET;
    const POST = await importPost();
    const response = await POST(createRequest({ climbUuid: 'AC9F' }, 'Bearer anything'));
    expect(response.status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});
