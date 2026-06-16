/// <reference types="node" />

/**
 * Dimension gate for the App Store screenshots before they're uploaded to
 * App Store Connect.
 *
 * `fastlane deliver` routes each screenshot to a display slot by its pixel
 * dimensions, so a capture-resolution change (e.g. a new default simulator)
 * could silently produce PNGs Apple rejects, or that land in the wrong slot.
 * This gate runs after capture and fails loudly — listing every offender —
 * before fastlane ever talks to Apple.
 *
 * It reads width/height straight from each PNG's IHDR header (no `sips` /
 * ImageMagick), so it runs identically on Linux CI and macOS.
 *
 * Usage:
 *   vp run check:screenshot-dimensions
 *
 * Exit code 0 when every PNG under app-stores/apple/screenshots/<device>/ is an
 * App Store-accepted size for its device slot; 1 otherwise (including when no
 * PNGs are present, so a failed/empty capture can't pass silently).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLE_SHOTS_DIR = resolve(ROOT_DIR, 'app-stores', 'apple', 'screenshots');
const LOG = '[check:screenshot-dimensions]';

// First 8 bytes of every PNG file.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Portrait sizes App Store Connect accepts, keyed by the capture device slug
 * (see deviceSlug() in mobile-screenshots.ts). A device folder with no entry
 * here is treated as an offender (fail closed), so a future capture into a new
 * slug can't sneak un-validated sizes past the gate.
 */
export const ACCEPTED_SIZES: Record<string, readonly Dimensions[]> = {
  // 6.9" iPhone slot. Apple accepts the iPhone 16 Pro Max native 1320×2868 or
  // the prior-gen 1290×2796 in this slot.
  'iphone-16-pro-max': [
    { width: 1320, height: 2868 },
    { width: 1290, height: 2796 },
  ],
};

/** Read width/height from a PNG buffer's IHDR. Throws on a non-PNG / truncated file. */
export function readPngDimensions(buffer: Buffer): Dimensions {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4) = 24.
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG (bad signature)');
  }
  // The first chunk must be IHDR; its type tag sits at bytes 12-15.
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('first PNG chunk is not IHDR');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export interface PngFile {
  /** Path relative to the screenshots root, for human-readable error output. */
  name: string;
  buffer: Buffer;
}

export interface Offender {
  file: string;
  reason: string;
}

/** Pure: validate one device folder's PNGs against its accepted-size allow-list. */
export function findOffenders(deviceSlug: string, files: readonly PngFile[]): Offender[] {
  const accepted = ACCEPTED_SIZES[deviceSlug];
  if (!accepted) {
    return files.map((file) => ({
      file: file.name,
      reason: `no accepted-size list for device "${deviceSlug}"`,
    }));
  }

  const offenders: Offender[] = [];
  for (const file of files) {
    let dimensions: Dimensions;
    try {
      dimensions = readPngDimensions(file.buffer);
    } catch (error) {
      offenders.push({ file: file.name, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const matches = accepted.some((size) => size.width === dimensions.width && size.height === dimensions.height);
    if (!matches) {
      const allowed = accepted.map((size) => `${size.width}x${size.height}`).join(' or ');
      offenders.push({
        file: file.name,
        reason: `is ${dimensions.width}x${dimensions.height}, expected ${allowed}`,
      });
    }
  }
  return offenders;
}

function main(): number {
  let deviceDirs: string[];
  try {
    deviceDirs = readdirSync(APPLE_SHOTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    console.error(`${LOG} FAILED: ${APPLE_SHOTS_DIR} not found — run \`vp run mobile:screenshots\` first.`);
    return 1;
  }

  const offenders: Offender[] = [];
  let pngCount = 0;
  for (const slug of deviceDirs) {
    const dir = join(APPLE_SHOTS_DIR, slug);
    const pngNames = readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.png'));
    const files: PngFile[] = pngNames.map((name) => ({
      name: `${slug}/${name}`,
      buffer: readFileSync(join(dir, name)),
    }));
    pngCount += files.length;
    offenders.push(...findOffenders(slug, files));
  }

  if (pngCount === 0) {
    console.error(`${LOG} FAILED: no screenshots found under ${APPLE_SHOTS_DIR}.`);
    return 1;
  }
  if (offenders.length > 0) {
    console.error(`${LOG} FAILED: ${offenders.length} screenshot(s) are not an App Store-accepted size:`);
    for (const offender of offenders) {
      console.error(`  - ${offender.file}: ${offender.reason}`);
    }
    return 1;
  }

  console.log(`${LOG} OK: ${pngCount} screenshot(s) match an accepted App Store size.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
