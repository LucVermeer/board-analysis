import { describe, it, expect } from 'vitest';
import {
  computePeekOffset,
  decideSwipeDirection,
  evaluateSwipeOutcome,
  selectPeekDirection,
  getEnterDirection,
  computeCardRotation,
  computeThrowDroop,
  computeStackedCardScale,
  computeStackedCardOpacity,
  computeStackedCardRise,
  computeThrowExitTarget,
  CARD_THROW_MAX_ROTATION_DEG,
  CARD_THROW_DROOP,
  CARD_THROW_OFFSCREEN_PAD,
  STACKED_CARD_MIN_SCALE,
  STACKED_CARD_MIN_OPACITY,
  STACKED_CARD_RISE,
  SWIPE_THRESHOLD,
  DIRECTION_THRESHOLD,
} from '../swipe-carousel';

describe('computePeekOffset', () => {
  it('clamps the next-peek to 0 when finger has not moved', () => {
    expect(computePeekOffset({ direction: 'next', swipeOffset: 0, viewportWidth: 400 })).toBe(400);
  });

  it('slides the next-peek in from the right as the finger drags left', () => {
    expect(computePeekOffset({ direction: 'next', swipeOffset: -150, viewportWidth: 400 })).toBe(250);
  });

  it('never lets the next-peek overshoot past the viewport edge', () => {
    expect(computePeekOffset({ direction: 'next', swipeOffset: -800, viewportWidth: 400 })).toBe(0);
  });

  it('slides the prev-peek in from the left as the finger drags right', () => {
    expect(computePeekOffset({ direction: 'prev', swipeOffset: 150, viewportWidth: 400 })).toBe(-250);
  });

  it('never lets the prev-peek overshoot past the viewport edge', () => {
    expect(computePeekOffset({ direction: 'prev', swipeOffset: 800, viewportWidth: 400 })).toBe(0);
  });

  // Regression: before the viewport is measured (width 0) both peeks resolve to
  // translateX 0 — i.e. stacked directly on the current label. Consumers must not
  // render the peek slots until width > 0 (the `canPeek` guard in useQueueCarousel),
  // or the queue bar shows several climbs' text overlapping. See ClimbCapsule.
  it('collapses both peeks onto the current label when the viewport is unmeasured', () => {
    expect(computePeekOffset({ direction: 'next', swipeOffset: 0, viewportWidth: 0 })).toBe(0);
    expect(computePeekOffset({ direction: 'prev', swipeOffset: 0, viewportWidth: 0 })).toBe(0);
  });
});

describe('decideSwipeDirection', () => {
  it('returns null while neither axis exceeds the threshold', () => {
    expect(decideSwipeDirection(5, 5)).toBeNull();
    expect(decideSwipeDirection(DIRECTION_THRESHOLD, DIRECTION_THRESHOLD)).toBeNull();
  });

  it('locks to horizontal when |dx| dominates past the threshold', () => {
    expect(decideSwipeDirection(20, 5)).toBe('horizontal');
    expect(decideSwipeDirection(-25, 4)).toBe('horizontal');
  });

  it('locks to vertical when |dy| dominates past the threshold', () => {
    expect(decideSwipeDirection(5, 20)).toBe('vertical');
    expect(decideSwipeDirection(-3, -30)).toBe('vertical');
  });

  it('honours a custom threshold', () => {
    expect(decideSwipeDirection(25, 5, 30)).toBeNull();
    expect(decideSwipeDirection(40, 5, 30)).toBe('horizontal');
  });
});

describe('evaluateSwipeOutcome', () => {
  it('returns next when swipe-left exceeds threshold and canNext is true', () => {
    expect(evaluateSwipeOutcome({ deltaX: -100, canNext: true, canPrev: true })).toBe('next');
  });

  it('returns previous when swipe-right exceeds threshold and canPrev is true', () => {
    expect(evaluateSwipeOutcome({ deltaX: 100, canNext: true, canPrev: true })).toBe('previous');
  });

  it('cancels when threshold is not met', () => {
    expect(evaluateSwipeOutcome({ deltaX: -SWIPE_THRESHOLD + 1, canNext: true, canPrev: true })).toBe('cancel');
    expect(evaluateSwipeOutcome({ deltaX: SWIPE_THRESHOLD - 1, canNext: true, canPrev: true })).toBe('cancel');
  });

  it('cancels when navigation in the requested direction is blocked', () => {
    expect(evaluateSwipeOutcome({ deltaX: -200, canNext: false, canPrev: true })).toBe('cancel');
    expect(evaluateSwipeOutcome({ deltaX: 200, canNext: true, canPrev: false })).toBe('cancel');
  });

  it('honours a custom threshold', () => {
    expect(evaluateSwipeOutcome({ deltaX: -50, canNext: true, canPrev: true, threshold: 40 })).toBe('next');
    expect(evaluateSwipeOutcome({ deltaX: -30, canNext: true, canPrev: true, threshold: 40 })).toBe('cancel');
  });
});

describe('selectPeekDirection', () => {
  it('locks to next when an exit-left animation is in flight', () => {
    expect(selectPeekDirection({ animationDirection: 'left', swipeOffset: 0 })).toBe('next');
  });

  it('locks to prev when an exit-right animation is in flight', () => {
    expect(selectPeekDirection({ animationDirection: 'right', swipeOffset: 0 })).toBe('prev');
  });

  it('falls back to the live offset sign during an active drag', () => {
    expect(selectPeekDirection({ animationDirection: null, swipeOffset: -10 })).toBe('next');
    expect(selectPeekDirection({ animationDirection: null, swipeOffset: 10 })).toBe('prev');
  });

  it('treats an idle gesture (offset 0) as previous', () => {
    expect(selectPeekDirection({ animationDirection: null, swipeOffset: 0 })).toBe('prev');
  });
});

describe('getEnterDirection', () => {
  it('maps next-navigation to from-right (new climb enters from the right)', () => {
    expect(getEnterDirection('next')).toBe('from-right');
  });

  it('maps previous-navigation to from-left', () => {
    expect(getEnterDirection('previous')).toBe('from-left');
  });
});

describe('computeCardRotation', () => {
  it('is flat when the finger has not moved', () => {
    expect(computeCardRotation(0, 400)).toBe(0);
  });

  it('tracks the drag linearly within the board bounds', () => {
    expect(computeCardRotation(80, 400)).toBeCloseTo(4.8, 5);
    expect(computeCardRotation(-80, 400)).toBeCloseTo(-4.8, 5);
  });

  it('clamps to ±MAX once the linear tilt would exceed it, while on screen', () => {
    // 300 * 0.06 = 18, clamped to 12; |300| <= boardWidth so no extra spin.
    expect(computeCardRotation(300, 400)).toBe(CARD_THROW_MAX_ROTATION_DEG);
    expect(computeCardRotation(-300, 400)).toBe(-CARD_THROW_MAX_ROTATION_DEG);
  });

  it('whips further than MAX once the card flies past the board edge', () => {
    const past = computeCardRotation(500, 400); // base 12 + (100 * 0.06) = 18
    expect(past).toBeGreaterThan(CARD_THROW_MAX_ROTATION_DEG);
    expect(computeCardRotation(600, 400)).toBeGreaterThan(past);
  });

  it('is sign-symmetric', () => {
    expect(computeCardRotation(-220, 380)).toBeCloseTo(-computeCardRotation(220, 380), 5);
    expect(computeCardRotation(-700, 380)).toBeCloseTo(-computeCardRotation(700, 380), 5);
  });

  it('adds no extra spin before layout (boardWidth 0)', () => {
    // Falls back to the clamped linear tilt; never the past-edge branch.
    expect(computeCardRotation(800, 0)).toBe(CARD_THROW_MAX_ROTATION_DEG);
  });
});

describe('computeThrowDroop', () => {
  it('does not droop while the card is still within the board box', () => {
    expect(computeThrowDroop(0, 400)).toBe(0);
    expect(computeThrowDroop(300, 400)).toBe(0);
    expect(computeThrowDroop(-400, 400)).toBe(0);
  });

  it('grows past the edge and caps at CARD_THROW_DROOP a board-width beyond', () => {
    expect(computeThrowDroop(600, 400)).toBeCloseTo(CARD_THROW_DROOP * 0.5, 5);
    expect(computeThrowDroop(800, 400)).toBe(CARD_THROW_DROOP);
    expect(computeThrowDroop(2000, 400)).toBe(CARD_THROW_DROOP);
  });

  it('returns 0 before layout (boardWidth 0)', () => {
    expect(computeThrowDroop(500, 0)).toBe(0);
  });
});

describe('computeStackedCardScale', () => {
  it('rests at the min scale and reaches 1 at the threshold', () => {
    expect(computeStackedCardScale(0)).toBe(STACKED_CARD_MIN_SCALE);
    expect(computeStackedCardScale(1)).toBe(1);
  });

  it('interpolates and stays monotonic', () => {
    expect(computeStackedCardScale(0.5)).toBeCloseTo(0.96, 5);
    expect(computeStackedCardScale(0.25)).toBeLessThan(computeStackedCardScale(0.75));
  });

  it('clamps out-of-range progress', () => {
    expect(computeStackedCardScale(-1)).toBe(STACKED_CARD_MIN_SCALE);
    expect(computeStackedCardScale(2)).toBe(1);
  });
});

describe('computeStackedCardOpacity', () => {
  it('rests at the min opacity and reaches 1 at the threshold', () => {
    expect(computeStackedCardOpacity(0)).toBe(STACKED_CARD_MIN_OPACITY);
    expect(computeStackedCardOpacity(1)).toBe(1);
    expect(computeStackedCardOpacity(0.5)).toBeCloseTo(0.8, 5);
  });
});

describe('computeStackedCardRise', () => {
  it('starts raised and sinks into place by the threshold', () => {
    expect(computeStackedCardRise(0)).toBe(STACKED_CARD_RISE);
    expect(computeStackedCardRise(1)).toBe(0);
  });
});

describe('computeThrowExitTarget', () => {
  it('targets the screen width plus the off-screen pad', () => {
    expect(computeThrowExitTarget(390)).toBe(390 + CARD_THROW_OFFSCREEN_PAD);
  });
});
