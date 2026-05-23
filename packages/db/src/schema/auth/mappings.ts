import { pgTable, bigserial, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

// Links a NextAuth user to a board account. board_user_id holds the Aurora
// numeric ID; board_user_id_text holds a string identity (e.g. Keycloak sub
// UUID for Kilter accounts). Exactly one is populated per row.
export const userBoardMappings = pgTable(
  'user_board_mappings',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boardType: text('board_type').notNull(),
    boardUserId: integer('board_user_id'),
    boardUserIdText: text('board_user_id_text'),
    boardUsername: text('board_username'),
    linkedAt: timestamp('linked_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserBoard: uniqueIndex('unique_user_board_mapping').on(table.userId, table.boardType),
    boardUserIdx: index('board_user_mapping_idx').on(table.boardType, table.boardUserId),
    boardUserTextIdx: index('board_user_mapping_text_idx').on(table.boardType, table.boardUserIdText),
  }),
);

// Encrypted credentials for board accounts. Aurora-flavoured boards
// (Tension, originally Kilter) populate encrypted_username/password. Kilter
// (Keycloak OIDC) populates encrypted_refresh_token instead — the other two
// are nullable to accommodate that.
export const auroraCredentials = pgTable(
  'aurora_credentials',
  {
    id: bigserial({ mode: 'bigint' }).primaryKey().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boardType: text('board_type').notNull(),
    encryptedUsername: text('encrypted_username'),
    encryptedPassword: text('encrypted_password'),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    auroraUserId: integer('aurora_user_id'),
    auroraToken: text('aurora_token'),
    lastSyncAt: timestamp('last_sync_at'),
    syncStatus: text('sync_status').default('pending').notNull(), // 'pending' | 'active' | 'error' | 'expired'
    syncError: text('sync_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserBoardCredential: uniqueIndex('unique_user_board_credential').on(table.userId, table.boardType),
    userCredentialsIdx: index('aurora_credentials_user_idx').on(table.userId),
  }),
);
