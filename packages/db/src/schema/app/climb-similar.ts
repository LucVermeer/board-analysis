import { pgTable, text, integer, real, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';

/**
 * Precomputed content-similarity neighbours from the Climb2Vec embedding
 * (board_climb_embeddings). One row per (climb, angle) → neighbour, top-K by
 * cosine, computed within the same board + layout + angle (different layouts are
 * different walls; different angles are different problems). The nightly
 * `refresh-climb-similarity.ts` job builds it; the `similarClimbs` read path can
 * blend it with the existing hold-overlap (Jaccard) similarity to surface
 * "climbs that move like this" even across different hold sets — and it works on
 * MoonBoard / cold climbs where co-occurrence data is empty.
 *
 * Portable (no extensions); pgvector is a later drop-in only if the brute-force
 * top-K stops fitting the job budget.
 */
export const boardClimbSimilar = pgTable(
  'board_climb_similar',
  {
    boardType: text('board_type').notNull(),
    climbUuid: text('climb_uuid').notNull(),
    angle: integer('angle').notNull(),
    neighborUuid: text('neighbor_uuid').notNull(),
    /** Cosine similarity of the two L2-normalized embeddings, in [-1, 1]. */
    score: real('score').notNull(),
    /** 1..K rank within this climb+angle's neighbour list. */
    rank: integer('rank').notNull(),
    modelVersion: text('model_version').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.boardType, table.climbUuid, table.angle, table.neighborUuid] }),
    // Read path: neighbours of one climb+angle in rank order.
    lookupIdx: index('board_climb_similar_lookup_idx').on(table.boardType, table.climbUuid, table.angle, table.rank),
  }),
);

export type BoardClimbSimilar = typeof boardClimbSimilar.$inferSelect;
export type NewBoardClimbSimilar = typeof boardClimbSimilar.$inferInsert;
