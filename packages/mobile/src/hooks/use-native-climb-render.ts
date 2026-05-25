import { useEffect, useState, useRef } from 'react';
import { Directory, Paths } from 'expo-file-system';
import type { BoardName } from '@boardsesh/shared-schema';
import { HOLD_STATE_MAP } from '@boardsesh/board-constants/hold-states';
import { getBoardRenderData } from '../lib/board-details';
import { ensureBackgroundsCached, tryGetBackgroundPathsSync } from '../lib/background-image-cache';

/**
 * Inputs to the native climb renderer. Just the climb identity — no
 * render-size or quality knobs. The hook always renders at the board's
 * native pixel dimensions (from getBoardRenderData) and the consuming
 * <Image> scales it down via contentFit="contain" for small surfaces
 * like the list thumbnail.
 *
 * Note: no `mirrored` here. Callers (ClimbListThumbnail, BoardImageNative)
 * flip with a CSS scaleX(-1) so a single cached PNG serves both
 * orientations. If we ever need true Rust-side mirroring (e.g. for an
 * export pipeline that doesn't go through <Image>), thread it back in
 * AND propagate to configBase.mirrored — don't just re-add the cache
 * key suffix, that desyncs the cache from what gets rendered.
 */
type NativeClimbRenderParams = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
};

type NativeClimbRenderResult = {
  /**
   * file:// URI of the holds-only PNG, or null until the Rust render
   * completes (or forever if the native module is unavailable, e.g.
   * Expo Go). Consumers stack this on top of `backgroundPaths`.
   */
  overlayUri: string | null;
  /**
   * Filesystem paths (no scheme) of the bundled board background images.
   * Returned synchronously when bundled-asset paths are already
   * materialized (production builds), empty array otherwise (dev mode
   * before downloadAsync has run, or manifest miss).
   */
  backgroundPaths: string[];
};

/**
 * Deduplicate concurrent renders for the same cache key. Entries
 * self-delete via `.finally` when the underlying render settles, so under
 * normal usage the map only holds a handful of in-flight promises at any
 * moment. The hard cap is defence against a pathological burst (e.g. a
 * huge list scrolled before any render completes) leaving stale entries
 * if components unmount mid-render.
 */
const inflightRenders = new Map<string, Promise<string>>();
const INFLIGHT_RENDERS_MAX = 50;

const BOARD_CONFIG_CACHE_MAX = 20;

/**
 * Synchronous lookup of already-rendered overlay PNGs keyed by cache key.
 * Populated when (a) any successful render completes, and (b) on first
 * module import we scan the on-disk cache directory to surface PNGs from
 * prior app sessions.
 *
 * This is the mechanism that makes drawer-open instant after the list
 * has scrolled past a climb: the hook's useState initial value reads
 * from this map, so a cache hit displays the overlay on the very first
 * render with no useEffect-driven update.
 */
const renderedOverlays = new Map<string, string>();

/**
 * One-time eager scan of the native module's PNG cache directory. The
 * Swift/Kotlin modules write to {cache}/board-thumbnails/<cacheKey>.png;
 * we list it once at JS startup and populate `renderedOverlays` so prior
 * sessions' renders are sync-hit-available without waiting for the
 * native bridge round-trip.
 *
 * Skips quietly if the directory doesn't exist yet (clean install, first
 * launch). Wrapped in try/catch because filesystem failures here are
 * non-fatal — worst case the hook does the async render on first call.
 */
const CACHE_DIR_NAME = 'board-thumbnails';
let warmupRun = false;

function warmupRenderedOverlaysOnce(): void {
  if (warmupRun) return;
  warmupRun = true;
  try {
    const cacheDir = new Directory(Paths.cache, CACHE_DIR_NAME);
    if (!cacheDir.exists) return;
    for (const entry of cacheDir.list()) {
      if (!('uri' in entry) || typeof entry.uri !== 'string') continue;
      // Files only — skip subdirectories. expo-file-system returns
      // File and Directory instances; File has a .name like "<key>.png".
      const name = (entry as { name?: string }).name;
      if (!name || !name.endsWith('.png')) continue;
      const cacheKey = name.slice(0, -'.png'.length);
      renderedOverlays.set(cacheKey, entry.uri);
    }
  } catch {
    // Filesystem errors at startup shouldn't break the app — the hook's
    // render path will repopulate the map as climbs are viewed.
  }
}

/**
 * Look up an in-flight render by cache key, or start a new one. Exposed
 * (alongside _inflightRendersForTests) so the dedup + cap contract can be
 * unit tested without spinning up a React renderer.
 */
export function getOrStartInflightRender(
  cacheKey: string,
  startRender: () => Promise<string>,
): Promise<string> {
  const existing = inflightRenders.get(cacheKey);
  if (existing) return existing;

  // Evict the oldest entry before inserting so we never grow past the
  // cap, even briefly.
  if (inflightRenders.size >= INFLIGHT_RENDERS_MAX) {
    const oldestKey = inflightRenders.keys().next().value;
    if (oldestKey !== undefined) {
      inflightRenders.delete(oldestKey);
    }
  }

  const promise = startRender();
  inflightRenders.set(cacheKey, promise);
  // Run cleanup as a detached handler so it doesn't change the promise
  // returned to callers, and so callers that only attach .then can still
  // observe rejections.
  void promise
    .finally(() => {
      inflightRenders.delete(cacheKey);
    })
    .catch(() => {
      // Swallow — the original promise's rejection is observed by the
      // caller. This catch only exists to prevent the .finally chain
      // from generating an unhandled rejection.
    });
  return promise;
}

/** Test-only handles. Not part of the public API. */
export const _inflightRendersForTests = inflightRenders;
export const _renderedOverlaysForTests = renderedOverlays;

/** Memoize board render configs to avoid re-computing hold positions */
const boardConfigCache = new Map<
  string,
  {
    configBase: Record<string, unknown>;
    setIdsArray: number[];
  }
>();

/**
 * Bump when the Rust renderer output format changes. v2 marks the
 * switch from composited PNGs (backgrounds baked in) to overlay-only
 * PNGs (transparent background, holds only) — old v1 files in the
 * cache directory are stale and the layered RN component would
 * double-paint backgrounds if it loaded them.
 */
const RENDERER_VERSION = 2;

/**
 * FNV-1a 32-bit hash, returned as 8-char hex. Used to keep the cache
 * filename bounded — long climbs can produce frame strings hundreds of
 * chars long, and both iOS and Android cap filenames at 255 bytes.
 * Non-cryptographic; collision risk for our domain (bounded JSON-ish
 * input) is negligible.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let charIndex = 0; charIndex < input.length; charIndex++) {
    hash ^= input.charCodeAt(charIndex);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildCacheKey(
  boardName: string,
  layoutId: number,
  sizeId: number,
  setIds: string,
  frames: string,
): string {
  const framesHash = fnv1aHex(frames);
  return `v${RENDERER_VERSION}_${boardName}_${layoutId}_${sizeId}_${setIds}_${framesHash}`;
}

function getBoardConfig(boardName: BoardName, layoutId: number, sizeId: number, setIds: string) {
  const configKey = `${boardName}-${layoutId}-${sizeId}-${setIds}`;
  const cached = boardConfigCache.get(configKey);
  if (cached) return cached;

  const setIdsArray = setIds.split(',').map(Number).filter(Boolean);
  const renderData = getBoardRenderData({ boardName, layoutId, sizeId, setIds: setIdsArray });
  if (!renderData) return null;

  // Build hold_state_map in the format the Rust renderer expects:
  // Record<number, { color: string, render_style?: string }>
  const stateMap = HOLD_STATE_MAP[boardName];
  const holdStateMap: Record<number, { color: string; render_style?: string }> = {};
  for (const [codeStr, stateInfo] of Object.entries(stateMap)) {
    holdStateMap[Number(codeStr)] = {
      color: stateInfo.color,
      ...(stateInfo.renderStyle ? { render_style: stateInfo.renderStyle } : {}),
    };
  }

  // Always render at the board's native width with the "full"-style hold
  // rendering (thinner stroke, no fill). The list view scales the result
  // down via contentFit="contain"; at 64×64 the thin stroke is still
  // ~2.7px wide so holds remain visible.
  const configBase = {
    board_width: renderData.boardWidth,
    board_height: renderData.boardHeight,
    output_width: renderData.boardWidth,
    thumbnail: false,
    holds: renderData.holdsData.map((hold) => ({
      id: hold.id,
      mirroredHoldId: hold.mirroredHoldId,
      cx: hold.cx,
      cy: hold.cy,
      r: hold.r,
    })),
    hold_state_map: holdStateMap,
  };

  // Evict oldest entry when the cache exceeds the cap
  if (boardConfigCache.size >= BOARD_CONFIG_CACHE_MAX) {
    const oldestKey = boardConfigCache.keys().next().value;
    if (oldestKey !== undefined) {
      boardConfigCache.delete(oldestKey);
    }
  }

  const boardConfig = { configBase, setIdsArray };
  boardConfigCache.set(configKey, boardConfig);
  return boardConfig;
}

/**
 * Lazy-load the native module wrapper. The wrapper uses
 * requireOptionalNativeModule under the hood so missing-binary
 * scenarios (Expo Go, dev client built before the module landed)
 * return null silently rather than logging a JS error.
 *
 * We still wrap require() in a try/catch as belt-and-braces in case
 * the module file itself fails to evaluate for some other reason
 * (e.g. transitive import error during a hot reload).
 */
let renderModule: typeof import('../../modules/board-renderer/src/index') | null = null;
let moduleLoadAttempted = false;

function getNativeModule() {
  if (moduleLoadAttempted) return renderModule;
  moduleLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('../../modules/board-renderer/src/index') as typeof renderModule;
    // The wrapper exposes `boardRendererNative` which is null when the
    // native binary isn't loaded. Treat that as "no native renderer
    // available" — the hook returns a null overlayUri and the component
    // shows backgrounds only.
    renderModule = loaded?.boardRendererNative ? loaded : null;
  } catch {
    renderModule = null;
  }
  return renderModule;
}

/**
 * Hook that drives the layered climb image: bundled backgrounds plus a
 * native-rendered holds-only PNG overlaid on top. Always renders at the
 * board's native dimensions; consumers fit/scale via expo-image. No
 * server URLs — if the native module is missing, `overlayUri` stays null
 * and the component shows backgrounds alone.
 */
export function useNativeClimbRender(params: NativeClimbRenderParams): NativeClimbRenderResult {
  const { frames, boardName, layoutId, sizeId, setIds } = params;

  // Run the disk-cache scan once per JS context. Safe to call on every
  // render — the function self-guards via `warmupRun`.
  warmupRenderedOverlaysOnce();

  const currentCacheKey = buildCacheKey(boardName, layoutId, sizeId, setIds, frames);

  // Seed both pieces of state synchronously so the first paint already
  // shows whatever's available. Backgrounds in production are usually
  // available on the first frame (Asset.localUri pre-populated); the
  // overlay is available if a previous render in this session — or a
  // prior app launch — produced its file.
  const [nativeRender, setNativeRender] = useState<{ key: string; uri: string } | null>(() => {
    const existing = renderedOverlays.get(currentCacheKey);
    return existing ? { key: currentCacheKey, uri: existing } : null;
  });
  const [backgroundPaths, setBackgroundPaths] = useState<string[]>(
    () => tryGetBackgroundPathsSync({ boardName, layoutId, sizeId, setIds: setIds.split(',').map(Number).filter(Boolean) }) ?? [],
  );

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Background-paths effect: if the sync path returned empty (dev mode,
  // or the asset module hadn't loaded yet), do the async resolve and
  // update state. In production this typically no-ops because the sync
  // seed already populated.
  useEffect(() => {
    if (backgroundPaths.length > 0) return;
    let cancelled = false;
    void (async () => {
      const setIdsArray = setIds.split(',').map(Number).filter(Boolean);
      const resolved = await ensureBackgroundsCached({ boardName, layoutId, sizeId, setIds: setIdsArray });
      if (!cancelled && mountedRef.current && resolved.length > 0) {
        setBackgroundPaths(resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-resolve only when the climb's board config changes. backgroundPaths
    // is intentionally excluded from deps: it's the state this effect *sets*,
    // and including it would re-trigger the effect every time the resolve
    // populates the paths (causing an infinite loop in the empty-resolve case).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardName, layoutId, sizeId, setIds]);

  // Overlay-render effect: kick off the native render if we don't already
  // have one for this cache key in the sync map.
  useEffect(() => {
    if (renderedOverlays.has(currentCacheKey)) {
      // Sync map already has it — make sure local state reflects that
      // (covers prop changes mid-mount that pick up a previously rendered
      // overlay).
      const uri = renderedOverlays.get(currentCacheKey);
      if (uri && nativeRender?.key !== currentCacheKey) {
        setNativeRender({ key: currentCacheKey, uri });
      }
      return;
    }

    const nativeModule = getNativeModule();
    if (!nativeModule) return;

    const boardConfig = getBoardConfig(boardName, layoutId, sizeId, setIds);
    if (!boardConfig) return;

    const renderPromise = getOrStartInflightRender(currentCacheKey, () => {
      const configJson = JSON.stringify({
        ...boardConfig.configBase,
        frames,
      });
      return nativeModule.renderHoldsOverlay(configJson, currentCacheKey);
    });

    renderPromise
      .then((fileUri) => {
        renderedOverlays.set(currentCacheKey, fileUri);
        if (mountedRef.current) setNativeRender({ key: currentCacheKey, uri: fileUri });
      })
      .catch((error: unknown) => {
        // Native render failed -- overlay stays null, backgrounds still show.
        // Surface the cause in Metro logs so we can diagnose; without this
        // the silent catch masked every binary/ABI mismatch behind a blank
        // overlay layer.
        // eslint-disable-next-line no-console
        console.warn(
          `[useNativeClimbRender] render failed for ${currentCacheKey}:`,
          error instanceof Error ? error.message : String(error),
        );
      });
    // nativeRender is intentionally excluded from deps: this effect *sets* it,
    // and the only meaningful re-trigger is a cacheKey change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCacheKey, frames, boardName, layoutId, sizeId, setIds]);

  // Only surface the native URI if it matches the *current* cache key —
  // a stale render (from before a prop change) would otherwise show.
  const overlayUri = nativeRender?.key === currentCacheKey ? nativeRender.uri : null;
  return { overlayUri, backgroundPaths };
}
