import { describe, expect, it } from 'vite-plus/test';
import {
  attemptSwipeOffset,
  fullLoopRange,
  shouldRestartLoop,
  withLoopEnd,
  withLoopStart,
} from '../private-attempt-loop';

describe('private attempt comparison playback', () => {
  it('keeps manual loop marks ordered and inside the recording', () => {
    const range = fullLoopRange(12);
    expect(withLoopStart(range, 4.25)).toEqual({ start: 4.25, end: 12 });
    expect(withLoopEnd({ start: 4.25, end: 12 }, 7.5, 12)).toEqual({ start: 4.25, end: 7.5 });
    expect(withLoopStart({ start: 4.25, end: 7.5 }, 20)).toEqual({ start: 7.25, end: 7.5 });
    expect(withLoopEnd({ start: 4.25, end: 7.5 }, 2, 12)).toEqual({ start: 4.25, end: 4.5 });
  });

  it('restarts only after an enabled loop reaches its end', () => {
    const range = { start: 2, end: 5 };
    expect(shouldRestartLoop(4.99, range, true)).toBe(false);
    expect(shouldRestartLoop(5, range, true)).toBe(true);
    expect(shouldRestartLoop(6, range, false)).toBe(false);
  });

  it('maps deliberate horizontal swipes to adjacent beta attempts', () => {
    expect(attemptSwipeOffset(-70, 0)).toBe(1);
    expect(attemptSwipeOffset(70, 0)).toBe(-1);
    expect(attemptSwipeOffset(-20, -700)).toBe(1);
    expect(attemptSwipeOffset(20, 700)).toBe(-1);
    expect(attemptSwipeOffset(30, 100)).toBe(0);
  });
});
