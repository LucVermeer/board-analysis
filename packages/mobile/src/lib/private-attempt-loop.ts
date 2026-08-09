export const MIN_LOOP_SECONDS = 0.25;

export type LoopRange = {
  start: number;
  end: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function fullLoopRange(durationSeconds: number): LoopRange {
  return { start: 0, end: Math.max(MIN_LOOP_SECONDS, durationSeconds) };
}

export function withLoopStart(range: LoopRange, currentTime: number): LoopRange {
  return {
    ...range,
    start: clamp(currentTime, 0, Math.max(0, range.end - MIN_LOOP_SECONDS)),
  };
}

export function withLoopEnd(range: LoopRange, currentTime: number, durationSeconds: number): LoopRange {
  return {
    ...range,
    end: clamp(currentTime, range.start + MIN_LOOP_SECONDS, Math.max(range.start + MIN_LOOP_SECONDS, durationSeconds)),
  };
}

export function shouldRestartLoop(currentTime: number, range: LoopRange, enabled: boolean): boolean {
  return enabled && currentTime >= range.end;
}

export function attemptSwipeOffset(translationX: number, velocityX: number): -1 | 0 | 1 {
  if (translationX <= -64 || velocityX <= -650) return 1;
  if (translationX >= 64 || velocityX >= 650) return -1;
  return 0;
}
