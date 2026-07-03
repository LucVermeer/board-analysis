import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetServerSession = vi.fn();
vi.mock('next-auth/next', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock('@/app/lib/auth/auth-options', () => ({
  authOptions: {},
}));

const mockSaveAscent = vi.fn();
vi.mock('@/app/lib/api-wrappers/aurora/saveAscent', () => ({
  saveAscent: (...args: unknown[]) => mockSaveAscent(...args),
}));

import { POST } from '../route';

function saveAscentRequest(quality: unknown): Request {
  return new Request('http://localhost/api/v1/kilter/proxy/saveAscent', {
    method: 'POST',
    body: JSON.stringify({
      token: 'aurora-token',
      options: {
        uuid: 'ascent-uuid-1',
        user_id: 123,
        climb_uuid: 'climb-uuid-1',
        angle: 40,
        is_mirror: false,
        attempt_id: 1,
        bid_count: 1,
        quality,
        difficulty: 20,
        is_benchmark: false,
        comment: '',
        climbed_at: '2026-07-03T00:00:00.000Z',
      },
    }),
  });
}

const routeParams = { params: Promise.resolve({ board_name: 'kilter' }) };

describe('POST /api/v1/[board_name]/proxy/saveAscent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockSaveAscent.mockResolvedValue({ events: [] });
  });

  // The proxy speaks Aurora's convention: quality 0-3 (0 = unrated).
  it.each([0, 1, 2, 3])('accepts Aurora-scale quality %d', async (quality) => {
    const response = await POST(saveAscentRequest(quality), routeParams);
    expect(response.status).toBe(200);
    expect(mockSaveAscent).toHaveBeenCalledWith(
      'kilter',
      'aurora-token',
      expect.objectContaining({ quality }),
      'user-1',
    );
  });

  it.each([-1, 4, 5, 1.5])('rejects out-of-scale quality %s with 400', async (quality) => {
    const response = await POST(saveAscentRequest(quality), routeParams);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request data');
    expect(mockSaveAscent).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const response = await POST(saveAscentRequest(3), routeParams);
    expect(response.status).toBe(401);
    expect(mockSaveAscent).not.toHaveBeenCalled();
  });
});
