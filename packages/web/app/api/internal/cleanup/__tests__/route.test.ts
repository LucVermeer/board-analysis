import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

vi.mock('server-only', () => ({}));

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockDeleteWhere = vi.fn();
const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

vi.mock('@/app/lib/db/db', () => ({
  dbz: {
    select: mockSelect,
    delete: mockDelete,
  },
}));

vi.mock('@boardsesh/db/schema', () => ({
  feedItems: { id: 'feed_items.id', createdAt: 'feed_items.created_at' },
  notifications: { id: 'notifications.id', createdAt: 'notifications.created_at' },
}));

const routeModule = await import('../route');

describe('GET /api/internal/cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when the cron secret is missing or invalid', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = await routeModule.GET(new Request('http://localhost/api/internal/cleanup'));

    expect(response.status).toBe(401);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('runs the batched cleanup when the cron secret matches', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');

    const response = await routeModule.GET(
      new Request('http://localhost/api/internal/cleanup', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ feedItemsDeleted: 0, notificationsDeleted: 0 });
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });
});
