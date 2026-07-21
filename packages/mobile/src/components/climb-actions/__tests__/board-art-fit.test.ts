import { describe, it, expect } from 'vitest';
import { fitBoardArt, fitBoardMaxSize, computeReactionBoardMaxSize } from '../board-art-fit';

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

describe('computeReactionBoardMaxSize', () => {
  // Approximate the reaction menu's reserves at fontScale 1: a 3-button row (~110),
  // a 56pt title reserve, and 46pt list rows. Screen-size + item count vary per case.
  const ROW = 46;
  function boardFor(
    windowWidth: number,
    windowHeight: number,
    items: number,
    { insetTop = 0, insetBottom = 0, aspect = 1 }: { insetTop?: number; insetBottom?: number; aspect?: number } = {},
  ): number {
    return computeReactionBoardMaxSize({
      windowWidth,
      windowHeight,
      insetTop,
      insetBottom,
      contentTopOffset: Math.round(windowHeight * 0.02),
      sectionGap: 20,
      sideMargin: 24,
      previewMaxWidth: 400,
      aspect,
      primaryRowHeight: 110,
      listContentHeight: items * ROW + 4,
      textReserve: 56,
      rowHeight: ROW,
    });
  }

  it('renders the climb smaller as the screen gets smaller (same list)', () => {
    const proMax = boardFor(440, 956, 4, { insetTop: 59, insetBottom: 34 });
    const pro = boardFor(393, 852, 4, { insetTop: 59, insetBottom: 34 });
    const se = boardFor(375, 667, 4, { insetTop: 20 });
    const smallest = boardFor(320, 568, 4, { insetTop: 20 });
    expect(proMax).toBeGreaterThan(pro);
    expect(pro).toBeGreaterThan(se);
    expect(se).toBeGreaterThan(smallest);
  });

  it('stays within the width cap and the window-height fraction', () => {
    const board = boardFor(393, 852, 6, { insetTop: 59, insetBottom: 34 });
    expect(board).toBeLessThanOrEqual(852 * 0.55);
    expect(board).toBeLessThanOrEqual(393 - 24 * 2); // square board bounded by width
  });

  it('shrinks the climb toward the floor when a small screen has a long list', () => {
    // 11 actions on an SE-sized screen: the board yields so the list can scroll.
    const board = boardFor(375, 667, 11, { insetTop: 20 });
    expect(board).toBeLessThanOrEqual(145);
    expect(board).toBeGreaterThan(0);
  });

  it('never goes negative, even on a cramped landscape viewport', () => {
    const board = boardFor(852, 375, 10, { insetBottom: 21 });
    expect(board).toBeGreaterThanOrEqual(0);
  });

  it('lets a portrait board grow taller than a square one on the same screen', () => {
    const square = boardFor(393, 852, 4, { insetTop: 59, insetBottom: 34, aspect: 1 });
    const portrait = boardFor(393, 852, 4, { insetTop: 59, insetBottom: 34, aspect: 0.6 });
    expect(portrait).toBeGreaterThanOrEqual(square);
  });
});
