import { describe, it, expect } from 'vitest';
import { fitBoardArt, fitBoardMaxSize } from '../board-art-fit';

describe('fitBoardArt', () => {
  it('portrait: height is the max edge, width scales down by aspect', () => {
    // 1:2 board, maxSize 200 → height 200, width 100.
    expect(fitBoardArt(100, 200, 200)).toEqual({ width: 100, height: 200 });
  });

  it('landscape: width is the max edge, height scales down by aspect', () => {
    // 2:1 board, maxSize 200 → width 200, height 100.
    expect(fitBoardArt(200, 100, 200)).toEqual({ width: 200, height: 100 });
  });

  it('square: both edges equal maxSize', () => {
    expect(fitBoardArt(120, 120, 150)).toEqual({ width: 150, height: 150 });
  });

  it('degenerate dims fall back to a square', () => {
    expect(fitBoardArt(100, 0, 180)).toEqual({ width: 180, height: 180 });
    expect(fitBoardArt(-10, 100, 180)).toEqual({ width: 180, height: 180 });
    expect(fitBoardArt(Number.NaN, 100, 180)).toEqual({ width: 180, height: 180 });
  });
});

describe('fitBoardMaxSize', () => {
  it('portrait bounded by height when the box is tall enough for the derived width', () => {
    // aspect 0.5, box 400×300 → height-bound 300, width would be 150 ≤ 400.
    expect(fitBoardMaxSize(0.5, 400, 300)).toBe(300);
    // feeding it back yields a box-fitting size.
    expect(fitBoardArt(1, 2, 300)).toEqual({ width: 150, height: 300 });
  });

  it('portrait bounded by width when the box is too narrow for full height', () => {
    // aspect 0.5, box 100×300 → width caps it: maxSize = 100 / 0.5 = 200 (< 300).
    expect(fitBoardMaxSize(0.5, 100, 300)).toBe(200);
    expect(fitBoardArt(1, 2, 200)).toEqual({ width: 100, height: 200 });
  });

  it('landscape bounded by width when the box is short enough', () => {
    // aspect 2, box 300×400 → width-bound 300, derived height 150 ≤ 400.
    expect(fitBoardMaxSize(2, 300, 400)).toBe(300);
  });

  it('landscape bounded by height when the box is too short for full width', () => {
    // aspect 2, box 300×100 → height caps it: maxSize = 100 * 2 = 200 (< 300).
    expect(fitBoardMaxSize(2, 300, 100)).toBe(200);
    expect(fitBoardArt(2, 1, 200)).toEqual({ width: 200, height: 100 });
  });

  it('square fills the smaller box dimension', () => {
    expect(fitBoardMaxSize(1, 320, 460)).toBe(320);
    expect(fitBoardMaxSize(1, 460, 320)).toBe(320);
  });

  it('degenerate aspect falls back to the smaller box edge', () => {
    expect(fitBoardMaxSize(Number.POSITIVE_INFINITY, 320, 460)).toBe(320);
    expect(fitBoardMaxSize(0, 320, 460)).toBe(320);
    expect(fitBoardMaxSize(-1, 460, 320)).toBe(320);
    expect(fitBoardMaxSize(Number.NaN, 200, 500)).toBe(200);
  });
});
