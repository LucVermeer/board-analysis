import { describe, it, expect, vi, beforeEach } from 'vitest';

// expo-file-system: stub Directory/Paths so the eager warm-up's
// `new Directory(Paths.cache, 'board-thumbnails').list()` runs without
// hitting a real filesystem. The default mock returns an empty list.
const directoryListSpy = vi.fn<() => Array<{ uri: string; name: string }>>(() => []);
class MockDirectory {
  uri: string;
  exists = true;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  }
  list = () => directoryListSpy();
}
vi.mock('expo-file-system', () => ({
  Directory: MockDirectory,
  Paths: { cache: { uri: '/mock/cache' } },
}));

vi.mock('../../lib/board-details', () => ({
  getBoardRenderData: () => null,
}));

vi.mock('../../lib/background-image-cache', () => ({
  ensureBackgroundsCached: vi.fn().mockResolvedValue([]),
  tryGetBackgroundPathsSync: vi.fn().mockReturnValue(null),
}));

// Simulate the Expo Go / dev-build-without-Rust-libs case: requireNativeModule
// throws. The hook's try/catch around require() should swallow this so
// overlayUri stays null and backgroundPaths is whatever the sync seed got.
vi.mock('../../../modules/board-renderer/src/index', () => {
  throw new Error('Native module not available (simulated Expo Go)');
});

const {
  buildCacheKey,
  getOrStartInflightRender,
  _inflightRendersForTests,
  _renderedOverlaysForTests,
} = await import('../use-native-climb-render');

describe('buildCacheKey', () => {
  it('hashes the frames component so the key fits in a filename', () => {
    const key = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43');
    // v<version>_<board>_<layout>_<size>_<sets>_<8-hex-hash>
    expect(key).toMatch(/^v\d+_kilter_1_10_24,25_[0-9a-f]{8}$/);
  });

  it('does not include output-width or quality suffixes (single PNG per climb)', () => {
    const key = buildCacheKey('kilter', 1, 10, '24', 'p1r42');
    // Old key shape carried _w<n> and _<quality>; the unified renderer
    // produces one PNG per climb so neither belongs in the key.
    expect(key).not.toMatch(/_w\d+/);
    expect(key).not.toMatch(/_(thumbnail|full)/);
  });

  it('uses RENDERER_VERSION v2 to invalidate v1 composited PNGs', () => {
    // v1 produced backgrounds-baked-in PNGs; v2 produces transparent
    // holds-only overlays. The version prefix guarantees no v1 file is
    // reused as a v2 overlay (which would double-paint backgrounds).
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).toMatch(/^v2_/);
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
});

// The dedup + cap contract was extracted into a plain helper specifically
// so it can be tested without a working React renderer. The hook-level
// pieces that still need React (mountedRef guard, setState after settle)
// are covered by manual QA on device.
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

// Verifies the eager warm-up that populates renderedOverlays from the
// on-disk PNG cache. This is what makes a drawer open instantly when the
// PNG already exists from a prior session: useState's initializer reads
// from this map synchronously.
describe('renderedOverlays warm-up from disk cache', () => {
  it('exposes the populated map so a fresh hook init can hit it synchronously', () => {
    // The hook's first import already triggered the warm-up (with our
    // default empty directoryListSpy). Verify the map is reachable for
    // tests that want to pre-seed it.
    expect(_renderedOverlaysForTests).toBeInstanceOf(Map);
    _renderedOverlaysForTests.set('v2_kilter_1_10_24_deadbeef', 'file:///prior/session.png');
    expect(_renderedOverlaysForTests.get('v2_kilter_1_10_24_deadbeef')).toBe(
      'file:///prior/session.png',
    );
    _renderedOverlaysForTests.delete('v2_kilter_1_10_24_deadbeef');
  });
});
