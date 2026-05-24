# Offline Sync Plan

Offline data layer for the React Native mobile app. Uses RxDB with custom GraphQL replication for sync between the client SQLite database and Postgres. Ships a pre-warmed SQLite database as an app asset for instant offline access to all ~10 boards.

Replaces the `expo-sqlite` + custom mutation queue approach from [mobile-app-plan.md](mobile-app-plan.md).

## Options evaluated

### WatermelonDB — rejected

Structural problems surfaced during two rounds of Opus agent review:

1. **Soft delete required.** WatermelonDB's sync protocol requires the server to report deleted record IDs. Adding `deleted_at` columns to 5 tables means modifying 120+ existing query sites and rebuilding unique indexes as partial indexes.
2. **Maintenance risk.** Single-maintainer project (Nozbe). Last release (v0.28) over a year ago. Known React Native New Architecture compatibility issues (GitHub #1851).
3. **Single global sync timestamp.** `synchronize()` uses one `lastPulledAt` for all tables. Per-board selective sync needs per-board timestamps.
4. **Custom sync endpoint needed.** A new REST endpoint separate from the existing GraphQL API, with duplicated auth/error handling.

### PowerSync self-hosted — viable, not recommended

PowerSync uses Postgres CDC (logical replication) to detect changes automatically. No custom sync endpoint, no soft-delete migration. But:

1. **Infrastructure cost.** Self-hosted PowerSync service + MongoDB for bucket storage = ~$70/mo production on Railway.
2. **MongoDB ops burden.** 3-node replica set management, initialization, backups, monitoring. Adds to Railway's infrastructure complexity.
3. **Replication slot risk.** If PowerSync goes down, WAL accumulates in Postgres. Can fill disk and crash the database.
4. **Pre-warmed database is complex.** PowerSync's sync state uses Postgres LSN (Log Sequence Number), not timestamps. Injecting a pre-built database requires aligning internal sync metadata — no documented API for this, needs a PoC that may fail.
5. **Composite PK incompatibility.** 15+ tables have composite or integer primary keys. PowerSync requires a single text `id` column. Every Sync Rule and client query needs synthetic ID construction.

### RxDB + custom GraphQL sync — recommended

RxDB provides reactive observable queries, a built-in GraphQL replication plugin, and custom conflict resolution — all without any server-side infrastructure. The write path calls existing GraphQL mutations. The read path uses a few new GraphQL queries.

| Aspect | WatermelonDB | PowerSync | RxDB |
|---|---|---|---|
| Infrastructure cost | $0 | ~$70/mo | $0 |
| Backend changes | Sync endpoint + soft-delete (120+ sites) | Client UUID for 2 mutations | Sync pull queries + deletions table |
| Sync mechanism | Custom REST endpoint | Postgres CDC (automatic) | GraphQL replication (semi-automatic) |
| Delete handling | Soft delete on 5 tables | CDC (zero changes) | sync_deletions log table (~3 triggers) |
| Pre-warmed DB | No file swap API | PoC needed (LSN alignment) | Simple (checkpoint = timestamp) |
| Real-time sync | No | Yes (CDC streaming) | Optional (WebSocket subscriptions) |
| Maintenance | Single maintainer, stale | JourneyApps team, active | Active, monthly releases, 48K npm/week |
| RN New Architecture | Known issues | Supported | Needs testing |
| License | MIT | FSL (non-compete) | Apache-2.0 (premium plugins optional) |
| GraphQL integration | None | None | Built-in plugin |
| Reactive queries | Observable decorators | useQuery() SQL | useRxQuery() hooks |

## Why RxDB

1. **$0 infrastructure.** Client-only library. No PowerSync service, no MongoDB, no replication slots. Just the existing Hono backend + a few new GraphQL queries.
2. **Built-in GraphQL replication.** Push calls existing mutations (`saveTick`, `createPlaylist`, `toggleFavorite`). Pull uses new queries that return records changed since a checkpoint timestamp. Maps directly to the existing stack.
3. **Delete handling without breaking existing code.** One new `sync_deletions` table with triggers on DELETE. Existing queries untouched — no soft-delete migration.
4. **Simpler pre-warmed database.** RxDB's replication checkpoint is a simple timestamp, not a Postgres LSN. Pre-build a SQLite database with reference data, set the checkpoint to the build timestamp.
5. **Reactive queries.** `useRxQuery()` hooks re-render components when data changes. Ticks written offline appear immediately in the logbook.
6. **Active maintenance.** Monthly releases (v17 in 2025), 48K npm downloads/week. Apache-2.0 core license.
7. **Custom conflict resolution.** Per-field merging — more flexible than PowerSync's server-side approach.

**Tradeoffs:**
- Not automatic CDC. Pull is poll-based or WebSocket subscription. Changes from the web app don't appear on mobile instantly unless you set up GraphQL subscriptions for the sync queries.
- Premium license recommended for best React Native performance (Expo Filesystem storage via JSI). Free SQLite option (`react-native-quick-sqlite`) is adequate.
- More backend code than PowerSync (~6 new GraphQL queries + 1 table) but far less than WatermelonDB (no sync endpoint, no soft-delete migration).
- RN New Architecture compatibility needs early testing.

## Architecture

```
React Native App
  ├── Pre-warmed SQLite (ships with app, all boards, ~150-200MB)
  ├── RxDB manages the SQLite, reactive queries via useRxQuery()
  ├── GraphQL replication: pull queries + push mutations
  └── Writes to local SQLite immediately (offline-capable)
        │
        │ uploadData: calls existing GraphQL mutations
        ▼
Hono Backend (minimal changes)
  ├── Existing mutations: saveTick, createPlaylist, toggleFavorite, etc.
  ├── New sync pull queries: syncTicks, syncPlaylists, syncClimbs, etc.
  ├── New table: sync_deletions (tracks hard deletes for sync protocol)
  └── Writes to Postgres
        │
        ▼
PostgreSQL (Railway, unchanged)
```

No PowerSync service. No MongoDB. No replication slots. The sync happens directly between the mobile app and the existing GraphQL API.

### Read path

1. On first launch, the app copies the pre-warmed SQLite database from app assets.
2. All board reference data is immediately available offline.
3. RxDB connects and starts GraphQL replication — pulling changes since the pre-warmed timestamp.
4. User data (ticks, playlists, favorites) syncs from zero (small dataset, seconds).
5. Reference data for enabled boards syncs incrementally (new climbs, updated stats).
6. React components using `useRxQuery()` re-render as data arrives.

### Write path

1. User creates a tick offline → RxDB writes to local SQLite immediately.
2. `useRxQuery()` hooks re-render instantly.
3. RxDB queues the write for replication.
4. When online, RxDB's push handler calls the existing `saveTick` GraphQL mutation.
5. Backend processes the mutation with all side effects (climb stats, inferred sessions, Aurora sync queuing).
6. On next pull, the server-confirmed version replaces the local optimistic write.

## Pre-warmed database

The app ships with a CI-built SQLite database containing all board reference data (~150-200MB compressed). All boards are browsable offline from first launch.

### Build pipeline

```
GitHub Action (on schema change + weekly)
  ├── Query Postgres for all board reference data
  ├── Build SQLite database with RxDB schema
  ├── Record the build timestamp as the replication checkpoint
  ├── Compress and include as Expo asset
  └── Commit to the mobile app repo
```

### Why this is simpler than PowerSync's approach

RxDB's replication checkpoint is a simple value — typically the `updated_at` timestamp of the most recent document. Setting the checkpoint after import is just:

```typescript
await replicationState.setCheckpoint({ updatedAt: seedTimestamp });
```

No LSN alignment, no internal oplog entries, no PowerSync metadata tables. The replication engine sees the checkpoint and pulls only documents newer than `seedTimestamp`.

### App size

| Content | Compressed size |
|---|---|
| App binary (RN + native modules) | ~30 MB |
| Pre-warmed database (all boards) | ~150-200 MB |
| **Total** | **~180-230 MB** |

Use Play Asset Delivery on Android for the pre-warmed database (APK limit is 150MB).

### Staleness

Pre-warmed data is as fresh as the last CI build (weekly + on schema change). New climbs appear once the user connects and RxDB pulls incrementally. PowerSync would stream these via CDC in real-time; with RxDB, there's a pull interval (configurable, e.g., every 60 seconds) or WebSocket subscriptions for near-real-time.

## GraphQL replication

### Pull — new queries on the backend

Each syncable entity gets a pull query that returns records changed since a checkpoint:

```graphql
type Query {
  syncTicks(since: DateTime!, limit: Int! = 100): SyncTicksResult!
  syncPlaylists(since: DateTime!, limit: Int! = 100): SyncPlaylistsResult!
  syncPlaylistClimbs(since: DateTime!, limit: Int! = 100): SyncPlaylistClimbsResult!
  syncFavorites(since: DateTime!, limit: Int! = 100): SyncFavoritesResult!
  syncFollows(since: DateTime!, limit: Int! = 100): SyncFollowsResult!
  syncClimbs(boardType: String!, since: DateTime!, limit: Int! = 100): SyncClimbsResult!
  syncClimbStats(boardType: String!, since: DateTime!, limit: Int! = 100): SyncClimbStatsResult!
  syncDeletions(since: DateTime!, limit: Int! = 100): SyncDeletionsResult!
}

type SyncTicksResult {
  documents: [Tick!]!
  checkpoint: DateTime!
}
```

Each resolver queries Postgres:

```sql
-- syncTicks resolver
SELECT * FROM boardsesh_ticks
WHERE user_id = $userId AND updated_at > $since
ORDER BY updated_at ASC
LIMIT $limit;
```

For reference data (climbs, stats), queries are scoped by `board_type`:

```sql
-- syncClimbs resolver
SELECT * FROM board_climbs
WHERE board_type = $boardType AND updated_at > $since AND is_listed = true
ORDER BY updated_at ASC
LIMIT $limit;
```

### Push — reuses existing mutations

RxDB's push handler calls existing GraphQL mutations with no changes:

```typescript
const pushHandler = {
  async handler(docs: RxReplicationWriteToMasterRow<TickDocType>[]) {
    for (const row of docs) {
      const doc = row.newDocumentState;
      if (doc._deleted) {
        await graphql('deleteTick', { uuid: doc.uuid });
      } else if (row.assumedMasterState) {
        await graphql('updateTick', {
          uuid: doc.uuid,
          input: {
            status: doc.status,
            attemptCount: doc.attemptCount,
            quality: doc.quality,
            difficulty: doc.difficulty,
            comment: doc.comment,
          },
        });
      } else {
        await graphql('saveTick', {
          input: {
            uuid: doc.uuid,
            boardType: doc.boardType,
            climbUuid: doc.climbUuid,
            angle: doc.angle,
            status: doc.status,
            attemptCount: doc.attemptCount,
            quality: doc.quality,
            difficulty: doc.difficulty,
            comment: doc.comment ?? '',
            climbedAt: doc.climbedAt,
            isMirror: doc.isMirror ?? false,
            isBenchmark: doc.isBenchmark ?? false,
          },
        });
      }
    }
    return [];
  },
};
```

All existing side effects fire automatically: climb stats recomputation, inferred session assignment, social events, Aurora sync queuing.

### RxDB replication setup

```typescript
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';

const tickReplication = replicateGraphQL({
  collection: db.ticks,
  url: {
    http: `${BACKEND_URL}/graphql`,
    ws: `${BACKEND_URL}/graphql`, // optional, for real-time pull
  },
  headers: { Authorization: `Bearer ${token}` },
  pull: {
    batchSize: 100,
    queryBuilder: (checkpoint, limit) => ({
      query: `query SyncTicks($since: DateTime!, $limit: Int!) {
        syncTicks(since: $since, limit: $limit) {
          documents { id uuid boardType climbUuid angle status attemptCount
            quality difficulty comment climbedAt isMirror isBenchmark
            createdAt updatedAt _deleted }
          checkpoint
        }
      }`,
      variables: { since: checkpoint?.updatedAt ?? '1970-01-01T00:00:00Z', limit },
    }),
    responseModifier: (response) => ({
      documents: response.data.syncTicks.documents,
      checkpoint: { updatedAt: response.data.syncTicks.checkpoint },
    }),
  },
  push: pushHandler,
  deletedField: '_deleted',
  live: true,
  retryTime: 5000,
});
```

Per-board reference data gets its own replication state:

```typescript
function startBoardSync(db: RxDatabase, boardType: string) {
  return replicateGraphQL({
    collection: db.board_climbs,
    url: { http: `${BACKEND_URL}/graphql` },
    headers: { Authorization: `Bearer ${token}` },
    pull: {
      batchSize: 500,
      queryBuilder: (checkpoint, limit) => ({
        query: `query SyncClimbs($boardType: String!, $since: DateTime!, $limit: Int!) {
          syncClimbs(boardType: $boardType, since: $since, limit: $limit) {
            documents { id uuid boardType layoutId setterUsername name frames
              angle framesCount isListed edgeLeft edgeRight edgeBottom edgeTop }
            checkpoint
          }
        }`,
        variables: {
          boardType,
          since: checkpoint?.updatedAt ?? '1970-01-01T00:00:00Z',
          limit,
        },
      }),
      responseModifier: (response) => ({
        documents: response.data.syncClimbs.documents,
        checkpoint: { updatedAt: response.data.syncClimbs.checkpoint },
      }),
    },
    live: false, // poll manually or on app foreground
    retryTime: 30000,
  });
}
```

## Delete handling — sync_deletions table

Instead of soft-deleting on existing tables (which would break 120+ query sites), add one new table:

```sql
CREATE TABLE sync_deletions (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id text NOT NULL,
  deleted_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_deletions_since ON sync_deletions (deleted_at);
```

Add triggers on user data tables:

```sql
CREATE OR REPLACE FUNCTION log_sync_deletion() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sync_deletions (table_name, record_id, deleted_at)
  VALUES (TG_TABLE_NAME, OLD.uuid::text, NOW());
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticks_delete AFTER DELETE ON boardsesh_ticks
  FOR EACH ROW EXECUTE FUNCTION log_sync_deletion();

CREATE TRIGGER trg_playlists_delete AFTER DELETE ON playlists
  FOR EACH ROW EXECUTE FUNCTION log_sync_deletion();

-- For tables without uuid, use id::text
CREATE TRIGGER trg_favorites_delete AFTER DELETE ON user_favorites
  FOR EACH ROW EXECUTE FUNCTION log_sync_deletion();
  -- uses OLD.id::text as record_id
```

The `syncDeletions` pull query returns deleted record IDs:

```sql
SELECT table_name, record_id, deleted_at
FROM sync_deletions
WHERE deleted_at > $since
ORDER BY deleted_at ASC
LIMIT $limit;
```

RxDB marks these documents as `_deleted: true` locally and removes them from query results.

Periodic cleanup: `DELETE FROM sync_deletions WHERE deleted_at < NOW() - INTERVAL '90 days'`. Clients that haven't synced in 90 days will need a full re-sync (wipe local DB, re-copy pre-warmed database).

## RxDB schema

```typescript
import { RxSchema } from 'rxdb';

const tickSchema: RxSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    uuid: { type: 'string' },
    boardType: { type: 'string' },
    climbUuid: { type: 'string' },
    angle: { type: 'integer' },
    isMirror: { type: 'boolean' },
    status: { type: 'string', enum: ['flash', 'send', 'attempt'] },
    attemptCount: { type: 'integer' },
    quality: { type: ['integer', 'null'] },
    difficulty: { type: ['integer', 'null'] },
    isBenchmark: { type: 'boolean' },
    comment: { type: 'string' },
    climbedAt: { type: 'string' },
    sessionId: { type: ['string', 'null'] },
    inferredSessionId: { type: ['string', 'null'] },
    boardId: { type: ['integer', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    _deleted: { type: 'boolean' },
  },
  required: ['id', 'uuid', 'boardType', 'climbUuid', 'angle', 'status'],
  indexes: ['boardType', ['climbUuid', 'boardType'], 'updatedAt'],
};

const climbSchema: RxSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    uuid: { type: 'string' },
    boardType: { type: 'string' },
    layoutId: { type: 'integer' },
    setterId: { type: ['integer', 'null'] },
    setterUsername: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    frames: { type: ['string', 'null'] },
    angle: { type: ['integer', 'null'] },
    framesCount: { type: 'integer' },
    framesPace: { type: ['integer', 'null'] },
    isListed: { type: 'boolean' },
    isDraft: { type: 'boolean' },
    edgeLeft: { type: ['integer', 'null'] },
    edgeRight: { type: ['integer', 'null'] },
    edgeBottom: { type: ['integer', 'null'] },
    edgeTop: { type: ['integer', 'null'] },
    hsm: { type: ['integer', 'null'] },
    createdAt: { type: ['string', 'null'] },
    requiredSetIds: { type: ['string', 'null'] },
    compatibleSizeIds: { type: ['string', 'null'] },
  },
  required: ['id', 'uuid', 'boardType'],
  indexes: ['boardType', ['boardType', 'layoutId', 'isListed'], 'updatedAt'],
};

const climbStatsSchema: RxSchema = {
  version: 0,
  primaryKey: 'id', // synthesized: boardType:climbUuid:angle
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 200 },
    boardType: { type: 'string' },
    climbUuid: { type: 'string' },
    angle: { type: 'integer' },
    displayDifficulty: { type: ['number', 'null'] },
    benchmarkDifficulty: { type: ['number', 'null'] },
    ascensionistCount: { type: ['integer', 'null'] },
    difficultyAverage: { type: ['number', 'null'] },
    qualityAverage: { type: ['number', 'null'] },
    faUsername: { type: ['string', 'null'] },
    faAt: { type: ['string', 'null'] },
  },
  required: ['id', 'boardType', 'climbUuid', 'angle'],
  indexes: ['boardType', ['boardType', 'climbUuid']],
};

// Additional schemas follow the same pattern for:
// playlists, playlistClimbs, userFavorites, userFollows,
// setterFollows, playlistFollows, userPlaylistPins,
// boardProducts, boardProductSizes, boardLayouts, boardHoles,
// boardLeds, boardPlacements, boardPlacementRoles, boardSets,
// boardDifficultyGrades, boardProductSizesLayoutsSets, boardAttempts
```

### Primary key strategy

| Table type | PK source | Example |
|---|---|---|
| Tables with `uuid` column | `uuid` directly | ticks: `"abc-123"` |
| Composite PK tables | Concatenated components | climb_stats: `"kilter:abc-123:40"` |
| Integer `id` + `board_type` | Concatenated | holes: `"kilter:4521"` |
| Integer-only PK | Cast to string | favorites: `"12345"` |

## React component integration

```typescript
import { useRxQuery } from 'rxdb-hooks';

function useTicksForClimb(climbUuid: string, boardType: string) {
  return useRxQuery(
    db.ticks.find({
      selector: {
        climbUuid,
        boardType,
      },
      sort: [{ climbedAt: 'desc' }],
    }),
  );
}

function useClimbSearch(boardType: string, filters: SearchFilters) {
  return useRxQuery(
    db.board_climbs.find({
      selector: {
        boardType,
        isListed: true,
        ...(filters.minGrade != null && {
          displayDifficulty: { $gte: filters.minGrade, $lte: filters.maxGrade },
        }),
      },
      sort: [{ qualityAverage: 'desc' }],
      limit: 50,
    }),
  );
}

function useUserPlaylists(boardType: string) {
  return useRxQuery(
    db.playlists.find({
      selector: { boardType },
      sort: [{ lastAccessedAt: 'desc' }],
    }),
  );
}
```

### Writing records offline

```typescript
async function saveTick(db: RxDatabase, tickData: TickInput) {
  const tickUuid = crypto.randomUUID();
  await db.ticks.insert({
    id: tickUuid,
    uuid: tickUuid,
    boardType: tickData.boardType,
    climbUuid: tickData.climbUuid,
    angle: tickData.angle,
    status: tickData.status,
    attemptCount: tickData.attemptCount,
    quality: tickData.quality,
    difficulty: tickData.difficulty,
    comment: tickData.comment ?? '',
    climbedAt: new Date().toISOString(),
    isMirror: tickData.isMirror ?? false,
    isBenchmark: tickData.isBenchmark ?? false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _deleted: false,
  });
  // Immediately visible in useRxQuery() hooks.
  // Push handler calls saveTick mutation on next sync.
}
```

## Database setup

```typescript
import { createRxDatabase } from 'rxdb';
import { getRxStorageSQLite } from 'rxdb/plugins/storage-sqlite';
import { getSQLiteBasicsQuickSQLite } from 'rxdb/plugins/sqlite';

const db = await createRxDatabase({
  name: 'boardsesh',
  storage: getRxStorageSQLite({
    sqliteBasics: getSQLiteBasicsQuickSQLite(),
  }),
});

await db.addCollections({
  ticks: { schema: tickSchema },
  playlists: { schema: playlistSchema },
  playlist_climbs: { schema: playlistClimbSchema },
  user_favorites: { schema: favoriteSchema },
  user_follows: { schema: followSchema },
  setter_follows: { schema: setterFollowSchema },
  playlist_follows: { schema: playlistFollowSchema },
  user_playlist_pins: { schema: playlistPinSchema },
  board_climbs: { schema: climbSchema },
  board_climb_stats: { schema: climbStatsSchema },
  board_difficulty_grades: { schema: difficultyGradeSchema },
  // ... remaining reference data collections
});
```

## Per-board selective sync

All boards are browsable offline from the pre-warmed database. Users choose which boards get real-time incremental updates.

```typescript
const boardReplications = new Map<string, RxGraphQLReplicationState>();

function enableBoardSync(boardType: string) {
  if (boardReplications.has(boardType)) return;

  const replication = startBoardSync(db, boardType);
  boardReplications.set(boardType, replication);
}

function disableBoardSync(boardType: string) {
  const replication = boardReplications.get(boardType);
  if (replication) {
    replication.cancel();
    boardReplications.delete(boardType);
  }
}
```

User data (ticks, playlists, favorites, follows) syncs always, regardless of which boards are enabled.

## Backend changes

### New GraphQL queries (pull path)

~6 new queries in `packages/backend/src/graphql/resolvers/sync/`:

```typescript
// syncTicks resolver
async syncTicks(_, { since, limit }, ctx) {
  requireAuthenticated(ctx);
  const rows = await db.select()
    .from(boardseshTicks)
    .where(and(
      eq(boardseshTicks.userId, ctx.userId),
      gt(boardseshTicks.updatedAt, since),
    ))
    .orderBy(asc(boardseshTicks.updatedAt))
    .limit(limit);

  const checkpoint = rows.length > 0
    ? rows[rows.length - 1].updatedAt
    : since;

  return { documents: rows, checkpoint };
}
```

### sync_deletions table

New Drizzle migration:

```typescript
export const syncDeletions = pgTable('sync_deletions', {
  id: bigserial({ mode: 'bigint' }).primaryKey(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  deletedAt: timestamp('deleted_at', { mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  sinceIdx: index('idx_sync_deletions_since').on(table.deletedAt),
}));
```

Plus triggers on `boardsesh_ticks`, `playlists`, `playlist_climbs`, `user_favorites`, `user_follows`, `setter_follows`, `playlist_follows`, `user_playlist_pins`.

### Idempotent mutations

`saveTick` and `createPlaylist` accept a client-supplied `uuid` and use `ON CONFLICT (uuid) DO NOTHING` for safe retry. This is ~10 lines per mutation.

## What stays the same

| Component | Status |
|---|---|
| `react-native-mmkv` | KV preferences: active board, theme, onboarding, enabled boards list |
| TanStack Query | Server-state for network-only data: nearby sessions, public profiles, feeds, notifications |
| GraphQL subscriptions | Real-time party mode: queue sync, session events, driver control |
| `expo-secure-store` | Auth tokens in iOS Keychain / Android Keystore |
| Backend GraphQL API | Mostly unchanged. New sync pull queries + sync_deletions table. saveTick/createPlaylist accept client UUID. |
| Aurora sync daemon | Unchanged. Picks up ticks without `aurora_id` and pushes to Aurora API. |

## Account lifecycle

On logout or account switch:

1. Cancel all active RxDB replications.
2. Destroy the RxDB database (`db.destroy()`).
3. Re-copy the pre-warmed database from app assets (restores all board reference data).
4. On new login, start user data replication (syncs in seconds).

## Performance targets

| Metric | Target | Notes |
|---|---|---|
| Local climb search | < 100ms p95 | RxDB query on indexed fields |
| Tick write (offline) | < 10ms | Single document insert, no network |
| Incremental sync | < 2s for typical session | GraphQL pull, paginated |
| App launch (pre-warmed) | < 1s to first content | Database already populated |
| Memory (idle, 3 boards) | < 10MB for RxDB | Documents loaded on query, not upfront |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RN New Architecture compatibility | Medium | High | Phase 0 PoC with Expo SDK 53. If fails, fall back to `react-native-quick-sqlite` storage. |
| Premium license needed for best perf | Low | Medium | Free SQLite storage is adequate. Premium (Expo Filesystem) is a performance optimization, not a requirement. |
| Pre-warmed DB import doesn't work | Medium | Medium | Fallback: pure RxDB sync, no pre-warming. Users wait for initial sync (~3-5 min per board on LTE). |
| Pull-based sync has latency | Certain | Low | Acceptable for reference data (60s poll). User data can use WebSocket subscriptions for near-real-time. |
| sync_deletions table grows | Low | Low | 90-day cleanup job. Clients not synced in 90 days do a full re-sync. |
| RxDB storage format changes between versions | Low | Medium | Pin RxDB version. Test upgrades in staging. RxDB has built-in migration system. |

## Implementation timeline

### Phase 0: PoC (2 days, gates everything)

- Install RxDB with `react-native-quick-sqlite` storage on Expo SDK 53.
- Verify New Architecture compatibility.
- Test pre-warmed database: build SQLite → copy to app → verify RxDB opens it and syncs incrementally.
- Test composite PK synthesis with `board_climb_stats`.
- If PoC fails on pre-warming: fall back to pure RxDB sync.

### Phase 1 addition (Foundation, +1 day)

- Configure RxDB with schemas for all collections.
- Set up replication state for user data (ticks, playlists, favorites, follows).
- Add client-supplied `uuid` parameter to `saveTick` and `createPlaylist` backend mutations.

### Phase 2 addition (Core experience, +3 days)

- Implement sync pull queries on backend (~6 resolvers).
- Create `sync_deletions` table + triggers via Drizzle migration.
- Wire `useRxQuery()` hooks for climb browsing, tick display, playlist listing.
- Build the pre-warmed database pipeline (GitHub Action).
- Test offline tick creation → reconnect → verify round-trip.

### Phase 5 changes (Platform features, -5 days)

- **Remove:** Custom mutation queue, idempotency key dedup table, single-concurrency drainer.
- **Add:** Per-board sync toggle UI.
- **Add:** Sync status indicator ("last synced X minutes ago").

### Net timeline impact

+2 days PoC, +4 days in Phases 1-2, -5 days in Phase 5. **Net: +1 day** — essentially the same timeline with less infrastructure and more robust sync.

## Verification

### PoC (Phase 0)
1. RxDB + `react-native-quick-sqlite` works on Expo SDK 53 + New Architecture.
2. Pre-warmed SQLite database opens in RxDB and syncs incrementally.
3. Composite PK synthesis works in queries and replication.

### Offline tick flow
1. Put device in airplane mode.
2. Open a climb, record a tick.
3. Verify tick appears immediately in the logbook.
4. Restore network. Wait for push replication.
5. Verify tick appears in the web app's logbook.

### Server-to-mobile sync
1. Log a tick on the web app.
2. Wait for next pull cycle (or trigger manually).
3. Verify the tick appears on mobile.

### Board selective sync
1. Enable Kilter for incremental sync.
2. Add a new climb on web. Verify it appears on mobile after next pull.
3. Disable Kilter sync. Add another climb. Verify it does NOT appear on mobile.
4. Browse Kilter climbs in airplane mode — pre-warmed data still available.

### Delete sync
1. Delete a tick on web. Verify `sync_deletions` trigger fires.
2. Pull on mobile. Verify the tick is removed from local RxDB.
3. Verify no orphaned data.
