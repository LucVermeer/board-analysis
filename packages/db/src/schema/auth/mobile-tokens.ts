import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Refresh tokens for mobile (React Native) JWT authentication.
 *
 * The native auth flow issues short-lived JWTs (30 days) alongside long-lived
 * refresh tokens (90 days). When a JWT expires the client presents the refresh
 * token to obtain a new JWT + refresh token pair (rotation).
 *
 * Only the SHA-256 hash of the raw refresh token is stored — the cleartext
 * token is returned to the client exactly once during issuance. Revoking a
 * token sets `revokedAt` rather than deleting the row so we can audit token
 * rotation chains after the fact.
 */
export const mobileRefreshTokens = pgTable('mobile_refresh_tokens', {
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
});
