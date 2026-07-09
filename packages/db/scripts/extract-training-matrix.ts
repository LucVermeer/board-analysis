/**
 * Export the Climb2Vec training matrix — one JSONL row per graded (climb, angle)
 * — for offline model training + validation (ml/climb2vec/). Each row carries the
 * climb's holds, each hold's generated board_hold_features, the angle, the crowd
 * grade label, the ascent weight, and the hold_fingerprint.
 *
 * Requires board_hold_features to be populated first
 * (`refresh-hold-features.ts`). Reads only; writes a JSONL file, no DB writes.
 *
 * Run: `node --import tsx packages/db/scripts/extract-training-matrix.ts \
 *        --board=kilter --out=ml/climb2vec/data/kilter-train.jsonl`
 * Flags: --board=<name> (default kilter) · --out=<path> · --min-ascents=<n> (20)
 *        · --angle=<deg> (optional single-angle slice, e.g. 40) · --limit=<n>.
 */
import { mkdirSync, createWriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { sql } from 'drizzle-orm';
import { createScriptDb } from './db-connection.js';
import {
  buildTrainingRow,
  type HoldFeatureLite,
  type ClimbStatLite,
  type HoldLite,
} from '../src/queries/hold-features/index.js';

const DEFAULT_OUT = 'ml/climb2vec/data/kilter-train.jsonl';
const DEFAULT_MIN_ASCENTS = 20;

type Db = ReturnType<typeof createScriptDb>['db'];

interface Options {
  board: string;
  out: string;
  minAscents: number;
  angle: number | null;
  limit: number | null;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

async function loadFeatures(db: Db, board: string): Promise<Map<number, HoldFeatureLite>> {
  const rows = (await db.execute(sql`
    SELECT placement_id, norm_x, norm_y, edge_dist, neighbor_dist,
           hand_difficulty, foot_difficulty, pull_direction, is_kickboard, coarse_type
    FROM board_hold_features WHERE board_type = ${board}
  `)) as unknown as HoldFeatureLite[];
  const map = new Map<number, HoldFeatureLite>();
  for (const row of rows) map.set(toNumber(row.placement_id), row);
  return map;
}

async function loadStats(db: Db, options: Options): Promise<ClimbStatLite[]> {
  const angleFilter = options.angle === null ? sql`` : sql`AND st.angle = ${options.angle}`;
  const limitClause = options.limit === null ? sql`` : sql`LIMIT ${options.limit}`;
  return (await db.execute(sql`
    SELECT st.climb_uuid AS climb_uuid, st.angle AS angle, st.difficulty_average AS label,
           st.ascensionist_count AS n, c.layout_id AS layout_id, c.hold_fingerprint AS fingerprint
    FROM board_climb_stats st
    JOIN board_climbs c ON c.uuid = st.climb_uuid
    WHERE st.board_type = ${options.board}
      AND c.is_listed = true
      AND COALESCE(c.is_draft, false) = false
      AND st.ascensionist_count >= ${options.minAscents}
      AND st.difficulty_average IS NOT NULL
      ${angleFilter}
    ORDER BY st.climb_uuid, st.angle
    ${limitClause}
  `)) as unknown as ClimbStatLite[];
}

async function loadHoldsByClimb(db: Db, options: Options): Promise<Map<string, HoldLite[]>> {
  const rows = (await db.execute(sql`
    SELECT ch.climb_uuid AS climb_uuid, ch.hold_id AS placement_id, ch.hold_state AS hold_state
    FROM board_climb_holds ch
    WHERE ch.board_type = ${options.board}
      AND ch.climb_uuid IN (
        SELECT st.climb_uuid FROM board_climb_stats st
        JOIN board_climbs c ON c.uuid = st.climb_uuid
        WHERE st.board_type = ${options.board}
          AND c.is_listed = true
          AND COALESCE(c.is_draft, false) = false
          AND st.ascensionist_count >= ${options.minAscents}
          AND st.difficulty_average IS NOT NULL
      )
  `)) as unknown as Array<{ climb_uuid: string; placement_id: number; hold_state: string }>;
  const byClimb = new Map<string, HoldLite[]>();
  for (const row of rows) {
    let list = byClimb.get(row.climb_uuid);
    if (!list) {
      list = [];
      byClimb.set(row.climb_uuid, list);
    }
    list.push({ placement_id: toNumber(row.placement_id), hold_state: row.hold_state });
  }
  return byClimb;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const angleArg = get('--angle');
  const limitArg = get('--limit');
  return {
    board: get('--board') ?? 'kilter',
    out: get('--out') ?? DEFAULT_OUT,
    minAscents: get('--min-ascents') ? Number(get('--min-ascents')) : DEFAULT_MIN_ASCENTS,
    angle: angleArg ? Number(angleArg) : null,
    limit: limitArg ? Number(limitArg) : null,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { db, close } = createScriptDb();
  console.log(
    `[extract] board=${options.board} minAscents=${options.minAscents} angle=${options.angle ?? 'all'} → ${options.out}`,
  );
  try {
    const [features, stats, holdsByClimb] = await Promise.all([
      loadFeatures(db, options.board),
      loadStats(db, options),
      loadHoldsByClimb(db, options),
    ]);
    if (features.size === 0) {
      throw new Error(`board_hold_features is empty for ${options.board} — run refresh-hold-features.ts first.`);
    }

    mkdirSync(dirname(options.out), { recursive: true });
    const stream = createWriteStream(options.out, { encoding: 'utf8' });
    let written = 0;
    let holdTotal = 0;
    for (const stat of stats) {
      const holds = holdsByClimb.get(stat.climb_uuid);
      if (!holds || holds.length === 0) continue;
      const row = buildTrainingRow(stat, holds, features);
      if (row.holds.length === 0) continue;
      stream.write(`${JSON.stringify(row)}\n`);
      written++;
      holdTotal += row.holds.length;
    }
    await new Promise<void>((resolve, reject) =>
      stream.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
    console.log(
      `[extract] wrote ${written} rows (${features.size} placement features, avg ${
        written ? (holdTotal / written).toFixed(1) : 0
      } holds/row) → ${options.out}`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('[extract] failed:', error);
  process.exit(1);
});
