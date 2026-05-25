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

vi.mock('../../lib/thumbnail-url', () => ({
  buildThumbnailUrl: ({ frames }: { frames: string }) =>
    `https://server.test/thumb?frames=${frames}`,
  buildFullRenderUrl: ({ frames }: { frames: string }) =>
    `https://server.test/full?frames=${frames}`,
}));

// Simulate the Expo Go / dev-build-without-Rust-libs case: requireNativeModule
// throws. The hook's try/catch around require() should swallow this so the
// initial server URL stays as-is.
vi.mock('../../../modules/board-renderer/src/index', () => {
  throw new Error('Native module not available (simulated Expo Go)');
});

const { buildCacheKey, getServerFallbackUri } = await import('../use-native-thumbnail');

describe('buildCacheKey', () => {
  it('hashes the frames component so the key fits in a filename', () => {
    const key = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43');
    // v<version>_<board>_<layout>_<size>_<sets>_<8-hex-hash>
    expect(key).toMatch(/^v\d+_kilter_1_10_24,25_[0-9a-f]{8}$/);
  });

  it('produces different keys for different frames', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).not.toBe(
      buildCacheKey('kilter', 1, 10, '24', 'p2r43'),
    );
  });

  it('produces different keys for different boards', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).not.toBe(
      buildCacheKey('tension', 1, 10, '24', 'p1r42'),
    );
  });

  it('produces different keys for different output widths', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42', 200)).not.toBe(
      buildCacheKey('kilter', 1, 10, '24', 'p1r42', 800),
    );
  });

  it('produces different keys for different background qualities', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42', 200, 'thumbnail')).not.toBe(
      buildCacheKey('kilter', 1, 10, '24', 'p1r42', 200, 'full'),
    );
  });

  it('is deterministic', () => {
    const keyA = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43');
    const keyB = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43');
    expect(keyA).toBe(keyB);
  });

  it('does not collide on similar parameter values', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).not.toBe(
      buildCacheKey('kilter', 11, 0, '24', 'p1r42'),
    );
  });

  it('produces a bounded-length key for very long frame strings', () => {
    // iOS/Android cap filenames at 255 bytes; a busy climb's frames string can
    // grow well past that without hashing.
    const longFrames = 'p1234r42'.repeat(500);
    const key = buildCacheKey('kilter', 1, 10, '24', longFrames);
    expect(key.length).toBeLessThan(64);
  });

  it('includes a version prefix', () => {
    const key = buildCacheKey('kilter', 1, 10, '24', 'p1r42');
    expect(key).toMatch(/^v\d+_/);
  });
});

// Verifies the Expo Go / no-native-module fallback contract. The hook
// seeds useState with getServerFallbackUri's result and only ever
// overwrites it from the native render path, so if getNativeModule()
// returns null (require throws — simulated by the vi.mock above), the
// hook's returned uri equals what this function returns.
describe('getServerFallbackUri (Expo Go fallback contract)', () => {
  const baseParams = {
    frames: 'p1r42',
    boardName: 'kilter' as const,
    layoutId: 1,
    sizeId: 10,
    setIds: '24',
  };

  it('defaults to the thumbnail server URL', () => {
    expect(getServerFallbackUri(baseParams)).toBe(
      'https://server.test/thumb?frames=p1r42',
    );
  });

  it('uses the full-render server URL when backgroundQuality is "full"', () => {
    expect(getServerFallbackUri({ ...baseParams, backgroundQuality: 'full' })).toBe(
      'https://server.test/full?frames=p1r42',
    );
  });

  it('uses the thumbnail server URL when backgroundQuality is "thumbnail" explicitly', () => {
    expect(
      getServerFallbackUri({ ...baseParams, backgroundQuality: 'thumbnail' }),
    ).toBe('https://server.test/thumb?frames=p1r42');
  });
});

// Other hook-level behaviors (native render success path, inflight dedup,
// unmount guard) need a working React hook test runner with a single React
// instance — the @testing-library/react + jsdom + bun-resolved React 19
// combo currently produces a null dispatcher for useState. Until that
// setup is sorted out, the dedup contract is exercised at the
// background-image-cache layer in background-image-cache.test.ts; the
// success path is covered by manual QA on device.
