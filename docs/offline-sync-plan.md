# Offline Sync Plan

Offline data layer for the React Native mobile app. Uses PowerSync (self-hosted) for automatic sync between the client SQLite database and Postgres, with CDN seed files for fast initial board data loading.

Replaces the `expo-sqlite` + custom mutation queue approach from [mobile-app-plan.md](mobile-app-plan.md).

## Why PowerSync

We evaluated two options: WatermelonDB and PowerSync. PowerSync is the recommendation.

### WatermelonDB — evaluated, not recommended

WatermelonDB provides reactive observable queries, a built-in `synchronize()` protocol, and lazy loading. It would replace the custom mutation queue from the original plan. However, it has structural problems that surfaced during review:

1. **Soft delete required.** WatermelonDB's sync protocol requires the server to report deleted record IDs. Since Postgres uses hard deletes, every syncable table would need a `deleted_at` column. This means modifying 120+ existing query sites across the web app and backend to add `WHERE deleted_at IS NULL`, and rebuilding unique indexes as partial indexes (favorites, follows) to avoid constraint violations on re-create after soft-delete.

2. **Maintenance risk.** Single-maintainer project (Nozbe). Last release (v0.28) over a year ago. Known React Native New Architecture compatibility issues (GitHub #1851) — the JSI layer that powers its performance does not work reliably with RN 0.76+, which is what Expo SDK 53+ ships.

3. **Single global sync timestamp.** `synchronize()` uses one `lastPulledAt` timestamp for all tables. Per-board selective sync needs per-board timestamps. WatermelonDB's protocol does not support this — adding a new board mid-session would miss data from before the last sync.

4. **No public API for seed file import.** The plan called for pre-built SQLite files for initial board data, but WatermelonDB does not expose a file-swap mechanism. The `SQLiteAdapter` opens the database at initialization and there is no documented way to replace the underlying file at runtime.

5. **Custom sync endpoint needed.** A new REST endpoint (`/api/sync/pull`, `/api/sync/push`) would need to be built on the Hono backend — separate from the existing GraphQL API, with duplicated auth validation, error handling, and rate limiting.

### PowerSync — recommended

PowerSync uses Postgres logical replication (CDC) to detect changes and stream them to clients. The write path calls existing GraphQL mutations. No custom sync endpoint, no soft-delete migration, no schema changes to existing tables.

| WatermelonDB Problem | PowerSync Solution |
|---|---|
| Soft delete needed (120+ query sites) | Postgres CDC detects real DELETEs via logical replication. No schema changes. |
| Maintenance risk (single maintainer) | JourneyApps team, monthly releases, RN New Architecture supported, Fortune 500 production use |
| Single `lastPulledAt` for all boards | Sync Streams: client subscribes to per-board streams with independent sync state |
| No seed file swap API | PowerSync uses standard SQLite; seed data is imported via `db.execute()` batch INSERTs |
| Custom sync endpoint needed | No sync endpoint — PowerSync reads Postgres WAL. Writes use existing GraphQL mutations. |
| Two migration systems (Drizzle + WatermelonDB) | One migration system (Drizzle). PowerSync client schema is declarative, not a migration target. |

**Tradeoffs:**
- Adds infrastructure: PowerSync service + MongoDB on Railway (~$15-30/mo)
- FSL license — non-compete clause (cannot build a competing sync product). Auto-converts to OSI open source after 2 years. Boardsesh is not a sync product, so this is a non-issue.
- Requires Postgres logical replication enabled (Railway supports this)

## Architecture

```
React Native App
  ├── Local SQLite (PowerSync SDK manages)
  ├── useQuery() hooks → reactive queries on local data
  └── uploadData() → calls existing GraphQL mutations
        │
        ▼
Hono Backend (unchanged)
  ├── saveTick, toggleFavorite, createPlaylist, etc.
  └── Writes to Postgres
        │
        ▼
PostgreSQL (Railway)
  ├── Logical replication slot
  └── WAL stream
        │
        ▼
PowerSync Service (self-hosted, Railway)
  ├── Consumes WAL, applies Sync Rules/Streams
  ├── Bucket storage (MongoDB, Railway)
  └── Streams changes to connected clients
        │
        ▼
React Native App (SQLite updated automatically)
```

### Data flow — read path

1. PowerSync service connects to Postgres via logical replication.
2. Changes to synced tables are detected via WAL (INSERT, UPDATE, DELETE).
3. PowerSync applies Sync Rules to determine which user/board each change belongs to.
4. Changes are streamed to connected clients and applied to local SQLite.
5. React components using `useQuery()` re-render automatically.

The mobile app never queries the backend for read data — everything comes from local SQLite, which PowerSync keeps in sync with Postgres.

### Data flow — write path

1. User creates a tick offline → written to local SQLite immediately.
2. `useQuery()` hooks re-render instantly (no network round-trip).
3. PowerSync SDK queues the write in its FIFO upload queue.
4. When online, `uploadData()` fires, calling the existing GraphQL mutation (`saveTick`).
5. Backend processes the mutation (with all side effects: climb stats, inferred sessions, social events, Aurora sync queuing).
6. Postgres row is inserted/updated.
7. PowerSync detects the change via CDC and streams it back to the client (confirming the write).

## Infrastructure (self-hosted on Railway)

| Component | Spec | Cost |
|---|---|---|
| PowerSync Service | 1 Docker container, 512MB RAM, 1 vCPU | ~$5-10/mo |
| MongoDB | Bucket storage. 1 node dev (2GB RAM), 3-node replica set prod | ~$10-20/mo |
| Postgres | Existing Railway instance. Enable logical replication + replication slot permissions. | $0 (already running) |

**Total additional cost: ~$15-30/mo.**

PowerSync scales by adding API container instances (1 per ~100 concurrent connections). For Boardsesh's current user base, a single instance is sufficient.

### Postgres configuration

Enable logical replication on the Railway Postgres instance:

```sql
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_replication_slots = 4;
ALTER SYSTEM SET max_wal_senders = 4;
```

Create a replication user for PowerSync:

```sql
CREATE ROLE powersync_role WITH LOGIN REPLICATION PASSWORD '...';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;
```

### PowerSync service deployment

Use the [self-host-demo](https://github.com/powersync-ja/self-host-demo) Docker Compose as a starting point, adapted for Railway:

```yaml
services:
  powersync:
    image: journeyapps/powersync-service:latest
    environment:
      POWERSYNC_CONFIG: /config/powersync.yaml
    volumes:
      - ./powersync.yaml:/config/powersync.yaml

  mongo:
    image: mongo:7
    command: --replSet rs0
```

The `powersync.yaml` config points to the Railway Postgres instance and MongoDB, and defines the Sync Rules.

## Sync Rules — what data goes where

### Per-user data (always synced for authenticated user)

```yaml
bucket_definitions:
  user_ticks:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - "SELECT * FROM boardsesh_ticks WHERE user_id = bucket.user_id"

  user_playlists:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - >
        SELECT p.* FROM playlists p
        JOIN playlist_ownership po ON p.id = po.playlist_id
        WHERE po.user_id = bucket.user_id

  user_playlist_climbs:
    parameters: >
      SELECT DISTINCT po.playlist_id
      FROM playlist_ownership po
      WHERE po.user_id = token_parameters.user_id
    data:
      - "SELECT * FROM playlist_climbs WHERE playlist_id = bucket.playlist_id"

  user_favorites:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - "SELECT * FROM user_favorites WHERE user_id = bucket.user_id"

  user_follows:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - "SELECT * FROM user_follows WHERE follower_id = bucket.user_id"
      - "SELECT * FROM setter_follows WHERE follower_id = bucket.user_id"
      - "SELECT * FROM playlist_follows WHERE follower_id = bucket.user_id"
      - "SELECT * FROM user_playlist_pins WHERE user_id = bucket.user_id"
```

### Per-board reference data (synced on-demand via Sync Streams)

The client subscribes to streams per board the user enables for offline use.

```yaml
bucket_definitions:
  board_climbs:
    parameters: "SELECT request.parameters() ->> 'board_type' as board_type"
    data:
      - "SELECT * FROM board_climbs WHERE board_type = bucket.board_type AND is_listed = true"

  board_climb_stats:
    parameters: "SELECT request.parameters() ->> 'board_type' as board_type"
    data:
      - "SELECT * FROM board_climb_stats WHERE board_type = bucket.board_type"

  board_reference:
    parameters: "SELECT request.parameters() ->> 'board_type' as board_type"
    data:
      - "SELECT * FROM board_products WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_product_sizes WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_layouts WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_holes WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_leds WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_placements WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_placement_roles WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_sets WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_difficulty_grades WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_product_sizes_layouts_sets WHERE board_type = bucket.board_type"
      - "SELECT * FROM board_attempts WHERE board_type = bucket.board_type"
```

## Per-board selective sync

Boardsesh supports ~10 boards (Kilter, Tension, MoonBoard, Decoy, Touchstone, Grasshopper, etc.), each with a large climb database. Users choose which boards to make available offline.

### User flow

1. On first launch (or in Settings > Offline Boards), the user sees a list of boards with estimated download sizes.
2. Toggling a board on downloads a compressed SQLite seed file from the CDN for fast initial load.
3. After seeding, PowerSync's Sync Streams handle incremental updates automatically.
4. Toggling a board off unsubscribes from the board's Sync Streams and clears that board's reference data from local SQLite.

### Client-side implementation

```typescript
import { useSyncStream } from '@powersync/react-native';
import { useMMKVObject } from 'react-native-mmkv';

function BoardOfflineSettings({ boards }) {
  const [enabledBoards, setEnabledBoards] = useMMKVObject<string[]>('offline_boards');

  for (const boardType of enabledBoards ?? []) {
    useSyncStream('board_climbs', { board_type: boardType });
    useSyncStream('board_climb_stats', { board_type: boardType });
    useSyncStream('board_reference', { board_type: boardType });
  }

  // UI renders board list with toggles
}
```

### Estimated sizes per board

| Board | Climbs (approx) | Compressed seed |
|---|---|---|
| Kilter | ~200K | ~40 MB |
| Tension | ~100K | ~25 MB |
| MoonBoard | ~50K | ~15 MB |
| Others | ~10-30K each | ~5-10 MB each |

Actual sizes should be measured by running the export against the dev DB before shipping.

## Initial board data: CDN seed + PowerSync incremental

CDN seed files provide fast first-board loading (~30s download vs minutes of over-the-wire sync through PowerSync's protocol). After seeding, PowerSync handles incremental updates via CDC.

### Seed file pipeline

```
Postgres (prod) → GitHub Action (nightly) → SQLite export per board → gzip → Cloudflare R2
                                                                                    │
                                                                      Mobile app downloads
                                                                      on board toggle
```

Each seed file contains the board's reference data tables (climbs, climb_stats, holes, LEDs, placements, etc.) filtered to a single `board_type`.

The export script records the current server timestamp. After import, the app initializes PowerSync's sync state for that board's Sync Streams so incremental sync picks up where the seed was built.

### Seed import into PowerSync's SQLite

PowerSync's client SDK uses standard SQLite. Seed data is imported via batch INSERTs:

```typescript
async function importBoardSeed(db: PowerSyncDatabase, boardType: string) {
  const seedUrl = await fetchBoardManifest(boardType);
  const seedPath = await downloadAndDecompress(seedUrl);

  // Open the seed file as a separate SQLite connection
  const seedDb = await SQLite.openDatabaseAsync(seedPath);
  const climbs = await seedDb.getAllAsync('SELECT * FROM board_climbs');

  // Batch insert into PowerSync's local SQLite
  await db.writeTransaction(async (tx) => {
    for (const batch of chunk(climbs, 1000)) {
      for (const climb of batch) {
        await tx.execute(
          'INSERT OR REPLACE INTO board_climbs (id, ...) VALUES (?, ...)',
          [climb.id, ...],
        );
      }
    }
  });

  await seedDb.closeAsync();
}
```

For better performance, the seed file can be ATTACHed and imported via `INSERT INTO ... SELECT FROM`:

```sql
ATTACH DATABASE '/path/to/seed.sqlite' AS seed;
INSERT OR REPLACE INTO board_climbs SELECT * FROM seed.board_climbs;
DETACH DATABASE seed;
```

### Seed file versioning

The seed manifest includes the PowerSync client schema version. The app rejects seed files built against an incompatible schema version. After every schema migration, a new seed must be built before users on the new app version can enable a board — the GitHub Action should be triggered on schema changes, not just nightly.

## Write path — reuses existing GraphQL mutations

PowerSync's `uploadData()` callback fires when the app is online and there are pending local writes. It calls the existing GraphQL mutations — no new backend code.

```typescript
class BoardseshConnector extends AbstractPowerSyncBackendConnector {
  async uploadData(database: PowerSyncDatabase) {
    const batch = await database.getCrudBatch();
    if (!batch) return;

    for (const op of batch.crud) {
      switch (op.table) {
        case 'boardsesh_ticks':
          await this.handleTickOp(op);
          break;
        case 'user_favorites':
          await this.handleFavoriteOp(op);
          break;
        case 'playlists':
          await this.handlePlaylistOp(op);
          break;
        case 'playlist_climbs':
          await this.handlePlaylistClimbOp(op);
          break;
        case 'user_follows':
        case 'setter_follows':
        case 'playlist_follows':
          await this.handleFollowOp(op);
          break;
      }
    }

    await batch.complete();
  }

  private async handleTickOp(op: CrudEntry) {
    switch (op.op) {
      case 'put':
        await this.graphql('saveTick', {
          input: {
            boardType: op.opData.board_type,
            climbUuid: op.opData.climb_uuid,
            angle: op.opData.angle,
            status: op.opData.status,
            attemptCount: op.opData.attempt_count,
            quality: op.opData.quality,
            difficulty: op.opData.difficulty,
            comment: op.opData.comment ?? '',
            climbedAt: op.opData.climbed_at,
            isMirror: op.opData.is_mirror ?? false,
            isBenchmark: op.opData.is_benchmark ?? false,
          },
        });
        break;
      case 'patch':
        await this.graphql('updateTick', {
          uuid: op.opData.uuid,
          input: op.opData,
        });
        break;
      case 'delete':
        await this.graphql('deleteTick', { uuid: op.id });
        break;
    }
  }

  private async handleFavoriteOp(op: CrudEntry) {
    // toggleFavorite is idempotent — works for both add and remove
    await this.graphql('toggleFavorite', {
      input: {
        boardName: op.opData.board_name,
        climbUuid: op.opData.climb_uuid,
        angle: op.opData.angle,
      },
    });
  }

  private async handlePlaylistOp(op: CrudEntry) {
    switch (op.op) {
      case 'put':
        await this.graphql('createPlaylist', {
          input: {
            boardType: op.opData.board_type,
            layoutId: op.opData.layout_id,
            name: op.opData.name,
            description: op.opData.description,
            color: op.opData.color,
            icon: op.opData.icon,
          },
        });
        break;
      case 'patch':
        await this.graphql('updatePlaylist', {
          input: {
            playlistId: op.id,
            name: op.opData.name,
            description: op.opData.description,
            isPublic: op.opData.is_public,
            color: op.opData.color,
            icon: op.opData.icon,
          },
        });
        break;
      case 'delete':
        await this.graphql('deletePlaylist', { playlistId: op.id });
        break;
    }
  }

  private async handlePlaylistClimbOp(op: CrudEntry) {
    if (op.op === 'put') {
      await this.graphql('addClimbToPlaylist', {
        input: {
          playlistId: op.opData.playlist_id,
          climbUuid: op.opData.climb_uuid,
          angle: op.opData.angle,
        },
      });
    } else if (op.op === 'delete') {
      await this.graphql('removeClimbFromPlaylist', {
        input: {
          playlistId: op.opData.playlist_id,
          climbUuid: op.opData.climb_uuid,
        },
      });
    }
  }

  private async handleFollowOp(op: CrudEntry) {
    const isFollow = op.op === 'put';
    switch (op.table) {
      case 'user_follows':
        await this.graphql(isFollow ? 'followUser' : 'unfollowUser', {
          input: { userId: op.opData.following_id },
        });
        break;
      case 'setter_follows':
        await this.graphql(isFollow ? 'followSetter' : 'unfollowSetter', {
          input: { setterUsername: op.opData.setter_username },
        });
        break;
      case 'playlist_follows':
        await this.graphql(isFollow ? 'followPlaylist' : 'unfollowPlaylist', {
          input: { playlistUuid: op.opData.playlist_uuid },
        });
        break;
    }
  }
}
```

All existing side effects fire automatically: climb stats recomputation, inferred session assignment, social event publishing, Aurora sync queuing. No new backend code for the write path.

## React component integration

```typescript
import { useQuery } from '@powersync/react-native';

// Ticks for a specific climb
function useTicksForClimb(climbUuid: string, boardType: string) {
  return useQuery(
    'SELECT * FROM boardsesh_ticks WHERE climb_uuid = ? AND board_type = ? ORDER BY climbed_at DESC',
    [climbUuid, boardType],
  );
}

// Climb search with stats join
function useClimbSearch(boardType: string, angle: number, filters: SearchFilters) {
  return useQuery(
    `SELECT c.*, cs.display_difficulty, cs.quality_average, cs.ascensionist_count
     FROM board_climbs c
     LEFT JOIN board_climb_stats cs ON c.uuid = cs.climb_uuid AND cs.angle = ?
     WHERE c.board_type = ? AND c.is_listed = true
     AND (? IS NULL OR cs.display_difficulty BETWEEN ? AND ?)
     ORDER BY cs.quality_average DESC NULLS LAST
     LIMIT 50`,
    [angle, boardType, filters.minGrade, filters.minGrade, filters.maxGrade],
  );
}

// User's playlists
function useUserPlaylists(boardType: string) {
  return useQuery(
    'SELECT * FROM playlists WHERE board_type = ? ORDER BY updated_at DESC',
    [boardType],
  );
}

// Check if a climb is favorited
function useIsFavorited(boardName: string, climbUuid: string, angle: number) {
  return useQuery(
    'SELECT COUNT(*) as count FROM user_favorites WHERE board_name = ? AND climb_uuid = ? AND angle = ?',
    [boardName, climbUuid, angle],
  );
}
```

### Writing records offline

```typescript
async function saveTick(db: PowerSyncDatabase, tickData: TickInput) {
  await db.execute(
    `INSERT INTO boardsesh_ticks (id, uuid, board_type, climb_uuid, angle, status,
     attempt_count, quality, difficulty, comment, climbed_at, is_mirror, is_benchmark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      crypto.randomUUID(),
      tickData.boardType,
      tickData.climbUuid,
      tickData.angle,
      tickData.status,
      tickData.attemptCount,
      tickData.quality,
      tickData.difficulty,
      tickData.comment ?? '',
      new Date().toISOString(),
      tickData.isMirror ?? false,
      tickData.isBenchmark ?? false,
    ],
  );
  // Immediately visible in useQuery() hooks.
  // uploadData() pushes to server on next sync.
}
```

## Database setup

```typescript
import { PowerSyncDatabase } from '@powersync/react-native';
import { BoardseshConnector } from './connector';
import { schema } from './schema';

const db = new PowerSyncDatabase({
  schema,
  database: { dbFilename: 'boardsesh.sqlite' },
});

const connector = new BoardseshConnector();
await db.connect(connector);
```

The PowerSync client schema is a declarative definition of the local SQLite tables. It is not a migration target — when columns change, the client schema is updated and PowerSync handles the rest.

```typescript
import { Schema, Table, Column, ColumnType } from '@powersync/react-native';

const schema = new Schema([
  // User data (synced bidirectionally)
  new Table('boardsesh_ticks', [
    new Column('uuid', ColumnType.TEXT),
    new Column('user_id', ColumnType.TEXT),
    new Column('board_type', ColumnType.TEXT),
    new Column('climb_uuid', ColumnType.TEXT),
    new Column('angle', ColumnType.INTEGER),
    new Column('is_mirror', ColumnType.INTEGER),
    new Column('status', ColumnType.TEXT),
    new Column('attempt_count', ColumnType.INTEGER),
    new Column('quality', ColumnType.INTEGER),
    new Column('difficulty', ColumnType.INTEGER),
    new Column('is_benchmark', ColumnType.INTEGER),
    new Column('comment', ColumnType.TEXT),
    new Column('climbed_at', ColumnType.TEXT),
    new Column('session_id', ColumnType.TEXT),
    new Column('inferred_session_id', ColumnType.TEXT),
    new Column('board_id', ColumnType.INTEGER),
    new Column('created_at', ColumnType.TEXT),
    new Column('updated_at', ColumnType.TEXT),
  ]),
  new Table('playlists', [
    new Column('uuid', ColumnType.TEXT),
    new Column('board_type', ColumnType.TEXT),
    new Column('layout_id', ColumnType.INTEGER),
    new Column('name', ColumnType.TEXT),
    new Column('description', ColumnType.TEXT),
    new Column('is_public', ColumnType.INTEGER),
    new Column('color', ColumnType.TEXT),
    new Column('icon', ColumnType.TEXT),
    new Column('created_at', ColumnType.TEXT),
    new Column('updated_at', ColumnType.TEXT),
  ]),
  new Table('playlist_climbs', [
    new Column('playlist_id', ColumnType.TEXT),
    new Column('climb_uuid', ColumnType.TEXT),
    new Column('angle', ColumnType.INTEGER),
    new Column('position', ColumnType.INTEGER),
  ]),
  new Table('user_favorites', [
    new Column('user_id', ColumnType.TEXT),
    new Column('board_name', ColumnType.TEXT),
    new Column('climb_uuid', ColumnType.TEXT),
    new Column('angle', ColumnType.INTEGER),
  ]),
  new Table('user_follows', [
    new Column('follower_id', ColumnType.TEXT),
    new Column('following_id', ColumnType.TEXT),
  ]),
  new Table('setter_follows', [
    new Column('follower_id', ColumnType.TEXT),
    new Column('setter_username', ColumnType.TEXT),
  ]),
  new Table('playlist_follows', [
    new Column('follower_id', ColumnType.TEXT),
    new Column('playlist_uuid', ColumnType.TEXT),
  ]),
  new Table('user_playlist_pins', [
    new Column('user_id', ColumnType.TEXT),
    new Column('playlist_uuid', ColumnType.TEXT),
  ]),

  // Board reference data (read-only, synced per-board via Sync Streams)
  new Table('board_climbs', [
    new Column('uuid', ColumnType.TEXT),
    new Column('board_type', ColumnType.TEXT),
    new Column('layout_id', ColumnType.INTEGER),
    new Column('setter_id', ColumnType.INTEGER),
    new Column('setter_username', ColumnType.TEXT),
    new Column('name', ColumnType.TEXT),
    new Column('description', ColumnType.TEXT),
    new Column('frames', ColumnType.TEXT),
    new Column('angle', ColumnType.INTEGER),
    new Column('frames_count', ColumnType.INTEGER),
    new Column('frames_pace', ColumnType.INTEGER),
    new Column('is_listed', ColumnType.INTEGER),
    new Column('is_draft', ColumnType.INTEGER),
    new Column('edge_left', ColumnType.INTEGER),
    new Column('edge_right', ColumnType.INTEGER),
    new Column('edge_bottom', ColumnType.INTEGER),
    new Column('edge_top', ColumnType.INTEGER),
    new Column('hsm', ColumnType.INTEGER),
  ]),
  new Table('board_climb_stats', [
    new Column('board_type', ColumnType.TEXT),
    new Column('climb_uuid', ColumnType.TEXT),
    new Column('angle', ColumnType.INTEGER),
    new Column('display_difficulty', ColumnType.REAL),
    new Column('benchmark_difficulty', ColumnType.REAL),
    new Column('ascensionist_count', ColumnType.INTEGER),
    new Column('difficulty_average', ColumnType.REAL),
    new Column('quality_average', ColumnType.REAL),
    new Column('fa_username', ColumnType.TEXT),
    new Column('fa_at', ColumnType.TEXT),
  ]),
  new Table('board_difficulty_grades', [
    new Column('board_type', ColumnType.TEXT),
    new Column('difficulty', ColumnType.INTEGER),
    new Column('boulder_name', ColumnType.TEXT),
    new Column('route_name', ColumnType.TEXT),
    new Column('font_grade', ColumnType.TEXT),
  ]),
  // ... board_products, board_product_sizes, board_layouts, board_holes,
  //     board_leds, board_placements, board_placement_roles, board_sets,
  //     board_product_sizes_layouts_sets, board_attempts
  //     following the same pattern from packages/db/src/schema/boards/unified.ts
]);
```

## What stays the same

| Component | Status |
|---|---|
| `react-native-mmkv` | KV preferences: active board, theme, onboarding, enabled boards list |
| TanStack Query | Server-state for network-only data: nearby sessions, public profiles, feeds, notifications |
| GraphQL subscriptions | Real-time party mode: queue sync, session events, driver control |
| `expo-secure-store` | Auth tokens in iOS Keychain / Android Keystore |
| Backend GraphQL API | Unchanged. All existing mutations, queries, subscriptions stay as-is. |
| Aurora sync daemon | Unchanged. Picks up ticks without `aurora_id` and pushes to Aurora API. |

## What stays on TanStack Query (network-only)

- `nearbySessions` — real-time session discovery
- `publicProfile` — other users' profiles (not synced offline)
- `activityFeed` / `trendingFeed` — social feeds
- `notifications` — push-driven
- `sessionSummary` — party mode data
- Server-side search (when online, for richer results than local SQLite)

## Account lifecycle

PowerSync's local SQLite contains user-scoped data. On logout or account switch:

1. Call `db.disconnectAndClear()` — wipes the local database and disconnects from PowerSync.
2. On new login, PowerSync re-syncs from scratch (user data) or from CDN seed (board data).

This prevents user A's data from leaking to user B on a shared device.

## Performance targets

| Metric | Target | Notes |
|---|---|---|
| Local climb search | < 100ms p95 | SQLite query on indexed columns |
| Tick write (offline) | < 10ms | Single SQLite INSERT, no network |
| Incremental sync | < 2s for typical session | PowerSync streams changes in real-time via CDC |
| Initial board seed | < 30s on LTE | ~40MB compressed download from CDN |
| Memory (idle, 3 boards) | < 5MB for PowerSync | SQLite on disk, not in memory |
| Cold start overhead | < 50ms | PowerSync SDK init |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MongoDB adds operational complexity | Medium | Medium | Railway has MongoDB templates. PowerSync docs have production guides. |
| Postgres replication slot grows if PowerSync is down | Medium | Medium | Set `max_slot_wal_keep_size`. Monitor slot size. PowerSync resumes from LSN. |
| Initial sync slow for boards without CDN seed | Medium | Medium | CDN seed files for all boards with > 10K climbs. Progress indicator. |
| PowerSync service downtime blocks new sync | Low | Medium | Offline reads/writes still work. Sync resumes when service recovers. |
| FSL license non-compete clause | Low | Low | Boardsesh is not a sync product. Converts to open source after 2 years. |
| Sync Rules SQL complexity | Medium | Low | Test against dev DB. PowerSync has a sync rules testing tool. |
| CDN seed schema versioning | Medium | Medium | Trigger seed rebuild on schema changes, not just nightly. Include schema version in manifest. |

## Implementation timeline

PowerSync reduces implementation effort because there is no custom sync endpoint, no soft-delete migration, and the seed pipeline is simpler (PowerSync handles incremental updates automatically after seeding).

### Phase 1 addition (Foundation, +1 day)

- Install `@powersync/react-native`, configure `PowerSyncDatabase`.
- Define client schema matching synced Postgres tables.
- Set up `BoardseshConnector` with `uploadData()` calling existing GraphQL mutations.

### Phase 2 addition (Core experience, +2 days)

- Deploy PowerSync service + MongoDB on Railway.
- Configure Postgres logical replication.
- Write and test Sync Rules against dev DB.
- Wire `useQuery()` hooks for climb browsing, tick display, playlist listing.
- Test offline tick creation → reconnect → verify round-trip.

### Phase 5 changes (Platform features, -7 days)

- **Remove:** Custom mutation queue, idempotency key dedup table, single-concurrency drainer.
- **Remove:** Custom sync endpoint (`/api/sync/pull`, `/api/sync/push`).
- **Keep:** CDN seed file pipeline (GitHub Action → R2) for fast initial board loading.
- **Add:** Per-board toggle UI, seed import logic, board manifest endpoint.
- **Add:** Sync status indicator ("last synced X minutes ago").

### Net timeline impact

+3 days in Phases 1-2, -7 days in Phase 5. **Net: -4 days** saved versus the original `expo-sqlite` + custom queue plan.

## Verification

### Offline tick flow
1. Put device in airplane mode.
2. Open a climb, record a tick.
3. Verify tick appears immediately in the logbook (`useQuery()` reactivity).
4. Restore network. Wait for `uploadData()` to fire.
5. Verify tick appears in the web app's logbook.
6. Verify climb stats are recomputed (PowerSync streams the updated stats back).

### Server-to-mobile sync
1. Log a tick on the web app.
2. Verify the tick appears on the mobile app within seconds (CDC → PowerSync → client).

### Board selective sync
1. Open Settings > Offline Boards.
2. Toggle Kilter on. Verify CDN seed download + progress indicator.
3. Browse Kilter climbs in airplane mode.
4. Toggle Kilter off. Verify reference data cleared.
5. Toggle Tension on. Verify only Tension data downloaded.

### Conflict resolution
1. Create a tick offline on mobile.
2. Before syncing, edit the same climb's stats on the web.
3. Sync mobile. Verify `saveTick` mutation succeeds (idempotent by UUID).
4. Verify climb stats reflect both the web edit and the new tick.

### Infrastructure
1. Stop PowerSync service. Verify offline reads/writes still work.
2. Restart PowerSync service. Verify pending writes sync and new changes stream.
3. Monitor Postgres replication slot size under normal use.
