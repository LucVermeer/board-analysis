# Offline Sync Plan

Offline data layer for the React Native mobile app. Uses `expo-sqlite` for the local database with a custom GraphQL mutation queue for offline writes. Ships a pre-warmed SQLite database as an app asset for instant offline access to all ~10 boards.

This document records the evaluation of four approaches and why `expo-sqlite` + custom mutation queue is the recommendation.

## Alternatives evaluated

### WatermelonDB — rejected

Reviewed by two Opus agents (30 general findings, 3 dealbreakers):

1. **Soft delete required.** WatermelonDB's sync protocol requires the server to report deleted record IDs. Adding `deleted_at` columns to 5 tables means modifying 120+ existing query sites and rebuilding unique indexes as partial indexes.
2. **Maintenance risk.** Single-maintainer project (Nozbe). Last release (v0.28) over a year ago. Known React Native New Architecture compatibility issues (GitHub #1851).
3. **Single global sync timestamp.** `synchronize()` uses one `lastPulledAt` for all tables. Per-board selective sync needs per-board timestamps.

### PowerSync self-hosted — rejected

Reviewed by two Opus agents (2 dealbreakers, 5 serious risks):

1. **Infrastructure cost.** Self-hosted PowerSync service + MongoDB = ~$70/mo on Railway.
2. **Composite PK incompatibility.** 15+ tables have composite or integer PKs. PowerSync requires a single text `id` column. Every Sync Rule and client query needs synthetic ID construction.
3. **Pre-warmed database is complex.** PowerSync's sync state uses Postgres LSN, not timestamps. No documented API to inject a pre-built database with correct sync metadata.
4. **Replication slot risk.** If PowerSync goes down, WAL accumulates in Postgres and can fill disk.
5. **MongoDB ops burden.** 3-node replica set management, initialization, backups, monitoring.

### RxDB + custom GraphQL sync — rejected

Reviewed by two Opus agents (1 dealbreaker, 4 serious risks):

1. **No JOINs.** RxDB is a document database that stores JSON blobs in SQLite rows. The core climb search query JOINs `board_climbs` with `board_climb_stats` — this is fundamentally relational. With RxDB, every search requires two collection queries + JavaScript-level merge and sort. Unacceptable for 200K+ climbs.
2. **Pre-warmed database complexity.** Building a valid RxDB SQLite requires running a full RxDB instance, inserting 500K+ documents through its API (4 SQLite writes per document for indexes). No public `setCheckpoint()` API to initialize replication state.
3. **Missing `updated_at` columns.** 8 of the syncable tables lack the `updated_at` column that sync pull queries depend on.
4. **`toggleFavorite` is a toggle, not idempotent.** Incompatible with sync push (a retry would invert the state).

### expo-sqlite + custom mutation queue — recommended

The original plan from [mobile-app-plan.md](mobile-app-plan.md) Phase 5. After evaluating all alternatives, this is the best fit for Boardsesh's data model.

**Why it wins:**

| Concern | expo-sqlite + mutation queue |
|---|---|
| Climb search | Full SQL with JOINs, proper column indexes, < 100ms |
| Infrastructure cost | $0 — client-only, uses existing GraphQL API |
| Pre-warmed database | Just a SQLite file. No internal metadata, no LSN alignment, no RxDB format. Copy to disk and open. |
| Backend changes | Sync pull queries (~6 resolvers) + `sync_deletions` table + idempotent mutations |
| Delete handling | `sync_deletions` table + triggers. Existing queries untouched. |
| Maintenance risk | `expo-sqlite` is a first-party Expo module. Guaranteed New Architecture support. |
| Custom code | Mutation queue (~300 lines), sync pull client (~200 lines). Well-understood pattern. |
| Reactive queries | TanStack Query with query invalidation after sync. Not RxDB-level reactivity, but sufficient. |

## Architecture

```
React Native App
  ├── Pre-warmed SQLite (ships with app, all boards, ~150-200MB)
  ├── expo-sqlite manages the database
  ├── TanStack Query for reactive data + cache
  ├── Mutation queue for offline writes
  └── Sync pull client for incremental updates
        │
        │ GraphQL mutations (push) + sync queries (pull)
        ▼
Hono Backend (minimal changes)
  ├── Existing mutations: saveTick, createPlaylist, toggleFavorite, etc.
  ├── New sync pull queries: syncTicks, syncClimbs, syncClimbStats, etc.
  ├── New table: sync_deletions (tracks hard deletes for sync)
  └── Writes to Postgres
        │
        ▼
PostgreSQL (Railway, unchanged)
```

No additional services. No MongoDB. No replication slots. Sync happens directly between the mobile app and the existing GraphQL API.

## Pre-warmed SQLite database

The app ships with a CI-built SQLite database containing all board reference data (~150-200MB compressed). All boards are browsable offline from first launch.

### Build pipeline

```
GitHub Action (on schema change + weekly)
  ├── Query Postgres for all board reference data
  ├── Build SQLite database with proper schema (columns, indexes)
  ├── Record the build timestamp in a metadata table
  ├── Compress and include as Expo asset
  └── Commit to the mobile app repo
```

This is just a SQLite file — no RxDB internal format, no PowerSync metadata, no LSN tracking. The schema matches the client's expected tables and columns exactly.

### On first launch

1. Copy the pre-warmed SQLite from app assets to the writable documents directory.
2. Open with `expo-sqlite`.
3. All board reference data is immediately available. Full SQL with JOINs.
4. Start the sync pull client to fetch changes since the pre-warmed timestamp.

### App size

| Content | Compressed size |
|---|---|
| App binary (RN + native modules) | ~30 MB |
| Pre-warmed database (all boards) | ~150-200 MB |
| **Total** | **~180-230 MB** |

Use Play Asset Delivery on Android (APK limit is 150MB).

### Staleness

Pre-warmed data is as fresh as the last CI build (weekly + on schema change). New climbs appear once the sync pull client fetches incremental updates. First sync after launch fetches changes since the build timestamp.

## Climb search — full SQL with JOINs

The core advantage of expo-sqlite over every alternative evaluated:

```sql
SELECT c.uuid, c.name, c.setter_username, c.frames, c.frames_count,
       c.edge_left, c.edge_right, c.edge_bottom, c.edge_top,
       cs.display_difficulty, cs.quality_average, cs.ascensionist_count,
       cs.benchmark_difficulty, cs.fa_username
FROM board_climbs c
LEFT JOIN board_climb_stats cs ON c.uuid = cs.climb_uuid AND cs.angle = ?
WHERE c.board_type = ? AND c.is_listed = 1
  AND c.layout_id = ?
  AND (? IS NULL OR cs.display_difficulty BETWEEN ? AND ?)
ORDER BY cs.quality_average DESC NULLS LAST
LIMIT 50 OFFSET ?
```

This runs against proper SQLite columns with covering indexes — not JSON blob extraction. Target: < 100ms p95 on 200K climbs.

The pre-warmed database includes indexes matching the web app's query patterns:

```sql
CREATE INDEX idx_climbs_search ON board_climbs (board_type, layout_id, is_listed);
CREATE INDEX idx_stats_lookup ON board_climb_stats (board_type, climb_uuid, angle);
CREATE INDEX idx_stats_difficulty ON board_climb_stats (board_type, angle, display_difficulty);
```

## Mutation queue — offline writes

A simple FIFO queue for offline mutations. ~300 lines of code.

### How it works

1. User creates a tick offline → written to local SQLite immediately.
2. TanStack Query cache is invalidated → UI updates instantly.
3. The mutation is added to a `pending_mutations` table in SQLite.
4. When online, the queue drainer processes mutations in order, calling GraphQL mutations.
5. Processed mutations are removed from the queue.

### Mutation queue schema

```sql
CREATE TABLE pending_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,     -- 'create', 'update', 'delete'
  payload TEXT NOT NULL,       -- JSON payload for the mutation
  idempotency_key TEXT NOT NULL UNIQUE, -- client-generated UUID
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
```

### Queue drainer

```typescript
async function drainMutationQueue(db: SQLiteDatabase) {
  const pending = await db.getAllAsync<PendingMutation>(
    'SELECT * FROM pending_mutations ORDER BY created_at ASC LIMIT 10',
  );

  for (const mutation of pending) {
    try {
      await processMutation(mutation);
      await db.runAsync('DELETE FROM pending_mutations WHERE id = ?', mutation.id);
    } catch (error) {
      if (isRetryable(error)) {
        await db.runAsync(
          'UPDATE pending_mutations SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
          [error.message, mutation.id],
        );
        break; // stop processing, retry later
      }
      // Non-retryable: log and skip
      await db.runAsync('DELETE FROM pending_mutations WHERE id = ?', mutation.id);
      console.error('Skipping failed mutation:', mutation, error);
    }
  }
}

async function processMutation(mutation: PendingMutation) {
  const payload = JSON.parse(mutation.payload);

  switch (mutation.table_name) {
    case 'boardsesh_ticks':
      if (mutation.operation === 'create') {
        await graphql('saveTick', { input: { uuid: mutation.idempotency_key, ...payload } });
      } else if (mutation.operation === 'update') {
        await graphql('updateTick', { uuid: payload.uuid, input: payload });
      } else if (mutation.operation === 'delete') {
        await graphql('deleteTick', { uuid: payload.uuid });
      }
      break;

    case 'user_favorites':
      if (mutation.operation === 'create') {
        await graphql('addFavorite', { input: payload });
      } else if (mutation.operation === 'delete') {
        await graphql('removeFavorite', { input: payload });
      }
      break;

    case 'playlists':
      if (mutation.operation === 'create') {
        await graphql('createPlaylist', { input: { uuid: mutation.idempotency_key, ...payload } });
      } else if (mutation.operation === 'update') {
        await graphql('updatePlaylist', { input: payload });
      } else if (mutation.operation === 'delete') {
        await graphql('deletePlaylist', { playlistUuid: payload.uuid });
      }
      break;

    case 'playlist_climbs':
      if (mutation.operation === 'create') {
        await graphql('addClimbToPlaylist', { input: payload });
      } else if (mutation.operation === 'delete') {
        await graphql('removeClimbFromPlaylist', { input: payload });
      }
      break;

    case 'user_follows':
      await graphql(mutation.operation === 'create' ? 'followUser' : 'unfollowUser', {
        input: { userId: payload.followingId },
      });
      break;

    case 'setter_follows':
      await graphql(mutation.operation === 'create' ? 'followSetter' : 'unfollowSetter', {
        input: { setterUsername: payload.setterUsername },
      });
      break;

    case 'playlist_follows':
      await graphql(mutation.operation === 'create' ? 'followPlaylist' : 'unfollowPlaylist', {
        input: { playlistUuid: payload.playlistUuid },
      });
      break;
  }
}
```

### Queue trigger points

| Trigger | When |
|---|---|
| App foreground | `AppState` listener, debounced |
| After local write | Immediate attempt, then debounced retry |
| Network restored | `NetInfo` listener |
| Pull-to-refresh | User-initiated |

### Idempotency

Each mutation gets a client-generated UUID as an idempotency key. The backend's `saveTick` and `createPlaylist` accept this UUID and use `ON CONFLICT (uuid) DO NOTHING` for safe retry. Favorites and follows use explicit `addFavorite`/`removeFavorite` (not `toggleFavorite`) so retries don't invert state.

## Sync pull — incremental updates

A simple pull client that fetches changes since the last sync checkpoint.

### Pull queries (new GraphQL resolvers on the backend)

```graphql
type Query {
  syncTicks(since: DateTime!, limit: Int! = 100): SyncResult!
  syncPlaylists(since: DateTime!, limit: Int! = 100): SyncResult!
  syncPlaylistClimbs(since: DateTime!, limit: Int! = 100): SyncResult!
  syncFavorites(since: DateTime!, limit: Int! = 100): SyncResult!
  syncFollows(since: DateTime!, limit: Int! = 100): SyncResult!
  syncClimbs(boardType: String!, since: DateTime!, limit: Int! = 100): SyncResult!
  syncClimbStats(boardType: String!, since: DateTime!, limit: Int! = 100): SyncResult!
  syncDeletions(since: DateTime!, limit: Int! = 100): SyncDeletionsResult!
}
```

Each resolver queries Postgres for records where `updated_at > $since`. User data is scoped to the authenticated user.

### Per-board selective sync

User data (ticks, playlists, favorites, follows) syncs always. Board reference data syncs per-board based on user settings:

```typescript
const enabledBoards = getMMKVPreference<string[]>('sync_boards') ?? [];

// Sync user data
await syncTable(db, 'ticks', 'syncTicks');
await syncTable(db, 'playlists', 'syncPlaylists');
await syncTable(db, 'favorites', 'syncFavorites');

// Sync reference data for enabled boards only
for (const boardType of enabledBoards) {
  await syncTable(db, 'board_climbs', 'syncClimbs', { boardType });
  await syncTable(db, 'board_climb_stats', 'syncClimbStats', { boardType });
}
```

### Pull client implementation

```typescript
async function syncTable(
  db: SQLiteDatabase,
  tableName: string,
  queryName: string,
  extraVars?: Record<string, unknown>,
) {
  const checkpoint = await getCheckpoint(db, tableName);
  let hasMore = true;

  while (hasMore) {
    const result = await graphql(queryName, {
      since: checkpoint,
      limit: 500,
      ...extraVars,
    });

    const { documents, checkpoint: newCheckpoint } = result;

    if (documents.length === 0) {
      hasMore = false;
      break;
    }

    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const doc of documents) {
        await tx.runAsync(
          `INSERT OR REPLACE INTO ${tableName} (...) VALUES (...)`,
          Object.values(doc),
        );
      }
      await setCheckpoint(tx, tableName, newCheckpoint);
    });

    hasMore = documents.length === 500;
  }
}
```

## Delete handling — sync_deletions table

Same approach as the RxDB plan — one new table with triggers on user data DELETEs:

```sql
CREATE TABLE sync_deletions (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id text NOT NULL,
  user_id text,          -- scoped by user for privacy
  deleted_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_deletions_since ON sync_deletions (deleted_at);
CREATE INDEX idx_sync_deletions_user ON sync_deletions (user_id, deleted_at);
```

Per-table trigger functions (since some tables use `uuid`, others use `id`):

```sql
-- For tables with uuid column
CREATE FUNCTION log_deletion_uuid() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sync_deletions (table_name, record_id, user_id, deleted_at)
  VALUES (TG_TABLE_NAME, OLD.uuid, OLD.user_id, NOW());
  RETURN OLD;
END; $$ LANGUAGE plpgsql;

-- For tables with integer id only
CREATE FUNCTION log_deletion_id() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sync_deletions (table_name, record_id, user_id, deleted_at)
  VALUES (TG_TABLE_NAME, OLD.id::text, OLD.user_id, NOW());
  RETURN OLD;
END; $$ LANGUAGE plpgsql;

-- For follow tables where the user column is follower_id
CREATE FUNCTION log_deletion_follow() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sync_deletions (table_name, record_id, user_id, deleted_at)
  VALUES (TG_TABLE_NAME, OLD.id::text, OLD.follower_id, NOW());
  RETURN OLD;
END; $$ LANGUAGE plpgsql;
```

The `syncDeletions` pull query is scoped by user:

```sql
SELECT table_name, record_id, deleted_at
FROM sync_deletions
WHERE user_id = $userId AND deleted_at > $since
ORDER BY deleted_at ASC
LIMIT $limit;
```

Periodic cleanup: `DELETE FROM sync_deletions WHERE deleted_at < NOW() - INTERVAL '90 days'`.

## Backend changes needed

### Prerequisites (database migrations)

1. **`updated_at` columns on 8 tables.** `user_favorites`, `user_follows`, `setter_follows`, `playlist_follows`, `user_playlist_pins`, `playlist_climbs`, `board_climbs`, `board_climb_stats` all need `updated_at TIMESTAMP DEFAULT NOW()` + auto-update triggers + backfill from `created_at` (or `NOW()` for stats).

2. **`sync_deletions` table** with per-table trigger functions (3 variants: `uuid`-based, `id`-based, `follower_id`-based).

3. **Idempotent mutations.** `saveTick` and `createPlaylist` accept client-supplied `uuid` with `ON CONFLICT (uuid) DO NOTHING`. New `addFavorite`/`removeFavorite` mutations (not `toggleFavorite`).

### New GraphQL resolvers (~8)

`syncTicks`, `syncPlaylists`, `syncPlaylistClimbs`, `syncFavorites`, `syncFollows`, `syncClimbs`, `syncClimbStats`, `syncDeletions` — each returns records where `updated_at > $since`, scoped by user for user data, by `board_type` for reference data.

## React integration

### TanStack Query for data fetching

```typescript
function useTicksForClimb(climbUuid: string, boardType: string) {
  const db = useSQLiteDatabase();
  return useQuery({
    queryKey: ['ticks', climbUuid, boardType],
    queryFn: () => db.getAllAsync(
      'SELECT * FROM boardsesh_ticks WHERE climb_uuid = ? AND board_type = ? ORDER BY climbed_at DESC',
      [climbUuid, boardType],
    ),
  });
}

function useClimbSearch(boardType: string, angle: number, filters: SearchFilters) {
  const db = useSQLiteDatabase();
  return useQuery({
    queryKey: ['climb-search', boardType, angle, filters],
    queryFn: () => db.getAllAsync(
      `SELECT c.*, cs.display_difficulty, cs.quality_average, cs.ascensionist_count
       FROM board_climbs c
       LEFT JOIN board_climb_stats cs ON c.uuid = cs.climb_uuid AND cs.angle = ?
       WHERE c.board_type = ? AND c.is_listed = 1
       AND (? IS NULL OR cs.display_difficulty BETWEEN ? AND ?)
       ORDER BY cs.quality_average DESC NULLS LAST
       LIMIT 50`,
      [angle, boardType, filters.minGrade, filters.minGrade, filters.maxGrade],
    ),
  });
}
```

### Writing records offline

```typescript
async function saveTick(db: SQLiteDatabase, tickData: TickInput) {
  const tickUuid = crypto.randomUUID();

  // 1. Write to local SQLite immediately
  await db.runAsync(
    `INSERT INTO boardsesh_ticks (uuid, board_type, climb_uuid, angle, status,
     attempt_count, quality, difficulty, comment, climbed_at, is_mirror, is_benchmark,
     created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [tickUuid, tickData.boardType, tickData.climbUuid, tickData.angle,
     tickData.status, tickData.attemptCount, tickData.quality, tickData.difficulty,
     tickData.comment ?? '', new Date().toISOString(),
     tickData.isMirror ? 1 : 0, tickData.isBenchmark ? 1 : 0],
  );

  // 2. Queue the mutation for server sync
  await db.runAsync(
    `INSERT INTO pending_mutations (table_name, operation, payload, idempotency_key)
     VALUES ('boardsesh_ticks', 'create', ?, ?)`,
    [JSON.stringify(tickData), tickUuid],
  );

  // 3. Invalidate TanStack Query cache
  queryClient.invalidateQueries({ queryKey: ['ticks'] });

  // 4. Attempt immediate sync
  drainMutationQueue(db);
}
```

## What stays the same

| Component | Status |
|---|---|
| `react-native-mmkv` | KV preferences: active board, theme, onboarding, enabled boards list |
| TanStack Query | Data fetching + cache for both local SQLite and network-only data |
| GraphQL subscriptions | Real-time party mode: queue sync, session events, driver control |
| `expo-secure-store` | Auth tokens in iOS Keychain / Android Keystore |
| Backend GraphQL API | Mostly unchanged. New sync pull queries + sync_deletions + idempotent mutations. |
| Aurora sync daemon | Unchanged. Picks up ticks without `aurora_id` and pushes to Aurora API. |

## Account lifecycle

On logout or account switch:

1. Delete the local SQLite database file.
2. Re-copy the pre-warmed database from app assets (restores all board reference data).
3. Clear the TanStack Query cache.
4. On new login, sync pull client fetches the new user's data (small, seconds).

## Performance targets

| Metric | Target | Notes |
|---|---|---|
| Climb search (local SQL) | < 100ms p95 | Full SQL with JOINs, covering indexes |
| Tick write (offline) | < 10ms | SQLite INSERT + mutation queue entry |
| Incremental sync | < 2s typical | GraphQL pull, paginated |
| App launch (pre-warmed) | < 1s to first content | Database already populated |
| Memory (idle) | < 5MB for SQLite | On disk, not in memory |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Custom mutation queue bugs | Medium | Medium | ~300 lines, well-understood pattern. Test with offline/online cycles. |
| Pre-warmed DB too large for app stores | Medium | Medium | Use Play Asset Delivery on Android. App Store allows 200MB cellular. |
| Sync pull queries need `updated_at` on 8 tables | Certain | Low | Migration work. Straightforward: add column + trigger + backfill. |
| `sync_deletions` table grows | Low | Low | 90-day cleanup job. Clients not synced in 90 days do full re-sync. |
| Conflict between offline write and server state | Low | Low | Idempotent mutations with `ON CONFLICT DO NOTHING`. Last write wins for updates. |

## Implementation timeline

This is the original Phase 5 plan from `mobile-app-plan.md`, adjusted for the findings from the evaluation:

### Phase 5 (Platform features, 3 weeks)

- Pre-warmed SQLite database build pipeline (GitHub Action).
- `updated_at` column migration on 8 tables + auto-update triggers.
- `sync_deletions` table + per-table trigger functions.
- Sync pull client with per-board selective sync.
- Mutation queue (~300 lines) with queue drainer.
- Idempotent mutations: `saveTick`/`createPlaylist` accept client UUID. New `addFavorite`/`removeFavorite`.
- Sync pull resolvers (~8 new GraphQL queries).
- Per-board sync toggle UI.
- Sync status indicator ("last synced X minutes ago").

## Verification

### Offline tick flow
1. Put device in airplane mode.
2. Open a climb, record a tick.
3. Verify tick appears immediately in the logbook (TanStack Query invalidation).
4. Restore network. Wait for mutation queue to drain.
5. Verify tick appears in the web app's logbook.

### Server-to-mobile sync
1. Log a tick on the web app.
2. Trigger sync pull on mobile (pull-to-refresh or app foreground).
3. Verify the tick appears in the mobile logbook.

### Climb search performance
1. Pre-warm database with 200K Kilter climbs + stats.
2. Run climb search with difficulty filter + quality sort.
3. Verify < 100ms on iPhone 13.

### Board selective sync
1. Enable Kilter for incremental sync.
2. Add a new climb on web. Trigger sync. Verify it appears on mobile.
3. Disable Kilter sync. Add another climb. Verify it does NOT sync.
4. Browse Kilter climbs in airplane mode — pre-warmed data still available.

### Mutation queue resilience
1. Create 10 ticks offline. Verify all appear in local SQLite.
2. Reconnect. Verify all 10 are pushed via GraphQL mutations.
3. Kill the app mid-push (after tick #5). Relaunch. Verify ticks #6-10 are pushed on retry.
4. Create a tick with a nonexistent `climb_uuid`. Verify it's skipped (non-retryable error) and subsequent mutations still process.

### Delete sync
1. Delete a tick on web. Verify `sync_deletions` trigger fires.
2. Sync pull on mobile. Verify the tick is removed from local SQLite.
