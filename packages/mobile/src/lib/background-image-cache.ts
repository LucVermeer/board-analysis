import { File, Directory, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';
import type { BoardName } from '@boardsesh/shared-schema';
import { getBoardRenderData } from './board-details';
import { BOARD_BACKGROUND_ASSETS } from './board-backgrounds-manifest';

const bgCacheDir = new Directory(Paths.document, 'board-backgrounds');

/**
 * Transform a full-size image URL to its thumbnail variant.
 * The server stores thumbnails under a `thumbs/` subdirectory
 * with .webp extension instead of .png.
 *
 * Example:
 *   .../product_sizes_layouts_sets/36-1.png
 *   -> .../product_sizes_layouts_sets/thumbs/36-1.webp
 */
export function getThumbnailImageUrl(fullImageUrl: string): string {
  const lastSlash = fullImageUrl.lastIndexOf('/');
  if (lastSlash < 0) return fullImageUrl;
  const directory = fullImageUrl.substring(0, lastSlash);
  const filename = fullImageUrl.substring(lastSlash + 1);
  const webpFilename = filename.replace(/\.png$/, '.webp');
  return `${directory}/thumbs/${webpFilename}`;
}

export function extractFilename(imageUrl: string): string {
  return imageUrl.split('/').pop() ?? '';
}

/**
 * Strip the file:// scheme prefix from a URI to produce a plain
 * filesystem path. Native image decoders (BitmapFactory.decodeFile,
 * UIImage(contentsOfFile:)) expect paths, not URIs.
 */
export function toFilesystemPath(fileUri: string): string {
  return fileUri.replace(/^file:\/\//, '');
}

/**
 * Dedupe concurrent downloads of the same URL. Multiple thumbnails on
 * screen at the same time share their background images; without this,
 * every visible row would issue an independent download for the same file.
 */
const inflightDownloads = new Map<string, Promise<string | null>>();

/**
 * Track directories we've already ensured exist this session. expo-file-system's
 * .exists is a syscall — without this, every thumbnail render restats the same
 * board-backgrounds/<board>/<quality> tree.
 */
const ensuredDirs = new Set<string>();

function ensureDir(dir: Directory): void {
  if (ensuredDirs.has(dir.uri)) return;
  if (!dir.exists) {
    dir.create();
  }
  ensuredDirs.add(dir.uri);
}

/**
 * Apply the same .png -> .webp rewrite the bundled-asset manifest uses,
 * so the network-download fallback path also fetches the smaller .webp
 * variant (the server has both side by side).
 */
function preferredFullQualityUrl(imageUrl: string): string {
  return imageUrl.replace(/\.png$/, '.webp');
}

/**
 * Map a backgound image URL to a key in the bundled-assets manifest.
 * The manifest keys are URL suffixes after `/images/` — e.g. the URL
 * `https://www.boardsesh.com/images/kilter/product_sizes_layouts_sets/36-1.png`
 * becomes `kilter/product_sizes_layouts_sets/36-1.webp` (for full quality,
 * rewrite .png to .webp since we only bundle WebPs; for thumbnail quality
 * the URL is already .webp via getThumbnailImageUrl).
 * Returns null if the URL doesn't contain `/images/` (shouldn't happen
 * for URLs produced by getBoardRenderData).
 */
function manifestKeyFromUrl(url: string, quality: 'thumbnail' | 'full'): string | null {
  const marker = '/images/';
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const suffix = url.substring(idx + marker.length);
  return quality === 'full' ? suffix.replace(/\.png$/, '.webp') : suffix;
}

/**
 * Resolve a manifest entry to a filesystem path. For bundled assets in
 * production builds, expo-asset's downloadAsync is a no-op local
 * materialize and returns instantly with no network. In dev mode the
 * asset is initially exposed as an http://localhost:8081 URL served by
 * Metro — downloadAsync materializes it to FileSystem.cacheDirectory
 * so the native compositor's UIImage(contentsOfFile:) /
 * BitmapFactory.decodeFile have a real path to read.
 *
 * Returns null if we can't get a usable file:// URI — the caller falls
 * back to the network-download path.
 */
async function resolveBundledAsset(manifestKey: string): Promise<string | null> {
  const moduleId = BOARD_BACKGROUND_ASSETS[manifestKey];
  if (moduleId === undefined) return null;
  try {
    const asset = Asset.fromModule(moduleId);
    // Always call downloadAsync (idempotent) so a dev-mode http:// localUri
    // is replaced with a file:// path materialized to disk.
    if (!asset.localUri || !asset.localUri.startsWith('file://')) {
      await asset.downloadAsync();
    }
    if (!asset.localUri || !asset.localUri.startsWith('file://')) {
      return null;
    }
    return toFilesystemPath(asset.localUri);
  } catch {
    return null;
  }
}

/**
 * Ensure all background images for a board configuration are cached locally.
 * `quality: 'thumbnail'` downloads small webp variants (fast, for list rows);
 * `quality: 'full'` downloads the original full-size images (sharp, for play view).
 * The two qualities live in separate subdirs so they don't collide.
 * Returns an array of local filesystem paths usable by the native renderer.
 */
export async function ensureBackgroundsCached(params: {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: number[];
  quality?: 'thumbnail' | 'full';
}): Promise<string[]> {
  const quality = params.quality ?? 'thumbnail';
  const renderData = getBoardRenderData(params);
  if (!renderData) return [];

  ensureDir(bgCacheDir);
  const boardDir = new Directory(bgCacheDir, params.boardName);
  ensureDir(boardDir);
  const qualityDir = new Directory(boardDir, quality);
  ensureDir(qualityDir);

  const localPaths: string[] = [];

  for (const imageUrl of renderData.imageUrls) {
    const downloadUrl =
      quality === 'thumbnail' ? getThumbnailImageUrl(imageUrl) : preferredFullQualityUrl(imageUrl);

    // Prefer the bundled asset when one exists for this URL — no network
    // hit and no expo-file-system disk cache needed.
    const manifestKey = manifestKeyFromUrl(downloadUrl, quality);
    if (manifestKey) {
      const bundledPath = await resolveBundledAsset(manifestKey);
      if (bundledPath) {
        localPaths.push(bundledPath);
        continue;
      }
    }

    // Manifest miss (new board the bundle doesn't know about) — fall
    // through to the legacy network-download path with on-disk cache.
    const filename = extractFilename(downloadUrl);
    const localFile = new File(qualityDir, filename);

    if (localFile.exists) {
      localPaths.push(toFilesystemPath(localFile.uri));
      continue;
    }

    const existingDownload = inflightDownloads.get(downloadUrl);
    if (existingDownload) {
      const inflightPath = await existingDownload;
      if (inflightPath) localPaths.push(inflightPath);
      continue;
    }

    const downloadPromise = (async () => {
      try {
        const downloaded = await File.downloadFileAsync(downloadUrl, localFile);
        return downloaded ? toFilesystemPath(downloaded.uri) : null;
      } catch {
        return null;
      }
    })();

    inflightDownloads.set(downloadUrl, downloadPromise);
    try {
      const downloadedPath = await downloadPromise;
      if (downloadedPath) localPaths.push(downloadedPath);
    } finally {
      inflightDownloads.delete(downloadUrl);
    }
  }

  return localPaths;
}
