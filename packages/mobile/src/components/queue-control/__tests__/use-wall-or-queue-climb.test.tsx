// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg = vi.hoisted(() => ({
  enabled: true,
  boardId: 1 as number | null,
  // Mirrors `BoardPresenceWallClimbContext`'s own value: `isLive ? currentClimb
  // : null` is computed by the provider, so the hook under test only ever sees
  // the already-collapsed wall climb (or null).
  wallClimb: { climbUuid: 'wall-1', name: 'Wax On', difficulty: 15 } as {
    climbUuid: string;
    name: string;
    difficulty: number;
  } | null,
}));

vi.mock('../../../providers/board-presence-provider', () => ({
  useBoardPresenceControls: () => ({ enabled: cfg.enabled, boardId: cfg.boardId }),
}));
vi.mock('@boardsesh/board-presence-react', () => ({
  useBoardPresenceWallClimb: () => cfg.wallClimb,
}));

import { useWallClimbIfDistinct } from '../use-wall-or-queue-climb';

describe('useWallClimbIfDistinct', () => {
  beforeEach(() => {
    cfg.enabled = true;
    cfg.boardId = 1;
    cfg.wallClimb = { climbUuid: 'wall-1', name: 'Wax On', difficulty: 15 };
  });

  it('returns the wall climb when live and it differs from the queue head', () => {
    const { result } = renderHook(() => useWallClimbIfDistinct('queue-head'));
    expect(result.current).toEqual(cfg.wallClimb);
  });

  it('returns the wall climb when the local queue is empty (null head — solo/fresh session)', () => {
    const { result } = renderHook(() => useWallClimbIfDistinct(null));
    expect(result.current).toEqual(cfg.wallClimb);
  });

  it('returns null when the wall climb IS the queue head (solo case)', () => {
    const { result } = renderHook(() => useWallClimbIfDistinct('wall-1'));
    expect(result.current).toBeNull();
  });

  it('returns null when the feature is disabled', () => {
    cfg.enabled = false;
    const { result } = renderHook(() => useWallClimbIfDistinct('queue-head'));
    expect(result.current).toBeNull();
  });

  it('returns null when no board is bound', () => {
    cfg.boardId = null;
    const { result } = renderHook(() => useWallClimbIfDistinct('queue-head'));
    expect(result.current).toBeNull();
  });

  it('returns null when the feed is not live (context already collapses to null)', () => {
    cfg.wallClimb = null;
    const { result } = renderHook(() => useWallClimbIfDistinct('queue-head'));
    expect(result.current).toBeNull();
  });

  it('returns null when the live feed has no current climb', () => {
    cfg.wallClimb = null;
    const { result } = renderHook(() => useWallClimbIfDistinct('queue-head'));
    expect(result.current).toBeNull();
  });
});
