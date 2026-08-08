import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../auth/users';
import { boardseshTicks } from './ascents';
import { userBoards } from './boards';
import { boardSessions } from './sessions';

export const privateAttemptVideoStatusEnum = pgEnum('private_attempt_video_status', [
  'uploading',
  'finalizing',
  'ready',
  'failed',
  'deleting',
]);

/**
 * Owner-only recordings captured while a MoonBoard 2024 climb is active.
 *
 * `assetKey` is an opaque server-generated locator. It is never returned by
 * GraphQL and is not a filesystem path. Provider beta videos live in
 * `board_beta_links` and must never be written here.
 */
export const privateAttemptVideos = pgTable(
  'private_attempt_videos',
  {
    uuid: text('uuid').notNull(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tickUuid: text('tick_uuid').references(() => boardseshTicks.uuid, { onDelete: 'cascade' }),

    boardType: text('board_type').notNull(),
    climbProvider: text('climb_provider').notNull().default('boardsesh_public_graphql_search_climbs'),
    climbUuid: text('climb_uuid').notNull(),
    layoutId: integer('layout_id').notNull(),
    angle: integer('angle').notNull(),
    isMirror: boolean('is_mirror').notNull().default(false),
    boardId: bigint('board_id', { mode: 'number' }).references(() => userBoards.id, { onDelete: 'set null' }),
    sessionId: text('session_id').references(() => boardSessions.id, { onDelete: 'set null' }),

    assetKey: text('asset_key').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
    durationMs: integer('duration_ms'),
    status: privateAttemptVideoStatusEnum('status').notNull().default('uploading'),
    failureCode: text('failure_code'),
    recordedAt: timestamp('recorded_at', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
    clientRecordingId: text('client_recording_id').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.uuid] }),
    assetKeyUnique: uniqueIndex('private_attempt_videos_asset_key_unique').on(table.assetKey),
    tickUuidUnique: uniqueIndex('private_attempt_videos_tick_uuid_unique')
      .on(table.tickUuid)
      .where(sql`${table.tickUuid} IS NOT NULL`),
    ownerClientRecordingUnique: uniqueIndex('private_attempt_videos_owner_client_recording_unique').on(
      table.ownerUserId,
      table.clientRecordingId,
    ),
    ownerClimbCreatedIdx: index('private_attempt_videos_owner_climb_created_idx').on(
      table.ownerUserId,
      table.boardType,
      table.climbUuid,
      table.createdAt,
    ),
    statusUpdatedIdx: index('private_attempt_videos_status_updated_idx').on(table.status, table.updatedAt),
    moonBoard2024Only: check(
      'private_attempt_videos_moonboard_2024_only',
      sql`${table.boardType} = 'moonboard' AND ${table.layoutId} = 3`,
    ),
    byteSizeNonNegative: check('private_attempt_videos_byte_size_non_negative', sql`${table.byteSize} >= 0`),
    durationNonNegative: check(
      'private_attempt_videos_duration_non_negative',
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
    ),
  }),
);

export type PrivateAttemptVideo = typeof privateAttemptVideos.$inferSelect;
export type NewPrivateAttemptVideo = typeof privateAttemptVideos.$inferInsert;
export type PrivateAttemptVideoStatus = 'uploading' | 'finalizing' | 'ready' | 'failed' | 'deleting';
