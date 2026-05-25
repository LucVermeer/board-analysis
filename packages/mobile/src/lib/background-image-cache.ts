import { Asset } from 'expo-asset';
import type { BoardName } from '@boardsesh/shared-schema';
import { getBoardRenderData } from './board-details';
import { BOARD_BACKGROUND_ASSETS } from './board-backgrounds-manifest';

/**
 * Strip the file:// scheme prefix from a URI to produce a plain
 * filesystem path. Native image decoders (BitmapFactory.decodeFile,
 * UIImage(contentsOfFile:)) expect paths, not URIs; `<Image source={uri}>`
 * accepts either.
 */
export function toFilesystemPath(fileUri: string): string {
  return fileUri.replace(/^file:\/\//, '');
}

/**
 * Map a background image URL produced by getBoardRenderData (always .png
 * suffix, served from the web public/ tree) to the manifest key. The
 * manifest only stores .webp variants — full-quality webp is what we
 * bundle into the IPA/APK for every board background. Thumb-quality
 * variants used to exist but were dropped when the renderer switched to
 * "one PNG per climb" rendered at native board width.
 *
 * Manifest keys are URL suffixes after `/images/`, e.g.
 * `kilter/product_sizes_layouts_sets/36-1.webp`.
 */
function manifestKeyFromUrl(url: string): string | null {
  const marker = '/images/';
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.substring(idx + marker.length).replace(/\.png$/, '.webp');
}

/**
 * Resolved bundled-asset paths, keyed by manifest key. Populated by both
 * the sync fast-path (production builds where Asset.localUri is set as
 * soon as the asset module loads) and the async resolution path (dev
 * builds where Metro serves assets over HTTP and downloadAsync() must
 * materialize them to disk first).
 */
const resolvedPaths = new Map<string, string>();

/**
 * Manifest keys we've already warned about, so a missing bundle entry
 * logs once instead of once per render.
 */
const warnedMissingKeys = new Set<string>();

function warnMissing(manifestKey: string, reason: string): void {
  if (warnedMissingKeys.has(manifestKey)) return;
  warnedMissingKeys.add(manifestKey);
  // eslint-disable-next-line no-console
  console.warn(
    `[background-image-cache] No bundled asset for "${manifestKey}" (${reason}). ` +
      `Re-run scripts/sync-mobile-board-backgrounds.sh after adding the file under packages/web/public/images/.`,
  );
}

/**
 * Sync lookup for a single background. Returns a plain filesystem path
 * if the bundled asset is already materialized (either via a prior call
 * or because the production bundle pre-populates Asset.localUri), null
 * otherwise.
 *
 * In production builds, `Asset.fromModule(id).localUri` is set
 * synchronously once the asset module is first referenced — the file is
 * already inside the IPA/APK bundle, no download needed. In dev builds
 * Metro serves the asset over http://localhost:8081 and downloadAsync()
 * must run first; until that happens, this returns null and the caller
 * falls back to the async path.
 */
function tryResolveBundledPathSync(manifestKey: string): string | null {
  const cached = resolvedPaths.get(manifestKey);
  if (cached) return cached;

  const moduleId = BOARD_BACKGROUND_ASSETS[manifestKey];
  if (moduleId === undefined) return null;

  try {
    const asset = Asset.fromModule(moduleId);
    if (asset.localUri && asset.localUri.startsWith('file://')) {
      const path = toFilesystemPath(asset.localUri);
      resolvedPaths.set(manifestKey, path);
      return path;
    }
  } catch {
    // Asset module not yet loaded — fall through.
  }
  return null;
}

/**
 * Async resolve a single background. In production this is effectively
 * sync (Asset.localUri is pre-populated, downloadAsync is a no-op). In
 * dev mode this does the Metro HTTP fetch + disk write that turns an
 * http://localhost:8081 URL into a real file:// path.
 *
 * Returns null on manifest miss or resolution failure.
 */
async function resolveBundledPathAsync(manifestKey: string): Promise<string | null> {
  const cached = resolvedPaths.get(manifestKey);
  if (cached) return cached;

  const moduleId = BOARD_BACKGROUND_ASSETS[manifestKey];
  if (moduleId === undefined) {
    warnMissing(manifestKey, 'no manifest entry');
    return null;
  }

  try {
    const asset = Asset.fromModule(moduleId);
    if (!asset.localUri || !asset.localUri.startsWith('file://')) {
      await asset.downloadAsync();
    }
    if (!asset.localUri || !asset.localUri.startsWith('file://')) {
      warnMissing(manifestKey, 'downloadAsync did not produce a file:// URI');
      return null;
    }
    const path = toFilesystemPath(asset.localUri);
    resolvedPaths.set(manifestKey, path);
    return path;
  } catch (error) {
    warnMissing(manifestKey, `Asset resolution threw: ${(error as Error).message}`);
    return null;
  }
}

type BackgroundParams = {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: number[];
};

/**
 * Result of a background lookup. `paths` is the list of filesystem paths
 * that successfully resolved; `missingCount` is the number of expected
 * background layers that did NOT resolve (manifest miss or asset
 * resolution failure). Callers must use `missingCount` to render visible
 * placeholder gaps — silently dropping a layer would hide bugs where a
 * new board has been added to the schema but not yet bundled. Per the
 * no-network rule there is no server fallback; broken must be visible.
 *
 * Returns null when `getBoardRenderData` itself fails (unknown board /
 * layout combo) — caller has no expected layer count to fall back on.
 */
export type BackgroundLookupResult = {
  paths: string[];
  missingCount: number;
};

/**
 * Sync lookup for all background paths for a given board config.
 * Returns paths + missingCount when render data is available, null when
 * render data itself is missing. A non-null result with missingCount > 0
 * means some layers were not bundled — callers must visibly fill those
 * gaps. Callers (the hook's useState initializer) use this so the
 * placeholder layer can render with backgrounds visible on the very
 * first frame in production.
 */
export function tryGetBackgroundPathsSync(params: BackgroundParams): BackgroundLookupResult | null {
  const renderData = getBoardRenderData(params);
  if (!renderData) return null;

  const paths: string[] = [];
  let missingCount = 0;
  for (const imageUrl of renderData.imageUrls) {
    const manifestKey = manifestKeyFromUrl(imageUrl);
    if (!manifestKey) {
      missingCount++;
      continue;
    }
    const path = tryResolveBundledPathSync(manifestKey);
    if (!path) {
      // Sync miss: could be a true manifest miss OR just the dev-mode
      // case where Asset.localUri isn't populated yet. The async path
      // will surface true misses with the right count; sync's job here
      // is to surface "anything not ready yet" so the hook knows to do
      // the async pass. Treat as missing for now.
      missingCount++;
      continue;
    }
    paths.push(path);
  }
  return { paths, missingCount };
}

/**
 * Async resolve all background paths for a given board config. Materializes
 * any not-yet-resolved bundled assets (dev mode), then returns the full
 * set plus missingCount. A missingCount > 0 means a manifest entry was
 * absent or asset resolution failed — callers MUST render a visible gap
 * per missing layer instead of silently treating the partial result as
 * complete. Returns null only when `getBoardRenderData` is itself
 * missing (unknown board).
 */
export async function ensureBackgroundsCached(
  params: BackgroundParams,
): Promise<BackgroundLookupResult | null> {
  const renderData = getBoardRenderData(params);
  if (!renderData) return null;

  const paths: string[] = [];
  let missingCount = 0;
  for (const imageUrl of renderData.imageUrls) {
    const manifestKey = manifestKeyFromUrl(imageUrl);
    if (!manifestKey) {
      missingCount++;
      continue;
    }
    const path = await resolveBundledPathAsync(manifestKey);
    if (path) {
      paths.push(path);
    } else {
      missingCount++;
    }
  }
  return { paths, missingCount };
}
