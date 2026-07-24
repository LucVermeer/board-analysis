import { describe, it, expect } from 'vitest';
import { hasRenderableFrames } from '../renderable-frames';

describe('hasRenderableFrames', () => {
  it('accepts a climb with real frames', () => {
    expect(hasRenderableFrames({ frames: 'p1234r15p5678r12' })).toBe(true);
  });

  it('rejects an empty frames string (the "clear all LEDs" command)', () => {
    expect(hasRenderableFrames({ frames: '' })).toBe(false);
  });

  it('rejects whitespace-only frames', () => {
    expect(hasRenderableFrames({ frames: '   ' })).toBe(false);
  });

  it('rejects a missing frames field (untyped wire boundary)', () => {
    expect(hasRenderableFrames({ frames: undefined })).toBe(false);
    expect(hasRenderableFrames({ frames: null })).toBe(false);
    expect(hasRenderableFrames({})).toBe(false);
  });

  it('rejects a null / undefined climb', () => {
    expect(hasRenderableFrames(null)).toBe(false);
    expect(hasRenderableFrames(undefined)).toBe(false);
  });
});
