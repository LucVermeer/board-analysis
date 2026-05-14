import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { boardSessions } from './sessions';

// APNs device tokens for ActivityKit Live Activity push updates
export const activityPushTokens = pgTable(
  'activity_push_tokens',
  {
    token: text('token').primaryKey(),
    sessionId: text('session_id')
      .references(() => boardSessions.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index('activity_push_tokens_session_idx').on(table.sessionId),
    // Supports the eviction freshness filter (`WHERE updated_at < cutoff`) in
    // `registerActivityPushToken` and the periodic stale-token sweep in
    // `apns/cleanup.ts`. Both queries also filter by session, but a global
    // index on `updated_at` is cheap and lets the cleanup sweep stay cluster-
    // wide rather than per-session.
    updatedAtIdx: index('activity_push_tokens_updated_at_idx').on(table.updatedAt),
  }),
);

// Type exports
export type ActivityPushToken = typeof activityPushTokens.$inferSelect;
export type NewActivityPushToken = typeof activityPushTokens.$inferInsert;
