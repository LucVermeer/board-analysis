import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { renderHook, act } from '@testing-library/react';
import { convertLitUpHoldsStringToMap } from '@boardsesh/board-constants/hold-states';
import { usePlaybackEngine, type ExternalPlaybackState } from '../use-playback-engine';

const TENSION_FRAMES = 'p100r1,p200r2,p300r3,p400r3';

function decode(frames: string) {
  const split = frames.split(',').filter(Boolean);
  const decoded = convertLitUpHoldsStringToMap(frames, 'tension');
  return {
    frameStrings: split,
    frames: split.map((_, i) => decoded[i] ?? {}),
  };
}

describe('usePlaybackEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no-ops on a single-frame climb', () => {
    const { frames, frameStrings } = decode('p100r1');
    const { result } = renderHook(() => usePlaybackEngine({ frames, frameStrings, paceMs: 200, clientId: 'a' }));
    expect(result.current.isAnimatable).toBe(false);
    expect(result.current.frameIndex).toBe(0);
    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentFrameString).toBe('p100r1');
  });

  it('advances one frame per pace tick when playing', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const { result } = renderHook(() => usePlaybackEngine({ frames, frameStrings, paceMs: 200, clientId: 'a' }));
    expect(result.current.isAnimatable).toBe(true);
    expect(result.current.frameIndex).toBe(0);
    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.frameIndex).toBe(1);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.frameIndex).toBe(2);
  });

  it('stops at the last frame instead of looping', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const { result } = renderHook(() => usePlaybackEngine({ frames, frameStrings, paceMs: 300, clientId: 'a' }));
    act(() => {
      result.current.play();
    });
    act(() => {
      // Advance well past the end; the engine should rest on the last frame.
      vi.advanceTimersByTime(300 * (frameStrings.length + 2));
    });
    expect(result.current.frameIndex).toBe(frameStrings.length - 1);
    expect(result.current.isPlaying).toBe(false);
  });

  it('restarts from frame 0 when play is pressed on the last frame', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const { result } = renderHook(() => usePlaybackEngine({ frames, frameStrings, paceMs: 300, clientId: 'a' }));
    act(() => {
      result.current.play();
    });
    act(() => {
      vi.advanceTimersByTime(300 * (frameStrings.length + 2));
    });
    expect(result.current.frameIndex).toBe(frameStrings.length - 1);
    act(() => {
      result.current.play();
    });
    expect(result.current.frameIndex).toBe(0);
    expect(result.current.isPlaying).toBe(true);
  });

  it('halves tick interval at speed=2', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    // paceMs / speed = 800 / 2 = 400ms, comfortably above the 200ms MIN_PACE_MS floor.
    const { result } = renderHook(() => usePlaybackEngine({ frames, frameStrings, paceMs: 800, clientId: 'a' }));
    act(() => {
      result.current.setSpeed(2);
      result.current.play();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.frameIndex).toBe(1);
  });

  it('seek clamps to valid range and updates the frame string', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const { result } = renderHook(() => usePlaybackEngine({ frames, frameStrings, paceMs: 200, clientId: 'a' }));
    act(() => {
      result.current.seek(99);
    });
    expect(result.current.frameIndex).toBe(frameStrings.length - 1);
    expect(result.current.currentFrameString).toBe(frameStrings[frameStrings.length - 1]);
    act(() => {
      result.current.seek(-5);
    });
    expect(result.current.frameIndex).toBe(0);
  });

  it('converges to external (peer) state and ignores echoes', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const { result, rerender } = renderHook(
      ({ externalState }: { externalState: ExternalPlaybackState | null }) =>
        usePlaybackEngine({
          frames,
          frameStrings,
          paceMs: 200,
          clientId: 'self',
          externalState,
        }),
      { initialProps: { externalState: null as ExternalPlaybackState | null } },
    );

    // Peer broadcasts frame 2, paused, at the current time.
    rerender({
      externalState: {
        frameIndex: 2,
        isPlaying: false,
        speed: 1,
        paceMs: 200,
        anchorTimestamp: Date.now(),
        clientId: 'peer',
      },
    });
    expect(result.current.frameIndex).toBe(2);
    expect(result.current.isPlaying).toBe(false);

    // Echo of our own state should not retrigger convergence — pin the
    // engine at frame 1 then send an echo at frame 0.
    act(() => {
      result.current.seek(1);
    });
    rerender({
      externalState: {
        frameIndex: 0,
        isPlaying: false,
        speed: 1,
        paceMs: 200,
        anchorTimestamp: Date.now(),
        clientId: 'self',
      },
    });
    expect(result.current.frameIndex).toBe(1);
  });

  it('extrapolates frames from peer anchor when isPlaying', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const now = Date.now();
    vi.setSystemTime(now);
    const external: ExternalPlaybackState = {
      frameIndex: 0,
      isPlaying: true,
      speed: 1,
      paceMs: 200,
      anchorTimestamp: now - 410, // ~2 frames worth of elapsed time
      clientId: 'peer',
    };
    const { result } = renderHook(() =>
      usePlaybackEngine({
        frames,
        frameStrings,
        paceMs: 200,
        clientId: 'self',
        externalState: external,
      }),
    );
    expect(result.current.frameIndex).toBe(2);
  });

  it('clamps NaN speed in external state to 1', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const external: ExternalPlaybackState = {
      frameIndex: 1,
      isPlaying: false,
      speed: Number.NaN,
      paceMs: 200,
      anchorTimestamp: Date.now(),
      clientId: 'peer',
    };
    const { result } = renderHook(() =>
      usePlaybackEngine({ frames, frameStrings, paceMs: 200, clientId: 'self', externalState: external }),
    );
    // NaN speed is rejected → default to 1; frame 1 is preserved (paused so no extrapolation).
    expect(result.current.speed).toBe(1);
    expect(result.current.frameIndex).toBe(1);
  });

  it('clamps negative frameIndex in external state to 0', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const external: ExternalPlaybackState = {
      frameIndex: -5,
      isPlaying: false,
      speed: 1,
      paceMs: 200,
      anchorTimestamp: Date.now(),
      clientId: 'peer',
    };
    const { result } = renderHook(() =>
      usePlaybackEngine({ frames, frameStrings, paceMs: 200, clientId: 'self', externalState: external }),
    );
    expect(result.current.frameIndex).toBe(0);
  });

  it('clamps paceMs=0 in external state so extrapolation does not divide by zero', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const now = Date.now();
    vi.setSystemTime(now);
    const external: ExternalPlaybackState = {
      frameIndex: 0,
      isPlaying: true,
      speed: 1,
      paceMs: 0,
      anchorTimestamp: now - 1000,
      clientId: 'peer',
    };
    const { result } = renderHook(() =>
      usePlaybackEngine({ frames, frameStrings, paceMs: 200, clientId: 'self', externalState: external }),
    );
    // paceMs=0 clamped to MIN_PACE_MS (200) → 1000ms / 200ms = 5 steps.
    // Playback no longer loops, so the projection clamps to the last frame
    // and the engine reports stopped. No divide-by-zero, no Infinity.
    expect(Number.isFinite(result.current.frameIndex)).toBe(true);
    expect(result.current.frameIndex).toBe(frameStrings.length - 1);
    expect(result.current.isPlaying).toBe(false);
  });

  it('emits onLocalStateChange on user actions but not on auto ticks', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const onLocalStateChange = vi.fn();
    const { result } = renderHook(() =>
      usePlaybackEngine({
        frames,
        frameStrings,
        paceMs: 200,
        clientId: 'self',
        onLocalStateChange,
      }),
    );
    act(() => {
      result.current.play();
    });
    expect(onLocalStateChange).toHaveBeenCalledTimes(1);
    onLocalStateChange.mockClear();
    act(() => {
      vi.advanceTimersByTime(600); // three ticks
    });
    expect(onLocalStateChange).not.toHaveBeenCalled();
    act(() => {
      result.current.pause();
    });
    expect(onLocalStateChange).toHaveBeenCalledTimes(1);
    onLocalStateChange.mockClear();
    act(() => {
      result.current.seek(1);
    });
    expect(onLocalStateChange).toHaveBeenCalledTimes(1);
    onLocalStateChange.mockClear();
    act(() => {
      result.current.setSpeed(2);
    });
    expect(onLocalStateChange).toHaveBeenCalledTimes(1);
  });

  it('broadcasts the stop when playback reaches the last frame', () => {
    const { frames, frameStrings } = decode(TENSION_FRAMES);
    const onLocalStateChange = vi.fn();
    const { result } = renderHook(() =>
      usePlaybackEngine({ frames, frameStrings, paceMs: 200, clientId: 'self', onLocalStateChange }),
    );
    act(() => {
      result.current.play();
    });
    onLocalStateChange.mockClear();
    act(() => {
      // Run through every frame; the terminal tick stops and broadcasts.
      vi.advanceTimersByTime(200 * (frameStrings.length + 1));
    });
    expect(onLocalStateChange).toHaveBeenCalledTimes(1);
    expect(onLocalStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ isPlaying: false, frameIndex: frameStrings.length - 1 }),
    );
    expect(result.current.frameIndex).toBe(frameStrings.length - 1);
    expect(result.current.isPlaying).toBe(false);
  });
});
