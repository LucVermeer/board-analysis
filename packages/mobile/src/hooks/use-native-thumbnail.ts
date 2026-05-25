import { useEffect, useState, useRef } from 'react';
import type { BoardName } from '@boardsesh/shared-schema';
import { HOLD_STATE_MAP } from '@boardsesh/board-constants/hold-states';
import { getBoardRenderData } from '../lib/board-details';
import { ensureBackgroundsCached } from '../lib/background-image-cache';
import { buildThumbnailUrl, buildFullRenderUrl } from '../lib/thumbnail-url';

type NativeThumbnailParams = {
  frames: string;
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  mirrored?: boolean;
  /** Output PNG width in pixels. Defaults to 200 (thumbnail). */
  outputWidth?: number;
  /** Background image quality to download + composite. Defaults to 'thumbnail'. */
  backgroundQuality?: 'thumbnail' | 'full';
};

type NativeThumbnailResult = {
  uri: string;
};

/** Deduplicate concurrent renders for the same cache key */
const inflightRenders = new Map<string, Promise<string>>();

const BOARD_CONFIG_CACHE_MAX = 20;

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
  mirrored: boolean,
  outputWidth: number = 200,
  backgroundQuality: 'thumbnail' | 'full' = 'thumbnail',
): string {
  const framesHash = fnv1aHex(frames);
  const sizeTag = outputWidth === 200 ? '' : `_w${outputWidth}`;
  const qualityTag = backgroundQuality === 'thumbnail' ? '' : `_${backgroundQuality}`;
  return `v${RENDERER_VERSION}_${boardName}_${layoutId}_${sizeId}_${setIds}_${framesHash}${mirrored ? '_m' : ''}${sizeTag}${qualityTag}`;
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
    mirrored: false,
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
 * Lazy-load the native module. Returns null when running in Expo Go
 * or when the native binary has not been linked (dev builds without
 * the xcframework/jniLibs present).
 */
let renderModule: typeof import('../../modules/board-renderer/src/index') | null = null;
let moduleLoadAttempted = false;

function getNativeModule() {
  if (moduleLoadAttempted) return renderModule;
  moduleLoadAttempted = true;
  try {
    // Dynamic require so Metro does not hard-fail when the native
    // module is absent (e.g. Expo Go, or a build without Rust libs)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    renderModule = require('../../modules/board-renderer/src/index') as typeof renderModule;
  } catch {
    renderModule = null;
  }
  return renderModule;
}

/**
 * Hook that attempts native (Rust + platform compositor) thumbnail
 * rendering, falling back to the server URL when the native module
 * is unavailable or the render fails.
 */
export function useNativeThumbnail(params: NativeThumbnailParams): NativeThumbnailResult {
  const { frames, boardName, layoutId, sizeId, setIds, mirrored } = params;
  const outputWidth = params.outputWidth ?? 200;
  const backgroundQuality = params.backgroundQuality ?? 'thumbnail';
  // Match the fallback URL quality to the requested render quality so the
  // brief pre-native-render frame already looks roughly right (sharp full
  // server render for play view, fast thumbnail for list rows).
  const serverUrl =
    backgroundQuality === 'full'
      ? buildFullRenderUrl({ boardName, layoutId, sizeId, setIds, frames })
      : buildThumbnailUrl({ boardName, layoutId, sizeId, setIds, frames });
  const [uri, setUri] = useState(serverUrl);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nativeModule = getNativeModule();
    if (!nativeModule) {
      setUri(serverUrl);
      return;
    }

    const boardConfig = getBoardConfig(boardName, layoutId, sizeId, setIds, outputWidth);
    if (!boardConfig) return;

    const cacheKey = buildCacheKey(
      boardName,
      layoutId,
      sizeId,
      setIds,
      frames,
      mirrored ?? false,
      outputWidth,
      backgroundQuality,
    );

    // Reuse an in-flight render for the same cache key
    const existingRender = inflightRenders.get(cacheKey);
    if (existingRender) {
      existingRender
        .then((fileUri) => {
          if (mountedRef.current) setUri(fileUri);
        })
        .catch(() => {});
      return;
    }

    const renderPromise = (async () => {
      const backgroundPaths = await ensureBackgroundsCached({
        boardName,
        layoutId,
        sizeId,
        setIds: boardConfig.setIdsArray,
        quality: backgroundQuality,
      });

      const configJson = JSON.stringify({
        ...boardConfig.configBase,
        mirrored: mirrored ?? false,
        frames,
      });

      return nativeModule.renderComposite(configJson, backgroundPaths, cacheKey);
    })();

    inflightRenders.set(cacheKey, renderPromise);

    renderPromise
      .then((fileUri) => {
        if (mountedRef.current) setUri(fileUri);
      })
      .catch(() => {
        // Native render failed -- keep server URL fallback
      })
      .finally(() => {
        inflightRenders.delete(cacheKey);
      });
  }, [frames, boardName, layoutId, sizeId, setIds, mirrored, outputWidth, backgroundQuality, serverUrl]);

  return { uri };
}
