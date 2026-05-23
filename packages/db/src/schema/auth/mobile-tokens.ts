import { pgTable, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/**
 * Refresh tokens for mobile (React Native) JWT authentication.
 *
 * The native auth flow issues short-lived JWTs (7 days) alongside long-lived
 * refresh tokens (90 days). When a JWT expires the client presents the refresh
 * token to obtain a new JWT + refresh token pair (rotation).
 *
 * Only the SHA-256 hash of the raw refresh token is stored — the cleartext
 * token is returned to the client exactly once during issuance. Revoking a
 * token sets `revokedAt` rather than deleting the row so we can audit token
 * rotation chains after the fact.
 */
export const mobileRefreshTokens = pgTable(
  'mobile_refresh_tokens',
  {
    id: text('id')
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date' }),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('mobile_refresh_tokens_token_hash_idx').on(table.tokenHash),
    userIdIdx: index('mobile_refresh_tokens_user_id_idx').on(table.userId),
    expiresAtIdx: index('mobile_refresh_tokens_expires_at_idx').on(table.expiresAt),
    revokedAtIdx: index('mobile_refresh_tokens_revoked_at_partial_idx')
      .on(table.revokedAt)
      .where(sql`"revoked_at" IS NOT NULL`),
  }),
);
