import { describe, it, expect } from 'vitest';
import { MIN_SCALE, MAX_SCALE, ZOOM_THRESHOLD } from '@boardsesh/play-view';

// clampTranslation is a worklet — importing it pulls in react-native-reanimated
// which doesn't resolve in vitest. Re-declare the pure function here for testing.
function clampTranslation(
  translationX: number,
  translationY: number,
  currentScale: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number } {
  if (currentScale <= 1) return { x: 0, y: 0 };

  const maxX = (containerWidth * (currentScale - 1)) / 2;
  const maxY = (containerHeight * (currentScale - 1)) / 2;

  return {
    x: Math.max(-maxX, Math.min(maxX, translationX)),
    y: Math.max(-maxY, Math.min(maxY, translationY)),
  };
}

describe('clampTranslation', () => {
  const containerWidth = 400;
  const containerHeight = 600;

  it('returns zero translation when scale is 1', () => {
    const result = clampTranslation(100, 200, 1, containerWidth, containerHeight);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('returns zero translation when scale is below 1', () => {
    const result = clampTranslation(50, 50, 0.5, containerWidth, containerHeight);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('allows translation within bounds at 2x zoom', () => {
    // At 2x on a 400px container, maxX = (400 * (2-1)) / 2 = 200
    // At 2x on a 600px container, maxY = (600 * (2-1)) / 2 = 300
    const result = clampTranslation(100, 150, 2, containerWidth, containerHeight);
    expect(result).toEqual({ x: 100, y: 150 });
  });

  it('clamps translation exceeding positive bounds', () => {
    const result = clampTranslation(500, 500, 2, containerWidth, containerHeight);
    expect(result.x).toBe(200);
    expect(result.y).toBe(300);
  });

  it('clamps translation exceeding negative bounds', () => {
    const result = clampTranslation(-500, -500, 2, containerWidth, containerHeight);
    expect(result.x).toBe(-200);
    expect(result.y).toBe(-300);
  });

  it('scales max bounds with zoom level', () => {
    // At 4x: maxX = (400 * 3) / 2 = 600, maxY = (600 * 3) / 2 = 900
    const result = clampTranslation(600, 900, 4, containerWidth, containerHeight);
    expect(result).toEqual({ x: 600, y: 900 });

    const overResult = clampTranslation(700, 1000, 4, containerWidth, containerHeight);
    expect(overResult).toEqual({ x: 600, y: 900 });
  });

  it('handles zero container dimensions', () => {
    const result = clampTranslation(10, 10, 2, 0, 0);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('handles negative translation symmetrically to positive', () => {
    const positive = clampTranslation(150, 250, 2, containerWidth, containerHeight);
    const negative = clampTranslation(-150, -250, 2, containerWidth, containerHeight);
    expect(positive.x).toBe(-negative.x);
    expect(positive.y).toBe(-negative.y);
  });
});

describe('zoom constants', () => {
  it('MIN_SCALE is 1', () => {
    expect(MIN_SCALE).toBe(1);
  });

  it('MAX_SCALE is 4', () => {
    expect(MAX_SCALE).toBe(4);
  });

  it('ZOOM_THRESHOLD is slightly above 1 for hysteresis', () => {
    expect(ZOOM_THRESHOLD).toBeGreaterThan(1);
    expect(ZOOM_THRESHOLD).toBeLessThan(1.1);
  });

  it('ZOOM_THRESHOLD is between MIN_SCALE and MAX_SCALE', () => {
    expect(ZOOM_THRESHOLD).toBeGreaterThan(MIN_SCALE);
    expect(ZOOM_THRESHOLD).toBeLessThan(MAX_SCALE);
  });
});

describe('focal point zoom math', () => {
  it('zooming at center produces no translation shift', () => {
    const containerW = 400;
    const containerH = 600;
    const focalX = containerW / 2;
    const focalY = containerH / 2;
    const savedScale = 1;
    const newScale = 2;

    const focalOffsetX = focalX - containerW / 2;
    const focalOffsetY = focalY - containerH / 2;
    const scaleDelta = newScale / savedScale;
    const newTranslateX = 0 + focalOffsetX * (1 - scaleDelta);
    const newTranslateY = 0 + focalOffsetY * (1 - scaleDelta);

    expect(newTranslateX).toBe(0);
    expect(newTranslateY).toBe(0);
  });

  it('zooming at top-left corner shifts content toward center', () => {
    const containerW = 400;
    const containerH = 600;
    const focalX = 0;
    const focalY = 0;
    const savedScale = 1;
    const newScale = 2;

    const focalOffsetX = focalX - containerW / 2; // -200
    const focalOffsetY = focalY - containerH / 2; // -300
    const scaleDelta = newScale / savedScale; // 2
    const newTranslateX = 0 + focalOffsetX * (1 - scaleDelta); // -200 * -1 = 200
    const newTranslateY = 0 + focalOffsetY * (1 - scaleDelta); // -300 * -1 = 300

    expect(newTranslateX).toBe(200);
    expect(newTranslateY).toBe(300);
  });

  it('zooming at bottom-right corner shifts opposite direction', () => {
    const containerW = 400;
    const containerH = 600;
    const focalX = 400;
    const focalY = 600;
    const savedScale = 1;
    const newScale = 2;

    const focalOffsetX = focalX - containerW / 2; // 200
    const focalOffsetY = focalY - containerH / 2; // 300
    const scaleDelta = newScale / savedScale;
    const newTranslateX = 0 + focalOffsetX * (1 - scaleDelta); // 200 * -1 = -200
    const newTranslateY = 0 + focalOffsetY * (1 - scaleDelta); // 300 * -1 = -300

    expect(newTranslateX).toBe(-200);
    expect(newTranslateY).toBe(-300);
  });
});
