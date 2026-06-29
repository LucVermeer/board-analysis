import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  MOONBOARD_LAYOUTS,
  MOONBOARD_SETS,
  MOONBOARD_CELL_SETS,
  getMoonBoardGeometry,
  getGridPosition,
  type MoonBoardLayoutKey,
  type MoonBoardGridGeometry,
} from '@boardsesh/board-config';

// =============================================================================
// Generate the MoonBoard grid-cell -> hold-set map
// =============================================================================
// MoonBoard climbs store holds as grid cells (frames `p{holdId}r{role}`), but —
// unlike Aurora boards — there are no `board_placements` rows mapping a cell to
// the hold set it belongs to. We derive that map from the per-set board art:
// each set overlay (e.g. `woodenholds.png`) draws *only* that set's holds at
// their grid positions, so sampling the alpha channel at each cell centre tells
// us which set owns the cell.
//
// Sampling every layout shows each covered cell belongs to exactly one set (no
// overlap), so a cell -> set map is unambiguous and a climb's required sets are
// the distinct sets of the cells it uses — the same model Aurora uses.
//
// Output: packages/shared/board-config/src/generated/moonboard-cell-sets.ts
// Run:    vp run db:generate-moonboard-cell-sets          (writes the file)
//         vp run db:generate-moonboard-cell-sets -- --check  (drift check, no write)
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const ART_DIR = path.join(REPO_ROOT, 'packages/web/public/images/moonboard');
const OUTPUT_FILE = path.join(REPO_ROOT, 'packages/shared/board-config/src/generated/moonboard-cell-sets.ts');

// Alpha above this counts as a hold pixel; sample the max alpha in a small box
// around the cell centre so a hold that sits a pixel or two off-centre still
// registers (and anti-aliased edges of an empty cell stay well below it).
const ALPHA_THRESHOLD = 80;
const SAMPLE_RADIUS = 6;

type RawImage = { data: Buffer; width: number; height: number; channels: number };

async function loadImage(file: string): Promise<RawImage> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function maxAlphaAround(img: RawImage, px: number, py: number): number {
  let max = 0;
  for (let dy = -SAMPLE_RADIUS; dy <= SAMPLE_RADIUS; dy++) {
    for (let dx = -SAMPLE_RADIUS; dx <= SAMPLE_RADIUS; dx++) {
      const x = px + dx;
      const y = py + dy;
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const alpha = img.data[(y * img.width + x) * img.channels + 3];
      if (alpha > max) max = alpha;
    }
  }
  return max;
}

function cellCenterPixel(holdId: number, geometry: MoonBoardGridGeometry): { px: number; py: number } {
  const { x, y } = getGridPosition(holdId, geometry);
  return { px: Math.round(x * geometry.width), py: Math.round(y * geometry.height) };
}

/** Sample every layout's per-set art into a `layoutId -> { holdId -> setId }` map. */
export async function sampleMoonBoardCellSets(): Promise<Record<number, Record<number, number>>> {
  const result: Record<number, Record<number, number>> = {};

  for (const [layoutKey, layout] of Object.entries(MOONBOARD_LAYOUTS)) {
    const geometry = getMoonBoardGeometry(layoutKey as MoonBoardLayoutKey);
    const sets = MOONBOARD_SETS[layoutKey as MoonBoardLayoutKey];
    const cellCount = geometry.numColumns * geometry.rowTop;
    const cellToSet: Record<number, number> = {};

    const images = await Promise.all(
      sets.map(async (set) => ({ set, img: await loadImage(path.join(ART_DIR, layout.folder, set.imageFile)) })),
    );

    for (let holdId = 1; holdId <= cellCount; holdId++) {
      const { px, py } = cellCenterPixel(holdId, geometry);
      for (const { set, img } of images) {
        if (maxAlphaAround(img, px, py) < ALPHA_THRESHOLD) continue;
        const existing = cellToSet[holdId];
        if (existing !== undefined && existing !== set.id) {
          throw new Error(
            `MoonBoard ${layout.name}: cell ${holdId} claimed by sets ${existing} and ${set.id} — ` +
              `the cell->set map assumes no overlap. Re-check the art or sampling threshold.`,
          );
        }
        cellToSet[holdId] = set.id;
      }
    }

    result[layout.id] = cellToSet;
  }

  return result;
}

function renderModule(map: Record<number, Record<number, number>>): string {
  const layoutIds = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b);

  const layoutBlocks = layoutIds.map((layoutId) => {
    const cells = map[layoutId];
    const holdIds = Object.keys(cells)
      .map(Number)
      .sort((a, b) => a - b);
    const entries = holdIds.map((holdId) => `${holdId}: ${cells[holdId]}`).join(', ');
    return `  ${layoutId}: { ${entries} },`;
  });

  return `// @generated by packages/db/scripts/generate-moonboard-cell-sets.ts — do not edit by hand.
// Run \`vp run db:generate-moonboard-cell-sets\` to regenerate from the per-set board art.
//
// MoonBoard layout id -> (grid cell hold id -> hold set id). Set ids match
// MOONBOARD_SETS in ../moonboard-config. Cells absent from a layout have no hold
// in any set (empty rows / unused positions) and contribute no required set.

export const MOONBOARD_CELL_SETS: Record<number, Record<number, number>> = {
${layoutBlocks.join('\n')}
};
`;
}

/** Format-independent comparison of two cell->set maps. */
function mapsEqual(a: Record<number, Record<number, number>>, b: Record<number, Record<number, number>>): boolean {
  const numericKeys = (obj: Record<number, unknown>) =>
    Object.keys(obj)
      .map(Number)
      .sort((x, y) => x - y);
  const layoutsA = numericKeys(a);
  const layoutsB = numericKeys(b);
  if (layoutsA.length !== layoutsB.length || layoutsA.some((k, i) => k !== layoutsB[i])) return false;
  for (const layoutId of layoutsA) {
    const cellsA = a[layoutId];
    const cellsB = b[layoutId];
    const holdsA = numericKeys(cellsA);
    const holdsB = numericKeys(cellsB);
    if (holdsA.length !== holdsB.length || holdsA.some((k, i) => k !== holdsB[i])) return false;
    for (const holdId of holdsA) {
      if (cellsA[holdId] !== cellsB[holdId]) return false;
    }
  }
  return true;
}

async function main() {
  const check = process.argv.includes('--check');
  const map = await sampleMoonBoardCellSets();

  if (check) {
    // Compare the freshly-sampled map against the committed one by value, so the
    // check is independent of how the file was formatted (vp fmt runs after the
    // write step, below).
    if (!mapsEqual(map, MOONBOARD_CELL_SETS)) {
      console.error('❌ moonboard-cell-sets is out of date. Run: vp run db:generate-moonboard-cell-sets');
      process.exit(1);
    }
    console.info('✓ moonboard-cell-sets is up to date');
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, renderModule(map));
  const totalCells = Object.values(map).reduce((sum, cells) => sum + Object.keys(cells).length, 0);
  console.info(`✓ Wrote ${OUTPUT_FILE}`);
  console.info(`  ${Object.keys(map).length} layouts, ${totalCells} mapped cells`);
}

void main();
