import { describe, it, expect, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    uri = '';
    exists = false;
    static downloadFileAsync = vi.fn();
  },
  Directory: class MockDirectory {
    uri = '';
    exists = false;
    create = vi.fn();
  },
  Paths: { document: '/mock' },
}));

vi.mock('../../lib/board-details', () => ({
  getBoardRenderData: () => null,
}));

vi.mock('../../lib/background-image-cache', () => ({
  ensureBackgroundsCached: vi.fn().mockResolvedValue([]),
}));

const { buildCacheKey } = await import('../use-native-thumbnail');

describe('buildCacheKey', () => {
  it('hashes the frames component so the key fits in a filename', () => {
    const key = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43', false);
    // v<version>_<board>_<layout>_<size>_<sets>_<8-hex-hash>
    expect(key).toMatch(/^v\d+_kilter_1_10_24,25_[0-9a-f]{8}$/);
  });

  it('produces different keys for different frames', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42', false)).not.toBe(
      buildCacheKey('kilter', 1, 10, '24', 'p2r43', false),
    );
  });

  it('produces different keys for mirrored vs non-mirrored', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42', false)).not.toBe(
      buildCacheKey('kilter', 1, 10, '24', 'p1r42', true),
    );
  });

  it('produces different keys for different boards', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42', false)).not.toBe(
      buildCacheKey('tension', 1, 10, '24', 'p1r42', false),
    );
  });

  it('is deterministic', () => {
    const keyA = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43', false);
    const keyB = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43', false);
    expect(keyA).toBe(keyB);
  });

  it('does not collide on similar parameter values', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42', false)).not.toBe(
      buildCacheKey('kilter', 11, 0, '24', 'p1r42', false),
    );
  });

  it('produces a bounded-length key for very long frame strings', () => {
    // iOS/Android cap filenames at 255 bytes; a busy climb's frames string can
    // grow well past that without hashing.
    const longFrames = 'p1234r42'.repeat(500);
    const key = buildCacheKey('kilter', 1, 10, '24', longFrames, false);
    expect(key.length).toBeLessThan(64);
  });

  it('includes a version prefix', () => {
    const key = buildCacheKey('kilter', 1, 10, '24', 'p1r42', false);
    expect(key).toMatch(/^v\d+_/);
  });
});

// Hook-level behavior (native module fallback, render failure fallback,
// inflight dedup, unmount guard) is intentionally not tested here yet:
// the mobile package's vitest setup doesn't have react-dom or a hook
// test runner wired up. The dedup contract is exercised at the
// background-image-cache layer in background-image-cache.test.ts; the
// remaining hook behaviors are covered by manual QA on device.
