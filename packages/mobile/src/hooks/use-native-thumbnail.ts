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
  mirrored?: boolean;
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

export function buildCacheKey(
  boardName: string,
  layoutId: number,
  sizeId: number,
  setIds: string,
  frames: string,
  mirrored: boolean,
): string {
  return `v${RENDERER_VERSION}_${boardName}_${layoutId}_${sizeId}_${setIds}_${frames}${mirrored ? '_m' : ''}`;
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

  const configBase = {
    board_width: renderData.boardWidth,
    board_height: renderData.boardHeight,
    output_width: 200,
    thumbnail: true,
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
  const serverUrl = buildThumbnailUrl({ boardName, layoutId, sizeId, setIds, frames });
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

    const boardConfig = getBoardConfig(boardName, layoutId, sizeId, setIds);
    if (!boardConfig) return;

    const cacheKey = buildCacheKey(boardName, layoutId, sizeId, setIds, frames, mirrored ?? false);

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
  }, [frames, boardName, layoutId, sizeId, setIds, mirrored, serverUrl]);

  return { uri };
}
