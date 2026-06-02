// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type SharePayload = { message: string; url: string };

const shareMock = vi.fn<(payload: SharePayload) => Promise<{ action: string }>>(async () => ({
  action: 'sharedAction',
}));

vi.mock('react-native', () => ({
  Share: {
    share: (payload: SharePayload) => shareMock(payload),
  },
}));

vi.mock('../../lib/env', () => ({
  WEB_BASE_URL: 'https://www.boardsesh.com',
}));

import { useShareClimb } from '../use-share-climb';

const climb = {
  uuid: 'climb-uuid-123',
  name: 'Test Climb',
} as unknown as Parameters<typeof useShareClimb>[0]['climb'];

const baseArgs = {
  boardName: 'kilter',
  layoutId: 1,
  sizeId: 7,
  setIds: '1,20',
  angle: 40,
};

describe('useShareClimb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a no-op when climb is null and does not call Share', async () => {
    const { result } = renderHook(() => useShareClimb({ climb: null, ...baseArgs }));
    await act(async () => {
      await result.current();
    });
    expect(shareMock).not.toHaveBeenCalled();
  });

  it('builds the boardsesh climb URL with the configured WEB_BASE_URL', async () => {
    const { result } = renderHook(() => useShareClimb({ climb, ...baseArgs }));
    await act(async () => {
      await result.current();
    });
    expect(shareMock).toHaveBeenCalledTimes(1);
    const firstCall = shareMock.mock.calls[0];
    if (!firstCall) throw new Error('Share.share was not called');
    const payload = firstCall[0];
    expect(payload.url.startsWith('https://www.boardsesh.com/')).toBe(true);
    expect(payload.url).toContain('climb-uuid-123');
    expect(payload.url).toContain('kilter');
    expect(payload.url).toContain('40'); // angle
  });

  it('includes the climb name and URL in the message body', async () => {
    const { result } = renderHook(() => useShareClimb({ climb, ...baseArgs }));
    await act(async () => {
      await result.current();
    });
    const firstCall = shareMock.mock.calls[0];
    if (!firstCall) throw new Error('Share.share was not called');
    const payload = firstCall[0];
    expect(payload.message).toContain('Test Climb');
    expect(payload.message).toContain(payload.url);
  });

  it('propagates rejections from Share.share so callers can surface failures', async () => {
    shareMock.mockRejectedValueOnce(new Error('user cancelled'));
    const { result } = renderHook(() => useShareClimb({ climb, ...baseArgs }));
    await act(async () => {
      await expect(result.current()).rejects.toThrow('user cancelled');
    });
  });

  it('returns a new callback when the climb identity changes', () => {
    const { result, rerender } = renderHook(({ c }) => useShareClimb({ climb: c, ...baseArgs }), {
      initialProps: { c: climb },
    });
    const firstShare = result.current;

    rerender({ c: { ...climb, uuid: 'different-uuid' } as typeof climb });
    expect(result.current).not.toBe(firstShare);
  });

  it('reuses the same callback when nothing relevant changes', () => {
    const { result, rerender } = renderHook(({ c }) => useShareClimb({ climb: c, ...baseArgs }), {
      initialProps: { c: climb },
    });
    const firstShare = result.current;

    rerender({ c: climb });
    expect(result.current).toBe(firstShare);
  });
});
