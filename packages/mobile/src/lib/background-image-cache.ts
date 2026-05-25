import { File, Directory, Paths } from 'expo-file-system';
import type { BoardName } from '@boardsesh/shared-schema';
import { getBoardRenderData } from './board-details';

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

  if (!bgCacheDir.exists) {
    bgCacheDir.create();
  }
  const boardDir = new Directory(bgCacheDir, params.boardName);
  if (!boardDir.exists) {
    boardDir.create();
  }
  const qualityDir = new Directory(boardDir, quality);
  if (!qualityDir.exists) {
    qualityDir.create();
  }

  const localPaths: string[] = [];

  for (const imageUrl of renderData.imageUrls) {
    const downloadUrl = quality === 'thumbnail' ? getThumbnailImageUrl(imageUrl) : imageUrl;
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
