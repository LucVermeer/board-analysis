import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const {
  buildCacheKey,
  getServerFallbackUri,
  getOrStartInflightRender,
  _inflightRendersForTests,
} = await import('../use-native-thumbnail');

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

  it('returns the thumbnail server URL', () => {
    expect(getServerFallbackUri(baseParams)).toBe(
      'https://server.test/thumb?frames=p1r42',
    );
  });

  it('returns the thumbnail URL even when backgroundQuality is "full"', () => {
    // The play view's drawer opens showing this URI while the native
    // full-render is in progress. The thumbnail URL is already in
    // expo-image's cache from the list view, so it shows instantly;
    // using the full-quality server URL would trigger a multi-second
    // fresh fetch that defeats the point of native rendering.
    expect(getServerFallbackUri({ ...baseParams, backgroundQuality: 'full' })).toBe(
      'https://server.test/thumb?frames=p1r42',
    );
  });
});

// The dedup + cap contract was extracted into a plain helper specifically
// so it can be tested without a working React renderer. The hook-level
// pieces that still need React (mountedRef guard, setState after settle)
// are covered by manual QA on device — the @testing-library/react +
// jsdom + bun-resolved React 19 combo currently produces a null
// dispatcher for useState.
describe('getOrStartInflightRender', () => {
  beforeEach(() => {
    _inflightRendersForTests.clear();
  });

  it('starts a render and returns its promise on first call', async () => {
    const startRender = vi.fn().mockResolvedValue('file:///out/a.png');
    const result = await getOrStartInflightRender('key-a', startRender);
    expect(result).toBe('file:///out/a.png');
    expect(startRender).toHaveBeenCalledTimes(1);
  });

  it('reuses the in-flight promise instead of starting a second render', async () => {
    let resolveFn: ((value: string) => void) | undefined;
    const startRender = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFn = resolve;
        }),
    );

    const first = getOrStartInflightRender('key-a', startRender);
    const second = getOrStartInflightRender('key-a', startRender);

    expect(first).toBe(second);
    expect(startRender).toHaveBeenCalledTimes(1);

    resolveFn?.('file:///out/a.png');
    expect(await first).toBe('file:///out/a.png');
  });

  it('removes the entry once the render settles successfully', async () => {
    await getOrStartInflightRender('key-a', () => Promise.resolve('file:///out/a.png'));
    // Drain microtasks so the .finally cleanup runs.
    await Promise.resolve();
    await Promise.resolve();
    expect(_inflightRendersForTests.has('key-a')).toBe(false);
  });

  it('removes the entry when the render rejects, without surfacing as unhandled', async () => {
    const promise = getOrStartInflightRender('key-a', () =>
      Promise.reject(new Error('render failed')),
    );
    // Caller is expected to handle the rejection — match the hook's
    // .catch(() => {}) pattern.
    await expect(promise).rejects.toThrow('render failed');
    await Promise.resolve();
    expect(_inflightRendersForTests.has('key-a')).toBe(false);
  });

  it('evicts the oldest entry when the cap is reached', async () => {
    // Each render hangs forever so entries stay in the map and we can
    // observe the cap behaviour. INFLIGHT_RENDERS_MAX = 50 in the module.
    const neverResolves = () => new Promise<string>(() => {});

    for (let entryIndex = 0; entryIndex < 50; entryIndex++) {
      getOrStartInflightRender(`key-${entryIndex}`, neverResolves);
    }
    expect(_inflightRendersForTests.size).toBe(50);
    expect(_inflightRendersForTests.has('key-0')).toBe(true);

    // Inserting one more should evict key-0 (insertion order = oldest).
    getOrStartInflightRender('key-50', neverResolves);
    expect(_inflightRendersForTests.size).toBe(50);
    expect(_inflightRendersForTests.has('key-0')).toBe(false);
    expect(_inflightRendersForTests.has('key-50')).toBe(true);
  });
});
