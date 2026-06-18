/// <reference types="node" />

/**
 * Crops the raw, full-device board-presence capture (onboarding-board-history.png,
 * produced by .maestro/onboarding.yaml via `vp run mobile:screenshots --flow onboarding`)
 * into the onboarding framing card's 2:3 portrait hero. Linux-safe (sharp), so it
 * runs wherever the macOS/CI capture artifacts land — including downloaded CI
 * artifacts. Output is committed under packages/mobile/assets/onboarding/ and
 * wired into ONBOARDING_PROMPT_CARD.image; the card falls back to a glyph until
 * the PNG exists, so this is a non-blocking follow-up to the copy change.
 *
 * Usage:
 *   vp run mobile:onboarding-assets                                  # default source + name
 *   vp run mobile:onboarding-assets -- --source <png> --name board-history
 */

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The card displays 240×360 (2:3); render at 3x for crisp scaling on every device.
const CARD_WIDTH = 720;
const CARD_HEIGHT = 1080;

// The capture is locale-agnostic enough for one shared hero (board art + presence,
// not paragraphs of UI text), so the en-US shot is the default source.
const DEFAULT_SOURCE = resolve(
  ROOT_DIR,
  'app-stores/apple/screenshots/en-US/iphone-16-pro-max/onboarding-board-history.png',
);
const OUTPUT_DIR = resolve(ROOT_DIR, 'packages', 'mobile', 'assets', 'onboarding');

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const source = resolve(ROOT_DIR, parseArg('--source') ?? DEFAULT_SOURCE);
  const name = parseArg('--name') ?? 'board-history';
  // The board-presence "now on the wall" content sits in a bottom sheet, so the
  // default keeps the lower portion. Override with top / centre / attention /
  // entropy for other screens.
  const gravity = parseArg('--gravity') ?? 'bottom';

  if (!existsSync(source)) {
    console.error(`[mobile:onboarding-assets] Source not found: ${source}`);
    console.error('[mobile:onboarding-assets] Capture it first (macOS / CI):');
    console.error('  vp run mobile:screenshots -- --flow onboarding --platform ios');
    console.error('or pass --source <path-to-onboarding-board-history.png> (e.g. a downloaded CI artifact).');
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = resolve(OUTPUT_DIR, `${name}.png`);

  // Crop the full-device shot to the card's 2:3 portrait, keeping the TOP (the
  // "now on the wall" hero — the lit board + current climb), dropping the lower
  // history list. fit:'cover' keeps the full width and trims the vertical overflow.
  await sharp(source)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'cover', position: gravity })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(`[mobile:onboarding-assets] ${source} -> ${outputPath} (${CARD_WIDTH}x${CARD_HEIGHT})`);
  console.log('[mobile:onboarding-assets] Commit it, then wire the require() in onboarding-cards.ts:');
  console.log("  export const ONBOARDING_PROMPT_CARD: OnboardingCard = { id: 'welcome', icon: 'lightbulb.fill',");
  console.log(`    image: require('../../../assets/onboarding/${name}.png') };`);
}

main().catch((error: unknown) => {
  console.error('[mobile:onboarding-assets] Failed to build onboarding assets.');
  console.error(error);
  process.exit(1);
});
