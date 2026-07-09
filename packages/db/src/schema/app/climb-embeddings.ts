import {
  pgTable,
  text,
  integer,
  doublePrecision,
  real,
  timestamp,
  bigserial,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Climb2Vec content-model output: one row per (climb, angle). The offline model
 * (ml/climb2vec/) writes this table; the nightly grade job reads `content_prior`
 * from it and blends it into board_climb_grades, while the similarity job reads
 * `embedding` to build nearest-neighbour tables. Decoupling the two jobs this way
 * keeps Python strictly offline — it only ever writes here.
 *
 * `content_prior` is the model's grade estimate on the shared Boardsesh scale
 * (10 = V0/4a) — a PRIOR, never the surfaced grade. `content_sd` is the model's
 * held-out RMSE, used as the standard error of the `DeherdedGradeSignal` the grade
 * blend consumes (so a weak model can't overrule the crowd). `embedding` is the
 * L2-normalized penultimate encoder activation, the shared representation behind
 * climb similarity and per-user style.
 *
 * Populated by `packages/db/scripts/load-content-model.ts` from the offline export.
 * Portable (real[] float array, no extensions); pgvector is a later drop-in only
 * if brute-force cosine stops scaling.
 */
export const boardClimbEmbeddings = pgTable(
  'board_climb_embeddings',
  {
    boardType: text('board_type').notNull(),
    climbUuid: text('climb_uuid').notNull(),
    angle: integer('angle').notNull(),
    /** Model grade estimate on the shared scale; the content_prior a grade row will blend. */
    contentPrior: doublePrecision('content_prior'),
    /** Model held-out RMSE → the standard error of the grade signal. */
    contentSd: doublePrecision('content_sd'),
    /** L2-normalized penultimate embedding (float4[]); the similarity/style vector. */
    embedding: real('embedding').array(),
    modelVersion: text('model_version').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
    // Monotonic per-row sequence for an offline-sync cursor tiebreaker, mirroring
    // board_climb_grades.sync_seq (embeddings themselves stay server-only in v1;
    // only precomputed neighbor tables would ever sync).
    syncSeq: bigserial('sync_seq', { mode: 'number' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.boardType, table.climbUuid, table.angle] }),
    boardIdx: index('board_climb_embeddings_board_idx').on(table.boardType),
  }),
);

export type BoardClimbEmbedding = typeof boardClimbEmbeddings.$inferSelect;
export type NewBoardClimbEmbedding = typeof boardClimbEmbeddings.$inferInsert;
