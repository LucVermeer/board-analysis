import { describe, it, expect, vi, beforeEach } from 'vitest';

// expo-file-system: stub Directory/Paths so the eager warm-up's
// `new Directory(Paths.cache, 'board-thumbnails').list()` runs without
// hitting a real filesystem. The default mock returns an empty list.
// Entries expose a `delete` spy so the warm-up's opportunistic cleanup
// of stale-version PNGs can be observed.
type MockEntry = { uri: string; name: string; delete: ReturnType<typeof vi.fn> };
const directoryListSpy = vi.fn<() => MockEntry[]>(() => []);
class MockDirectory {
  uri: string;
  exists = true;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  }
  list = () => directoryListSpy();
}
function makeMockEntry(name: string): MockEntry {
  return { uri: `file:///mock/cache/board-thumbnails/${name}`, name, delete: vi.fn() };
}
vi.mock('expo-file-system', () => ({
  Directory: MockDirectory,
  Paths: { cache: { uri: '/mock/cache' } },
}));

vi.mock('../../lib/board-details', () => ({
  getBoardRenderData: () => null,
}));

vi.mock('../../lib/background-image-cache', () => ({
  // Match the new BackgroundLookupResult shape: `null` means
  // getBoardRenderData itself failed; an object with `paths` +
  // `missingCount` is returned otherwise. The default mock simulates the
  // "render data missing" path used by the existing buildCacheKey /
  // inflight-render tests.
  ensureBackgroundsCached: vi.fn().mockResolvedValue(null),
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
  buildBoardKey,
  getOrStartInflightRender,
  _inflightRendersForTests,
  _renderedOverlaysForTests,
  _resetWarmupForTests,
  _runWarmupForTests,
} = await import('../use-native-climb-render');

describe('buildCacheKey', () => {
  it('hashes the frames component so the key fits in a filename', () => {
    const key = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43');
    // v<version>_<style>_w<width>_<board>_<layout>_<size>_<sets>_<8-hex-hash>
    // style defaults to 's' (stroke-only / non-filled); width defaults to
    // 'full' (native board width, used by the play view).
    expect(key).toMatch(/^v\d+_s_wfull_kilter_1_10_24,25_[0-9a-f]{8}$/);
  });

  it('defaults to the full-width token and switches to a numeric token when renderWidth is set', () => {
    // Small surfaces pass a renderWidth so the overlay is rasterized small;
    // the token keeps that PNG separate from the play view's native-width
    // one, so neither is reused at the wrong resolution.
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).toMatch(/_wfull_/);
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42', false, 400)).toMatch(/_w400_/);
  });

  it('produces distinct keys for the small and full overlay widths', () => {
    const full = buildCacheKey('kilter', 1, 10, '24', 'p1r42', true);
    const small = buildCacheKey('kilter', 1, 10, '24', 'p1r42', true, 400);
    expect(small).not.toBe(full);
  });

  it('uses RENDERER_VERSION v2 to invalidate v1 composited PNGs', () => {
    // v1 produced backgrounds-baked-in PNGs; v2 produces transparent
    // holds-only overlays. The version prefix guarantees no v1 file is
    // reused as a v2 overlay (which would double-paint backgrounds).
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).toMatch(/^v2_/);
  });

  it('uses a distinct style token so filled (list) and stroke (play view) never collide', () => {
    // The list thumbnail renders the filled hold style; the full-size play
    // view renders stroke-only. They share board/layout/size/sets/frames, so
    // without the style token they would map to one PNG and whichever
    // rendered first would win. The token keeps them as separate cache slots.
    const stroke = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42', false);
    const filled = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42', true);
    expect(filled).not.toBe(stroke);
    expect(stroke).toMatch(/^v\d+_s_/);
    expect(filled).toMatch(/^v\d+_f_/);
  });

  it('produces different keys for different frames', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).not.toBe(buildCacheKey('kilter', 1, 10, '24', 'p2r43'));
  });

  it('produces different keys for different boards', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).not.toBe(buildCacheKey('tension', 1, 10, '24', 'p1r42'));
  });

  it('is deterministic', () => {
    const keyA = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43');
    const keyB = buildCacheKey('kilter', 1, 10, '24,25', 'p1r42p2r43');
    expect(keyA).toBe(keyB);
  });

  it('does not collide on similar parameter values', () => {
    expect(buildCacheKey('kilter', 1, 10, '24', 'p1r42')).not.toBe(buildCacheKey('kilter', 11, 0, '24', 'p1r42'));
  });

  it('produces a bounded-length key for very long frame strings', () => {
    // iOS/Android cap filenames at 255 bytes; a busy climb's frames string can
    // grow well past that without hashing.
    const longFrames = 'p1234r42'.repeat(500);
    const key = buildCacheKey('kilter', 1, 10, '24', longFrames);
    expect(key.length).toBeLessThan(64);
  });

  it('canonicalizes setIds so equivalent set orderings share a cache key', () => {
    // '25,24' and '24,25' describe the same set selection — they must hash
    // to the same key so we don't double-render and double-cache the same
    // climb. The canonical form is ascending numeric.
    expect(buildCacheKey('kilter', 1, 10, '24,25', 'p1r42')).toBe(buildCacheKey('kilter', 1, 10, '25,24', 'p1r42'));
  });

  it('drops zero/empty setId entries during canonicalization', () => {
    // Mirrors getBoardConfig's split(',').map(Number).filter(Boolean) so the
    // cache key matches the config the renderer actually uses.
    expect(buildCacheKey('kilter', 1, 10, '0,24,25', 'p1r42')).toBe(buildCacheKey('kilter', 1, 10, '24,25', 'p1r42'));
  });
});

// The background-paths state in useNativeClimbRender is keyed by
// buildBoardKey so a FlashList row recycle (same hook instance, new
// props) can't surface the previous climb's paths. We can't easily
// exercise the React state through the hook without a renderer, but we
// can lock in the key-shape contract — that's the gate the hook uses to
// decide "is this stored entry for the current climb's board?"
describe('buildBoardKey', () => {
  it('is identical for the same board config regardless of frames', () => {
    // Two climbs on the same board/layout/size/setIds must share a
    // boardKey so the hook doesn't needlessly re-resolve backgrounds
    // when a list row recycles to a different climb on the same board.
    expect(buildBoardKey('kilter', 1, 10, '24,25')).toBe(buildBoardKey('kilter', 1, 10, '24,25'));
  });

  it('differs when boardName changes', () => {
    expect(buildBoardKey('kilter', 1, 10, '24,25')).not.toBe(buildBoardKey('tension', 1, 10, '24,25'));
  });

  it('differs when layoutId changes', () => {
    expect(buildBoardKey('kilter', 1, 10, '24,25')).not.toBe(buildBoardKey('kilter', 2, 10, '24,25'));
  });

  it('differs when sizeId changes', () => {
    expect(buildBoardKey('kilter', 1, 10, '24,25')).not.toBe(buildBoardKey('kilter', 1, 11, '24,25'));
  });

  it('differs when setIds changes', () => {
    expect(buildBoardKey('kilter', 1, 10, '24,25')).not.toBe(buildBoardKey('kilter', 1, 10, '26,27'));
  });

  it('does not collide on similar numeric values', () => {
    // Without a separator, "1-10" and "11-0" would both serialise to
    // "110". Guard against any regression that drops the dashes.
    expect(buildBoardKey('kilter', 1, 10, '24')).not.toBe(buildBoardKey('kilter', 11, 0, '24'));
  });

  it('differs by variant so a recycled row cannot mix thumb and full paths', () => {
    // A FlashList row recycled between a thumb context (list) and a full
    // context must re-resolve, not surface the previous size's paths.
    expect(buildBoardKey('kilter', 1, 10, '24', 'thumb')).not.toBe(buildBoardKey('kilter', 1, 10, '24', 'full'));
  });

  it('defaults to the full variant', () => {
    expect(buildBoardKey('kilter', 1, 10, '24')).toBe(buildBoardKey('kilter', 1, 10, '24', 'full'));
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
    const promise = getOrStartInflightRender('key-a', () => Promise.reject(new Error('render failed')));
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
  beforeEach(() => {
    _resetWarmupForTests();
    directoryListSpy.mockReset();
  });

  it('exposes the populated map so a fresh hook init can hit it synchronously', () => {
    expect(_renderedOverlaysForTests).toBeInstanceOf(Map);
    _renderedOverlaysForTests.set('v2_kilter_1_10_24_deadbeef', 'file:///prior/session.png');
    expect(_renderedOverlaysForTests.get('v2_kilter_1_10_24_deadbeef')).toBe('file:///prior/session.png');
    _renderedOverlaysForTests.delete('v2_kilter_1_10_24_deadbeef');
  });

  it('only loads PNGs whose name starts with the current RENDERER_VERSION prefix', () => {
    // Mix of v1 leftovers from a previous app session and current v2
    // entries. The warm-up should only surface v2 keys; v1 keys would
    // never match any cacheKey lookup (all current keys are v2_*) so
    // loading them just bloats memory.
    const v1Entry = makeMockEntry('v1_kilter_1_10_24_aaaaaaaa.png');
    const v2EntryA = makeMockEntry('v2_kilter_1_10_24_bbbbbbbb.png');
    const v2EntryB = makeMockEntry('v2_tension_2_8_15_cccccccc.png');
    const v1Other = makeMockEntry('v1_tension_2_8_15_dddddddd.png');
    directoryListSpy.mockReturnValue([v1Entry, v2EntryA, v2EntryB, v1Other]);

    _runWarmupForTests();

    expect(_renderedOverlaysForTests.has('v2_kilter_1_10_24_bbbbbbbb')).toBe(true);
    expect(_renderedOverlaysForTests.has('v2_tension_2_8_15_cccccccc')).toBe(true);
    expect(_renderedOverlaysForTests.has('v1_kilter_1_10_24_aaaaaaaa')).toBe(false);
    expect(_renderedOverlaysForTests.has('v1_tension_2_8_15_dddddddd')).toBe(false);
    // Only the two v2 entries should be present — no stragglers from
    // future-version PNGs slipping in either.
    expect(_renderedOverlaysForTests.size).toBe(2);
  });

  it('opportunistically deletes stale-version PNG files to reclaim disk', () => {
    const v1Entry = makeMockEntry('v1_kilter_1_10_24_aaaaaaaa.png');
    const v2Entry = makeMockEntry('v2_kilter_1_10_24_bbbbbbbb.png');
    directoryListSpy.mockReturnValue([v1Entry, v2Entry]);

    _runWarmupForTests();

    expect(v1Entry.delete).toHaveBeenCalledTimes(1);
    // Current-version files must never be deleted — they're the cache hits
    // the warm-up exists to surface.
    expect(v2Entry.delete).not.toHaveBeenCalled();
  });

  it('keeps loading remaining entries when a delete throws', () => {
    // A delete failure (permissions, file-already-gone race) must not abort
    // the warm-up walk: we'd lose every current-version hit that follows.
    const v1Entry = makeMockEntry('v1_kilter_1_10_24_aaaaaaaa.png');
    v1Entry.delete.mockImplementation(() => {
      throw new Error('EACCES');
    });
    const v2Entry = makeMockEntry('v2_kilter_1_10_24_bbbbbbbb.png');
    directoryListSpy.mockReturnValue([v1Entry, v2Entry]);

    expect(() => _runWarmupForTests()).not.toThrow();
    expect(_renderedOverlaysForTests.has('v2_kilter_1_10_24_bbbbbbbb')).toBe(true);
  });
});
