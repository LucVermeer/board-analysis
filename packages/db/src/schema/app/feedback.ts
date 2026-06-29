import { pgTable, text, integer, timestamp, bigserial, index, jsonb, boolean } from 'drizzle-orm/pg-core';
import { users } from '../auth/users';

export type FeedbackContext = {
  climbUuid?: string;
  climbName?: string;
  difficulty?: string;
  sessionId?: string;
  sessionName?: string;
  url?: string;
  userAgent?: string;
};

export const appFeedback = pgTable(
  'app_feedback',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    rating: integer('rating'),
    comment: text('comment'),
    platform: text('platform').notNull(),
    appVersion: text('app_version'),
    source: text('source').notNull(),
    boardName: text('board_name'),
    layoutId: integer('layout_id'),
    sizeId: integer('size_id'),
    setIds: jsonb('set_ids').$type<number[]>(),
    angle: integer('angle'),
    // Whether the reporter opted in to follow-up contact. Only set for bug
    // reports; null/false means "do not reach out". Resolve the reporter via
    // this row's user_id when true.
    contactConsent: boolean('contact_consent'),
    context: jsonb('context').$type<FeedbackContext>(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index('app_feedback_created_at_idx').on(table.createdAt),
    userIdx: index('app_feedback_user_idx').on(table.userId),
    boardIdx: index('app_feedback_board_idx').on(table.boardName),
  }),
);

export type AppFeedback = typeof appFeedback.$inferSelect;
export type NewAppFeedback = typeof appFeedback.$inferInsert;
