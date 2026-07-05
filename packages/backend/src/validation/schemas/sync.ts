import { z } from 'zod';

/**
 * Composite sync cursor input. Both components are optional (null on the first
 * pull). `updatedAt` is an ISO-8601 string; `syncSeq` is a stringified bigint.
 * Enforced here so a malformed cursor is a client-visible validation error
 * instead of an unhandled Postgres exception when the resolver casts it with
 * `::timestamp` / `::bigint`.
 *
 * Besides strict ISO-8601, the legacy 'YYYY-MM-DD HH:MM:SS[.ffffff]' shape is
 * accepted: pre-normalization servers emitted postgres.js timestamp strings
 * verbatim, and clients replay stored checkpoints, so rejecting that form
 * would permanently brick sync for anyone holding an old cursor. Both shapes
 * cast cleanly with `::timestamp`.
 */
const LEGACY_PG_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

export const SyncCursorInputSchema = z
  .object({
    updatedAt: z
      .string()
      .datetime({ offset: true })
      .or(z.string().regex(LEGACY_PG_TIMESTAMP_PATTERN))
      .optional()
      .nullable(),
    syncSeq: z.string().regex(/^\d+$/, 'syncSeq must be a stringified integer').optional().nullable(),
  })
  .optional()
  .nullable();

/**
 * Page-size bound shared by every sync resolver. Matches the SDL default of 500
 * and caps the per-request row count so a client can't ask for an unbounded scan.
 */
export const SyncLimitSchema = z.number().int().min(1).max(500);

/**
 * Optional board-scope id (layoutId / sizeId) for the per-board sync resolvers.
 * A positive integer when present; null/undefined means "whole board type".
 */
export const SyncBoardScopeIdSchema = z.number().int().positive().optional().nullable();

export type SyncCursorInputValidated = z.infer<typeof SyncCursorInputSchema>;
