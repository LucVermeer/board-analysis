// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { track } from '../analytics.server';

vi.mock('server-only', () => ({}));

const mockVercelTrack = vi.hoisted(() => vi.fn());
vi.mock('@vercel/analytics/server', () => ({
  track: (...args: Parameters<typeof mockVercelTrack>) => mockVercelTrack(...args),
}));

describe('server analytics wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVercelTrack.mockResolvedValue(undefined);
  });

  it('delegates event names, properties, and headers to Vercel server analytics', async () => {
    const headers = new Headers({
      'user-agent': 'vitest',
      'x-forwarded-for': '127.0.0.1',
    });

    await track(
      'Climb Search Cache Invalidated',
      {
        boardName: 'kilter',
        layoutId: 1,
        source: 'internal-route',
      },
      { headers },
    );

    expect(mockVercelTrack).toHaveBeenCalledTimes(1);
    expect(mockVercelTrack).toHaveBeenCalledWith(
      'Climb Search Cache Invalidated',
      {
        boardName: 'kilter',
        layoutId: 1,
        source: 'internal-route',
      },
      { headers },
    );
  });
});
