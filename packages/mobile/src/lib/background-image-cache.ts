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
  return imageUrl.split('/').pop() ?? 'unknown.webp';
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
 * Ensure all background images for a board configuration are cached locally.
 * Downloads thumbnail variants (smaller, webp) for faster initial load.
 * Returns an array of local filesystem paths usable by the native renderer.
 */
export async function ensureBackgroundsCached(params: {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: number[];
}): Promise<string[]> {
  const renderData = getBoardRenderData(params);
  if (!renderData) return [];

  if (!bgCacheDir.exists) {
    bgCacheDir.create();
  }
  const boardDir = new Directory(bgCacheDir, params.boardName);
  if (!boardDir.exists) {
    boardDir.create();
  }

  const localPaths: string[] = [];

  for (const imageUrl of renderData.imageUrls) {
    const thumbUrl = getThumbnailImageUrl(imageUrl);
    const filename = extractFilename(thumbUrl);
    const localFile = new File(boardDir, filename);

    if (localFile.exists) {
      localPaths.push(toFilesystemPath(localFile.uri));
      continue;
    }

    try {
      const downloaded = await File.downloadFileAsync(thumbUrl, localFile);
      if (downloaded) {
        localPaths.push(toFilesystemPath(downloaded.uri));
      }
    } catch {
      // Download failed — skip this background layer
    }
  }

  return localPaths;
}
