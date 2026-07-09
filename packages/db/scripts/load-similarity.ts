/**
 * Load the Climb2Vec similarity export (per-climb cosine top-K neighbours, JSONL
 * from ml/climb2vec/similarity_export.py) into board_climb_similar. Full rebuild
 * per board: neighbours are a derived cache and the top-K set changes whenever the
 * model retrains, so the board's rows are cleared and reinserted.
 *
 * Run: `node --import tsx packages/db/scripts/load-similarity.ts \
 *        --board=kilter --in=ml/climb2vec/data/kilter-similar.jsonl`
 * Flags: --board=<name> (default kilter) · --in=<path> · --model=<version>.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { sql } from 'drizzle-orm';
import { createScriptDb } from './db-connection.js';
import { boardClimbSimilar } from '../src/schema/app/climb-similar.js';

const DEFAULT_IN = 'ml/climb2vec/data/kilter-similar.jsonl';
const DEFAULT_MODEL = 'climb2vec-v1';
const INSERT_CHUNK = 5000;

type Db = ReturnType<typeof createScriptDb>['db'];
type Row = typeof boardClimbSimilar.$inferInsert;

interface NeighbourRecord {
  climbUuid: string;
  angle: number;
  neighbours: Array<[string, number]>;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const board = get('--board') ?? 'kilter';
  const inPath = get('--in') ?? DEFAULT_IN;
  const modelVersion = get('--model') ?? DEFAULT_MODEL;

  const { db, close } = createScriptDb();
  console.log(`[load-similarity] board=${board} model=${modelVersion} ← ${inPath}`);
  const reader = createInterface({ input: createReadStream(inPath, { encoding: 'utf8' }), crlfDelay: Infinity });

  let batch: Row[] = [];
  let total = 0;
  const flush = async (dbHandle: Db): Promise<void> => {
    if (batch.length === 0) return;
    await dbHandle.insert(boardClimbSimilar).values(batch);
    total += batch.length;
    batch = [];
  };

  try {
    // Full rebuild: clear the board's neighbours before reinserting.
    await db.execute(sql`DELETE FROM board_climb_similar WHERE board_type = ${board}`);
    for await (const line of reader) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const record = JSON.parse(trimmed) as NeighbourRecord;
      record.neighbours.forEach(([neighborUuid, score], index) => {
        batch.push({
          boardType: board,
          climbUuid: record.climbUuid,
          angle: record.angle,
          neighborUuid,
          score,
          rank: index + 1,
          modelVersion,
        });
      });
      if (batch.length >= INSERT_CHUNK) await flush(db);
    }
    await flush(db);
    console.log(`[load-similarity] inserted ${total} neighbour rows into board_climb_similar.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('[load-similarity] failed:', error);
  process.exit(1);
});
