import { useEffect, useState, useRef } from 'react';
import type { BoardName } from '@boardsesh/shared-schema';
import { HOLD_STATE_MAP } from '@boardsesh/board-constants/hold-states';
import { getBoardRenderData } from '../lib/board-details';
import { ensureBackgroundsCached } from '../lib/background-image-cache';
import { buildThumbnailUrl } from '../lib/thumbnail-url';

type NativeThumbnailParams = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  /** Output PNG width in pixels. Defaults to 200 (thumbnail). */
  outputWidth?: number;
  /** Background image quality to download + composite. Defaults to 'thumbnail'. */
  backgroundQuality?: 'thumbnail' | 'full';
};

// Note: no `mirrored` here. Callers (ClimbListThumbnail, BoardImageNative)
// flip with a CSS scaleX(-1) so a single cached PNG serves both
// orientations. If we ever need true Rust-side mirroring (e.g. for an
// export pipeline that doesn't go through <Image>), thread it back in
// AND propagate to configBase.mirrored — don't just re-add the cache
// key suffix, that desyncs the cache from what gets rendered.

type NativeThumbnailResult = {
  uri: string;
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

/** Test-only handle to the in-flight map. Not part of the public API. */
export const _inflightRendersForTests = inflightRenders;

/** Memoize board render configs to avoid re-computing hold positions */
const boardConfigCache = new Map<
  string,
  {
    configBase: Record<string, unknown>;
    setIdsArray: number[];
  }
>();

/** Bump when the Rust renderer output format changes */
const RENDERER_VERSION = 1;

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
  outputWidth: number = 200,
  backgroundQuality: 'thumbnail' | 'full' = 'thumbnail',
): string {
  const framesHash = fnv1aHex(frames);
  const sizeTag = outputWidth === 200 ? '' : `_w${outputWidth}`;
  const qualityTag = backgroundQuality === 'thumbnail' ? '' : `_${backgroundQuality}`;
  return `v${RENDERER_VERSION}_${boardName}_${layoutId}_${sizeId}_${setIds}_${framesHash}${sizeTag}${qualityTag}`;
}

function getBoardConfig(
  boardName: BoardName,
  layoutId: number,
  sizeId: number,
  setIds: string,
  outputWidth: number,
) {
  // outputWidth is baked into the cached config object (it sets the Rust
  // renderer's pixel dimensions), so it has to be part of the cache key.
  const configKey = `${boardName}-${layoutId}-${sizeId}-${setIds}-${outputWidth}`;
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

  // `thumbnail: true` switches the Rust renderer to a thicker, filled style
  // tuned for tiny output. At full-size play-view dimensions the same style
  // would look too heavy, so flip it off whenever the output is large.
  const isThumbnailStyle = outputWidth <= 320;

  const configBase = {
    board_width: renderData.boardWidth,
    board_height: renderData.boardHeight,
    output_width: outputWidth,
    thumbnail: isThumbnailStyle,
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
    // available" — the hook's fallback path takes over.
    renderModule = loaded?.boardRendererNative ? loaded : null;
  } catch {
    renderModule = null;
  }
  return renderModule;
}

/**
 * The URI the hook starts with on first render and stays on when the
 * native renderer is unavailable (Expo Go, dev build without Rust libs,
 * native render failure). Exported so the fallback contract can be unit
 * tested without spinning up a React render — the hook itself just
 * calls this to seed useState.
 *
 * Always returns the thumbnail URL, even when the requested render is
 * full-quality. Rationale: the play view's drawer opens with this URI
 * showing in <Image> for the ~200–500ms while the native renderer
 * encodes and writes the full-size PNG. The thumbnail URL was already
 * fetched by the list view and is in expo-image's memory+disk cache,
 * so it displays instantly. Falling back to buildFullRenderUrl instead
 * would trigger a fresh server fetch (multi-second) — defeating the
 * point of having a native renderer at all.
 */
export function getServerFallbackUri(params: NativeThumbnailParams): string {
  const { frames, boardName, layoutId, sizeId, setIds } = params;
  return buildThumbnailUrl({ boardName, layoutId, sizeId, setIds, frames });
}

/**
 * Hook that attempts native (Rust + platform compositor) thumbnail
 * rendering, falling back to the server URL when the native module
 * is unavailable or the render fails.
 */
export function useNativeThumbnail(params: NativeThumbnailParams): NativeThumbnailResult {
  const { frames, boardName, layoutId, sizeId, setIds } = params;
  const outputWidth = params.outputWidth ?? 200;
  const backgroundQuality = params.backgroundQuality ?? 'thumbnail';
  const serverUrl = getServerFallbackUri(params);

  // Track the native render output keyed by cacheKey. Storing the key
  // alongside the URI means a prop change instantly invalidates the
  // previous render (cache key no longer matches the requested one), and
  // the returned URI falls back to the fresh serverUrl until the new
  // render completes. Without this, props could change and the hook
  // would keep showing the previous climb's PNG for one frame (or
  // forever, in the no-native-module path).
  const [nativeRender, setNativeRender] = useState<{ key: string; uri: string } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currentCacheKey = buildCacheKey(
    boardName,
    layoutId,
    sizeId,
    setIds,
    frames,
    outputWidth,
    backgroundQuality,
  );

  useEffect(() => {
    const nativeModule = getNativeModule();
    if (!nativeModule) return;

    const boardConfig = getBoardConfig(boardName, layoutId, sizeId, setIds, outputWidth);
    if (!boardConfig) return;

    const renderPromise = getOrStartInflightRender(currentCacheKey, async () => {
      const backgroundPaths = await ensureBackgroundsCached({
        boardName,
        layoutId,
        sizeId,
        setIds: boardConfig.setIdsArray,
        quality: backgroundQuality,
      });

      const configJson = JSON.stringify({
        ...boardConfig.configBase,
        frames,
      });

      return nativeModule.renderComposite(configJson, backgroundPaths, currentCacheKey);
    });

    renderPromise
      .then((fileUri) => {
        if (mountedRef.current) setNativeRender({ key: currentCacheKey, uri: fileUri });
      })
      .catch(() => {
        // Native render failed -- the derived display URI stays on serverUrl
      });
  }, [currentCacheKey, frames, boardName, layoutId, sizeId, setIds, outputWidth, backgroundQuality]);

  // Only return the native URI if it matches the *current* cache key —
  // a stale render (from before a prop change) would otherwise show.
  const uri = nativeRender?.key === currentCacheKey ? nativeRender.uri : serverUrl;
  return { uri };
}
