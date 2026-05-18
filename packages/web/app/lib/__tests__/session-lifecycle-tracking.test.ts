import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/app/lib/analytics', () => ({
  track: mocks.track,
}));

type LifecycleModule = typeof import('../session-lifecycle-tracking');

async function importFresh(): Promise<LifecycleModule> {
  vi.resetModules();
  return await import('../session-lifecycle-tracking');
}

describe('session-lifecycle-tracking', () => {
  beforeEach(() => {
    mocks.track.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registerSessionStart', () => {
    it('is a no-op when sessionId is empty', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('');
      expect(lifecycle.getActiveTrackedSessionIds()).toEqual([]);
    });

    it('creates a fresh record on first call', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      expect(lifecycle.getActiveTrackedSessionIds()).toEqual(['s1']);
    });

    it('re-registering before emit preserves the original startedAt', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      vi.advanceTimersByTime(10_000);
      // Double-register without an intervening emit (matches the real call
      // pattern where both Session Started and Session Joined fire for a
      // single session). startedAt must stay pinned to the first call so the
      // duration reflects the full session age.
      lifecycle.registerSessionStart('s1');
      vi.advanceTimersByTime(20_000);
      lifecycle.emitSessionEnded('s1', 'user_left');
      expect(mocks.track).toHaveBeenCalledWith('Session Ended', expect.objectContaining({ durationSec: 30 }));
    });

    it('after emit, re-registering creates a fresh record', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      lifecycle.emitSessionEnded('s1', 'user_left');
      vi.advanceTimersByTime(100_000);
      lifecycle.registerSessionStart('s1');
      vi.advanceTimersByTime(5_000);
      lifecycle.emitSessionEnded('s1', 'user_left');
      expect(mocks.track).toHaveBeenCalledTimes(2);
      const secondCall = mocks.track.mock.calls[1];
      expect(secondCall?.[1]).toMatchObject({ durationSec: 5 });
    });
  });

  describe('updateSessionPeerCount', () => {
    it('keeps the high-water-mark (does not lower)', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      lifecycle.updateSessionPeerCount('s1', 3);
      lifecycle.updateSessionPeerCount('s1', 1);
      lifecycle.emitSessionEnded('s1', 'user_left');
      expect(mocks.track).toHaveBeenCalledWith('Session Ended', expect.objectContaining({ peerCount: 3 }));
    });

    it('does nothing for an unknown session', async () => {
      const lifecycle = await importFresh();
      lifecycle.updateSessionPeerCount('unknown', 5);
      expect(lifecycle.getActiveTrackedSessionIds()).toEqual([]);
    });
  });

  describe('incrementSessionClimbsAttempted', () => {
    it('accumulates climb attempts', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      lifecycle.incrementSessionClimbsAttempted('s1');
      lifecycle.incrementSessionClimbsAttempted('s1');
      lifecycle.incrementSessionClimbsAttempted('s1');
      lifecycle.emitSessionEnded('s1', 'user_left');
      expect(mocks.track).toHaveBeenCalledWith('Session Ended', expect.objectContaining({ climbsAttempted: 3 }));
    });

    it('does nothing for an unknown session', async () => {
      const lifecycle = await importFresh();
      lifecycle.incrementSessionClimbsAttempted('unknown');
      expect(mocks.track).not.toHaveBeenCalled();
    });
  });

  describe('emitSessionEnded', () => {
    it('fires Session Ended with full payload', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      lifecycle.updateSessionPeerCount('s1', 2);
      lifecycle.incrementSessionClimbsAttempted('s1');
      vi.advanceTimersByTime(125_000);
      lifecycle.emitSessionEnded('s1', 'tab_closed');
      expect(mocks.track).toHaveBeenCalledTimes(1);
      expect(mocks.track).toHaveBeenCalledWith('Session Ended', {
        sessionId: 's1',
        durationSec: 125,
        peerCount: 2,
        climbsAttempted: 1,
        endedBy: 'tab_closed',
      });
    });

    it('is idempotent — second call on the same session is a no-op', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      lifecycle.emitSessionEnded('s1', 'user_left');
      lifecycle.emitSessionEnded('s1', 'tab_closed');
      expect(mocks.track).toHaveBeenCalledTimes(1);
      expect(mocks.track).toHaveBeenCalledWith('Session Ended', expect.objectContaining({ endedBy: 'user_left' }));
    });

    it('removes the record so getActiveTrackedSessionIds no longer reports it', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      lifecycle.registerSessionStart('s2');
      lifecycle.emitSessionEnded('s1', 'user_left');
      expect(lifecycle.getActiveTrackedSessionIds()).toEqual(['s2']);
    });

    it('is a no-op when sessionId is empty', async () => {
      const lifecycle = await importFresh();
      lifecycle.emitSessionEnded('', 'user_left');
      expect(mocks.track).not.toHaveBeenCalled();
    });

    it('is a no-op for an unknown session', async () => {
      const lifecycle = await importFresh();
      lifecycle.emitSessionEnded('never-registered', 'user_left');
      expect(mocks.track).not.toHaveBeenCalled();
    });

    it('clamps negative durations to zero', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      // Move the clock backwards to simulate a clock skew / DST anomaly.
      vi.setSystemTime(new Date('2026-05-18T09:59:50Z'));
      lifecycle.emitSessionEnded('s1', 'user_left');
      expect(mocks.track).toHaveBeenCalledWith('Session Ended', expect.objectContaining({ durationSec: 0 }));
    });
  });

  describe('getActiveTrackedSessionIds', () => {
    it('returns all registered sessions that have not yet emitted', async () => {
      const lifecycle = await importFresh();
      lifecycle.registerSessionStart('s1');
      lifecycle.registerSessionStart('s2');
      lifecycle.registerSessionStart('s3');
      lifecycle.emitSessionEnded('s2', 'user_left');
      const active = lifecycle.getActiveTrackedSessionIds().sort();
      expect(active).toEqual(['s1', 's3']);
    });
  });
});
