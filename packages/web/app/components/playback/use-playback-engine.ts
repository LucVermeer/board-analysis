import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LitUpHoldsMap } from '@boardsesh/shared-schema';
import { MIN_PACE_MS } from '../board-renderer/util';

export type PlaybackSnapshot = {
  /** Index in `frameStrings` currently displayed. */
  frameIndex: number;
  /** Whether the engine is auto-advancing. */
  isPlaying: boolean;
  /** Playback multiplier (1 = native, 2 = twice as fast). */
  speed: number;
  /** Wall-clock ms at which `frameIndex` became current. */
  anchorTimestamp: number;
};

export type ExternalPlaybackState = PlaybackSnapshot & {
  /** Native per-frame pace from the climb metadata. */
  paceMs: number;
  /** Identifier of the client that produced this state. Used for echo suppression. */
  clientId: string | null;
};

type UsePlaybackEngineInput = {
  frames: LitUpHoldsMap[];
  frameStrings: string[];
  paceMs: number;
  /** Stable identifier the engine attaches to its own emitted state. */
  clientId: string;
  /**
   * Inbound state from a peer (party mode). When supplied and `clientId`
   * doesn't match ours, the engine converges to that state.
   */
  externalState?: ExternalPlaybackState | null;
  /** Fires whenever the local engine produces a new state worth broadcasting. */
  onLocalStateChange?: (state: ExternalPlaybackState) => void;
};

export type UsePlaybackEngineOutput = {
  frameIndex: number;
  isPlaying: boolean;
  speed: number;
  /** Currently displayed snapshot. Empty map when the climb has no frames. */
  currentLitUpHoldsMap: LitUpHoldsMap;
  /** Currently displayed BLE frame string. Empty when the climb has no frames. */
  currentFrameString: string;
  /** Whether the engine has more than one frame (i.e. controls should render). */
  isAnimatable: boolean;
  play: () => void;
  pause: () => void;
  seek: (frameIndex: number) => void;
  setSpeed: (speed: number) => void;
};

/**
 * Walks a multi-frame climb at the climb's native pace, optionally syncing
 * to a peer's state via `externalState`. Single-frame climbs (the common
 * case) short-circuit: the engine never schedules a timer and `play`/`pause`
 * are no-ops.
 *
 * The timer is a self-rescheduling `setTimeout`, not `requestAnimationFrame`
 * — Aurora pace is typically hundreds of ms per step and rAF would just
 * burn CPU. Browser background-tab throttling will visibly stall playback,
 * but the LED board is the source of truth so that's acceptable for v1.
 */
export function usePlaybackEngine({
  frames,
  frameStrings,
  paceMs,
  clientId,
  externalState,
  onLocalStateChange,
}: UsePlaybackEngineInput): UsePlaybackEngineOutput {
  const isAnimatable = frameStrings.length > 1;

  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);

  // Refs so the timer callback doesn't capture stale state.
  const frameIndexRef = useRef(frameIndex);
  const isPlayingRef = useRef(isPlaying);
  const speedRef = useRef(speed);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLocalStateChangeRef = useRef(onLocalStateChange);

  frameIndexRef.current = frameIndex;
  isPlayingRef.current = isPlaying;
  speedRef.current = speed;
  onLocalStateChangeRef.current = onLocalStateChange;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Reset to frame 0 + paused whenever the underlying climb changes.
  const framesKey = frameStrings.join('|');
  useEffect(() => {
    clearTimer();
    setFrameIndex(0);
    setIsPlaying(false);
  }, [framesKey]);

  const emitLocalState = useCallback(
    (nextIndex: number, nextIsPlaying: boolean, nextSpeed: number) => {
      onLocalStateChangeRef.current?.({
        frameIndex: nextIndex,
        isPlaying: nextIsPlaying,
        speed: nextSpeed,
        anchorTimestamp: Date.now(),
        paceMs,
        clientId,
      });
    },
    [clientId, paceMs],
  );

  // Timer driver: a single effect owns the timer for the whole engine life.
  // Re-arms whenever `isPlaying`, `frameStrings.length`, or `paceMs` change.
  // Internal `tick` callback closes over refs so frame/speed changes inside
  // a tick don't re-arm the effect (which would clobber the in-flight timer
  // and visibly stall playback).
  useEffect(() => {
    if (!isPlaying || frameStrings.length <= 1) {
      clearTimer();
      return;
    }
    const scheduleNext = () => {
      const interval = Math.max(MIN_PACE_MS, paceMs / Math.max(speedRef.current, 0.01));
      timerRef.current = setTimeout(tick, interval);
    };
    const tick = () => {
      timerRef.current = null;
      if (!isPlayingRef.current) return;
      const nextIndex = (frameIndexRef.current + 1) % frameStrings.length;
      // Update the ref synchronously so back-to-back ticks (e.g. fake timers
      // firing several callbacks inside one `act`) see the advanced index
      // instead of reading the stale value through the next render.
      frameIndexRef.current = nextIndex;
      setFrameIndex(nextIndex);
      // Intentionally do NOT broadcast every tick — peers extrapolate
      // frames from the latest `anchorTimestamp`/`isPlaying`/`speed`/`paceMs`.
      // Only user actions (play/pause/seek/setSpeed) emit external state.
      scheduleNext();
    };
    scheduleNext();
    return clearTimer;
  }, [isPlaying, frameStrings.length, paceMs]);

  // Converge to external (peer) state when its clientId differs from ours.
  // Peer state arrives over the wire — clamp every numeric field before we
  // trust it. A hostile or buggy peer sending NaN, Infinity, negatives, or
  // out-of-range values would otherwise poison local state and get re-broadcast
  // on the next user action.
  useEffect(() => {
    if (!externalState) return;
    if (externalState.clientId && externalState.clientId === clientId) return;
    if (frameStrings.length === 0) return;
    const safeSpeed = Number.isFinite(externalState.speed) ? Math.max(0.1, externalState.speed) : 1;
    const safePaceMs = Number.isFinite(externalState.paceMs)
      ? Math.max(MIN_PACE_MS, externalState.paceMs)
      : MIN_PACE_MS;
    const rawFrameIndex = Number.isFinite(externalState.frameIndex) ? externalState.frameIndex : 0;
    const safeFrameIndex = Math.max(0, Math.min(frameStrings.length - 1, Math.floor(rawFrameIndex)));
    const safeAnchor = Number.isFinite(externalState.anchorTimestamp) ? externalState.anchorTimestamp : Date.now();
    const elapsed = Math.max(0, Date.now() - safeAnchor);
    const effectivePace = Math.max(MIN_PACE_MS, safePaceMs / safeSpeed);
    const stepsAdvanced = externalState.isPlaying && effectivePace > 0 ? Math.floor(elapsed / effectivePace) : 0;
    const projected = (safeFrameIndex + stepsAdvanced) % frameStrings.length;
    setFrameIndex(projected);
    setIsPlaying(externalState.isPlaying);
    setSpeedState(safeSpeed);
  }, [externalState, clientId, frameStrings.length]);

  const play = useCallback(() => {
    if (!isAnimatable) return;
    setIsPlaying(true);
    emitLocalState(frameIndexRef.current, true, speedRef.current);
  }, [isAnimatable, emitLocalState]);

  const pause = useCallback(() => {
    if (!isAnimatable) return;
    setIsPlaying(false);
    emitLocalState(frameIndexRef.current, false, speedRef.current);
  }, [isAnimatable, emitLocalState]);

  const seek = useCallback(
    (next: number) => {
      if (frameStrings.length === 0) return;
      const clamped = Math.max(0, Math.min(frameStrings.length - 1, Math.floor(next)));
      setFrameIndex(clamped);
      emitLocalState(clamped, isPlayingRef.current, speedRef.current);
    },
    [frameStrings.length, emitLocalState],
  );

  const setSpeed = useCallback(
    (next: number) => {
      const sanitised = Math.max(0.1, next);
      setSpeedState(sanitised);
      emitLocalState(frameIndexRef.current, isPlayingRef.current, sanitised);
    },
    [emitLocalState],
  );

  const currentLitUpHoldsMap = useMemo<LitUpHoldsMap>(
    () => frames[frameIndex] ?? frames[0] ?? {},
    [frames, frameIndex],
  );
  const currentFrameString = useMemo(
    () => frameStrings[frameIndex] ?? frameStrings[0] ?? '',
    [frameStrings, frameIndex],
  );

  // Returning a memoised object keeps the engine's reference stable across
  // renders that don't change any of its observable state. Callers can then
  // safely pass the engine into `React.memo`'d children or `useMemo` dep
  // arrays without busting on every render.
  return useMemo(
    () => ({
      frameIndex,
      isPlaying,
      speed,
      currentLitUpHoldsMap,
      currentFrameString,
      isAnimatable,
      play,
      pause,
      seek,
      setSpeed,
    }),
    [frameIndex, isPlaying, speed, currentLitUpHoldsMap, currentFrameString, isAnimatable, play, pause, seek, setSpeed],
  );
}
