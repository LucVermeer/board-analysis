/**
 * Load the offline Climb2Vec export (content_prior + embedding per climb+angle,
 * JSONL from ml/climb2vec/train_export.py) into board_climb_embeddings. This is
 * the ONLY DB write in the content-model path — Python stays offline.
 *
 * Run: `node --import tsx packages/db/scripts/load-content-model.ts \
 *        --board=kilter --in=ml/climb2vec/data/kilter-content.jsonl`
 * Flags: --board=<name> (default kilter) · --in=<path> · --model=<version>.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createScriptDb } from './db-connection.js';
import { boardClimbEmbeddings } from '../src/schema/app/climb-embeddings.js';
import { sql } from 'drizzle-orm';

const DEFAULT_IN = 'ml/climb2vec/data/kilter-content.jsonl';
const DEFAULT_MODEL = 'climb2vec-v1';
const UPSERT_CHUNK = 500;

type Db = ReturnType<typeof createScriptDb>['db'];
type Row = typeof boardClimbEmbeddings.$inferInsert;

interface ContentRecord {
  climbUuid: string;
  angle: number;
  contentPrior: number;
  contentSd: number;
  embedding: number[];
}

async function upsert(db: Db, rows: Row[]): Promise<void> {
  await db
    .insert(boardClimbEmbeddings)
    .values(rows)
    .onConflictDoUpdate({
      target: [boardClimbEmbeddings.boardType, boardClimbEmbeddings.climbUuid, boardClimbEmbeddings.angle],
      set: {
        contentPrior: sql`excluded.content_prior`,
        contentSd: sql`excluded.content_sd`,
        embedding: sql`excluded.embedding`,
        modelVersion: sql`excluded.model_version`,
        updatedAt: sql`now()`,
      },
    });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const board = get('--board') ?? 'kilter';
  const inPath = get('--in') ?? DEFAULT_IN;
  const modelVersion = get('--model') ?? DEFAULT_MODEL;

  const { db, close } = createScriptDb();
  console.log(`[load-content] board=${board} model=${modelVersion} ← ${inPath}`);
  const reader = createInterface({ input: createReadStream(inPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  let batch: Row[] = [];
  let total = 0;
  try {
    for await (const line of reader) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const record = JSON.parse(trimmed) as ContentRecord;
      batch.push({
        boardType: board,
        climbUuid: record.climbUuid,
        angle: record.angle,
        contentPrior: record.contentPrior,
        contentSd: record.contentSd,
        embedding: record.embedding,
        modelVersion,
      });
      if (batch.length >= UPSERT_CHUNK) {
        await upsert(db, batch);
        total += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      await upsert(db, batch);
      total += batch.length;
    }
    console.log(`[load-content] upserted ${total} rows into board_climb_embeddings.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('[load-content] failed:', error);
  process.exit(1);
});
