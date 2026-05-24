# Offline Sync Plan

Offline data layer for the React Native mobile app. Uses PowerSync (self-hosted) for automatic sync between the client SQLite database and Postgres. Ships a pre-warmed PowerSync database as an app asset for instant offline access to all ~10 boards.

Replaces the `expo-sqlite` + custom mutation queue approach from [mobile-app-plan.md](mobile-app-plan.md).

## Why PowerSync

We evaluated WatermelonDB and PowerSync. PowerSync is the recommendation.

### WatermelonDB — evaluated, not recommended

WatermelonDB provides reactive observable queries, a built-in `synchronize()` protocol, and lazy loading. However, it has structural problems that surfaced during review:

1. **Soft delete required.** WatermelonDB's sync protocol requires the server to report deleted record IDs. Since Postgres uses hard deletes, every syncable table would need a `deleted_at` column — modifying 120+ existing query sites and rebuilding unique indexes as partial indexes.
2. **Maintenance risk.** Single-maintainer project (Nozbe). Last release (v0.28) over a year ago. Known React Native New Architecture compatibility issues (GitHub #1851).
3. **Single global sync timestamp.** `synchronize()` uses one `lastPulledAt` for all tables. Per-board selective sync needs per-board timestamps.
4. **Custom sync endpoint needed.** A new REST endpoint separate from the existing GraphQL API, with duplicated auth/error handling.

### PowerSync — recommended

PowerSync uses Postgres logical replication (CDC) to detect changes and stream them to clients. The write path calls existing GraphQL mutations. No custom sync endpoint, no soft-delete migration, no schema changes to existing tables.

| Problem | PowerSync Solution |
|---|---|
| Soft delete (120+ query sites) | CDC detects real DELETEs via logical replication. No schema changes. |
| Maintenance risk | JourneyApps team, monthly releases, RN New Architecture supported |
| Single `lastPulledAt` for all boards | Sync Streams with independent per-board sync state |
| Custom sync endpoint | No sync endpoint — reads Postgres WAL; writes use existing GraphQL mutations |
| Two migration systems | One system (Drizzle). PowerSync client schema is declarative. |

**Tradeoffs:**
- Adds infrastructure: PowerSync service + MongoDB on Railway (~$70-80/mo for production)
- FSL license — non-compete clause (cannot build a competing sync product). Auto-converts to OSI open source after 2 years.
- Requires Postgres logical replication enabled (Railway supports this)

## Architecture

```
React Native App
  ├── Pre-warmed SQLite (ships with app, all boards, ~150-200MB)
  ├── PowerSync SDK manages the SQLite, syncs incrementally
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

### Read path

1. On first launch, the app copies the pre-warmed PowerSync SQLite database from app assets.
2. All board reference data is immediately available offline — no download, no sync wait.
3. PowerSync connects to the service and syncs incrementally from where the pre-warmed database was built.
4. Changes to synced tables are detected via Postgres WAL and streamed to the client.
5. React components using `useQuery()` re-render automatically.

### Write path

1. User creates a tick offline → written to local SQLite immediately.
2. `useQuery()` hooks re-render instantly (no network round-trip).
3. PowerSync SDK queues the write in its FIFO upload queue.
4. When online, `uploadData()` fires, calling the existing GraphQL mutation (`saveTick`).
5. Backend processes the mutation with all side effects (climb stats, inferred sessions, social events, Aurora sync queuing).
6. Postgres row is inserted/updated.
7. PowerSync detects the change via CDC and streams it back to the client (confirming the write).

## Pre-warmed PowerSync database

Instead of downloading reference data on first use (CDN seeds or PowerSync initial sync), the app ships with a pre-built PowerSync SQLite database as an app asset. This gives instant offline access to all ~10 boards from first launch.

### How it works

1. A CI pipeline (GitHub Action) spins up a PowerSync service + Postgres with production data.
2. A headless PowerSync client connects and fully syncs all tables (all boards, all reference data).
3. The resulting SQLite file — including PowerSync's internal sync metadata (checkpoints, oplog) — is captured.
4. This file is included as an Expo asset in the app bundle (~150-200MB compressed).
5. On first launch, the app copies this file to PowerSync's database location.
6. PowerSync opens it, finds valid sync state, and syncs incrementally from where the snapshot was taken.

### Why this works

PowerSync's client database is standard SQLite with internal metadata tables that track sync state (bucket checkpoints, oplog entries, LSN positions). By capturing the database AFTER a full sync through the actual PowerSync protocol, all internal metadata is correct. PowerSync's sync engine treats it as a client that was fully synced at snapshot time and just needs to catch up on changes since then.

### Build pipeline

```
GitHub Action (on schema change + weekly)
  ├── Start PowerSync service + Postgres (Docker Compose)
  ├── Load production board data snapshot into Postgres
  ├── Run headless PowerSync client → full sync
  ├── Capture the SQLite database file
  ├── Compress and include as Expo asset
  └── Commit to the mobile app repo
```

The Action is triggered on:
- Schema changes (Drizzle migrations in `packages/db/drizzle/`)
- Weekly schedule (to keep climb data reasonably fresh)
- Manual trigger (for ad-hoc updates)

### PoC requirement

**This approach must be validated with a proof-of-concept before Phase 2 implementation.** The PoC must verify:

1. A pre-built PowerSync SQLite file can be placed at PowerSync's expected database path before SDK initialization.
2. PowerSync opens it without treating the existing data as corruption.
3. Incremental sync resumes correctly (no re-downloading of existing data).
4. The production PowerSync service accepts sync from a client whose database was built against a different (but compatible) service instance.

If the PoC fails, the fallback is pure PowerSync sync with no pre-warming — users wait 3-5 minutes on first board enable. The app still works; it's just slower on first use.

### App size

| Content | Compressed size |
|---|---|
| App binary (RN + native modules) | ~30 MB |
| Pre-warmed database (all boards) | ~150-200 MB |
| **Total** | **~180-230 MB** |

App Store allows cellular download up to 200MB. Google Play has a 150MB APK limit but supports Play Asset Delivery for larger apps. The pre-warmed database should use Play Asset Delivery on Android.

### Staleness

The pre-warmed database is as fresh as the last CI build (weekly + on schema change). New climbs added after the build appear once the user connects and PowerSync syncs incrementally. For boards with active setters adding 50+ climbs/day, data could be up to a week stale on first launch. PowerSync catches up within seconds of first connection.

## Infrastructure (self-hosted on Railway)

| Component | Dev | Prod | Cost |
|---|---|---|---|
| PowerSync Service | 1 container, 512MB | 1 container, 1GB | ~$10/mo |
| MongoDB | 1 node, 2GB (replica set mode) | 3-node replica set, 2GB each | ~$60/mo |
| Postgres | Existing instance | Existing instance | $0 |
| **Total** | **~$20/mo** | **~$70/mo** | |

### Postgres configuration

Enable logical replication on the Railway Postgres instance:

```sql
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_replication_slots = 4;
ALTER SYSTEM SET max_wal_senders = 4;
-- Limit WAL retention to prevent disk exhaustion if PowerSync goes down
ALTER SYSTEM SET max_slot_wal_keep_size = '1GB';
```

Create a replication user for PowerSync:

```sql
CREATE ROLE powersync_role WITH LOGIN REPLICATION PASSWORD '...';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;
```

### PowerSync service deployment

Pin a specific version (not `latest`) to prevent breaking changes on redeploy:

```yaml
services:
  powersync:
    image: journeyapps/powersync-service:1.3.0
    environment:
      POWERSYNC_CONFIG: /config/powersync.yaml
    volumes:
      - ./powersync.yaml:/config/powersync.yaml

  mongo:
    image: mongo:7
    command: --replSet rs0
```

After first deploy, initialize the MongoDB replica set:

```bash
mongosh --eval 'rs.initiate()'
```

### powersync.yaml configuration

```yaml
replication:
  type: postgresql
  uri: postgresql://powersync_role:PASSWORD@postgres-host:5432/boardsesh
  slot_name: powersync_slot

storage:
  type: mongodb
  uri: mongodb://mongo-host:27017/powersync

# JWT validation — PowerSync validates JWTs signed by the backend
client_auth:
  jwks_uri: https://api.boardsesh.com/.well-known/jwks.json
  # OR use a shared symmetric secret:
  # supabase_jwt_secret: <shared-secret>

# The user_id claim in the JWT, accessible as token_parameters.user_id in Sync Rules
token_parameters:
  user_id:
    claim: sub

sync_rules:
  # Inline or path to sync rules file
  path: /config/sync-rules.yaml
```

The backend must issue JWTs with `sub` set to the authenticated user's ID. The `BoardseshConnector.fetchCredentials()` method obtains this JWT:

```typescript
class BoardseshConnector extends AbstractPowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const token = await getAuthToken(); // from expo-secure-store
    return {
      endpoint: POWERSYNC_URL,
      token,
    };
  }
}
```

## Sync Rules

### Composite primary key handling

PowerSync requires every synced table to have a single text `id` column. Many Boardsesh tables use composite PKs or integer PKs. The Sync Rules must synthesize a text `id` for each row.

Strategy per PK type:
- **Tables with `uuid` column** (ticks, playlists, climbs): use `uuid` as `id`
- **Tables with composite PK** (climb_stats, difficulty_grades): concatenate components
- **Tables with integer `id` + `board_type`**: concatenate `board_type:id`
- **Tables with bigserial PK only** (favorites, follows, playlist_climbs): cast to text

### Per-user data (always synced)

```yaml
bucket_definitions:
  user_ticks:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - >
        SELECT uuid AS id, uuid, user_id, board_type, climb_uuid, angle,
          is_mirror, status, attempt_count, quality, difficulty, is_benchmark,
          comment, climbed_at, session_id, inferred_session_id, board_id,
          created_at, updated_at
        FROM boardsesh_ticks
        WHERE user_id = bucket.user_id

  user_playlists:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - >
        SELECT p.uuid AS id, p.uuid, p.board_type, p.layout_id, p.name,
          p.description, p.is_public, p.color, p.icon,
          p.created_at, p.updated_at, p.last_accessed_at
        FROM playlists p
        JOIN playlist_ownership po ON p.id = po.playlist_id
        WHERE po.user_id = bucket.user_id

  user_playlist_climbs:
    parameters: >
      SELECT DISTINCT po.playlist_id
      FROM playlist_ownership po
      WHERE po.user_id = token_parameters.user_id
    data:
      - >
        SELECT pc.id::text AS id, pc.playlist_id::text AS playlist_id,
          pc.climb_uuid, pc.angle, pc.position, pc.added_at
        FROM playlist_climbs pc
        WHERE pc.playlist_id = bucket.playlist_id

  user_favorites:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - >
        SELECT id::text AS id, user_id, board_name, climb_uuid, angle, created_at
        FROM user_favorites
        WHERE user_id = bucket.user_id

  user_follows:
    parameters: "SELECT token_parameters.user_id as user_id"
    data:
      - >
        SELECT id::text AS id, follower_id, following_id, created_at
        FROM user_follows
        WHERE follower_id = bucket.user_id
      - >
        SELECT id::text AS id, follower_id, setter_username, created_at
        FROM setter_follows
        WHERE follower_id = bucket.user_id
      - >
        SELECT id::text AS id, follower_id, playlist_uuid, created_at
        FROM playlist_follows
        WHERE follower_id = bucket.user_id
      - >
        SELECT id::text AS id, user_id, playlist_id::text AS playlist_id
        FROM user_playlist_pins
        WHERE user_id = bucket.user_id
```

### Per-board reference data (synced via parameterized buckets)

Users enable boards for incremental sync. The pre-warmed database provides the initial data; these rules keep it fresh.

```yaml
  board_climbs:
    parameters: "SELECT request.parameters() ->> 'board_type' as board_type"
    data:
      - >
        SELECT uuid AS id, uuid, board_type, layout_id, setter_id,
          setter_username, name, description, frames, angle,
          frames_count, frames_pace, is_listed, is_draft,
          edge_left, edge_right, edge_bottom, edge_top, hsm,
          created_at, required_set_ids::text, compatible_size_ids::text
        FROM board_climbs
        WHERE board_type = bucket.board_type AND is_listed = true

  board_climb_stats:
    parameters: "SELECT request.parameters() ->> 'board_type' as board_type"
    data:
      - >
        SELECT board_type || ':' || climb_uuid || ':' || angle::text AS id,
          board_type, climb_uuid, angle, display_difficulty,
          benchmark_difficulty, ascensionist_count, difficulty_average,
          quality_average, fa_username, fa_at
        FROM board_climb_stats
        WHERE board_type = bucket.board_type

  board_reference:
    parameters: "SELECT request.parameters() ->> 'board_type' as board_type"
    data:
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          name, is_listed
        FROM board_products WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          product_id, edge_left, edge_right, edge_bottom, edge_top,
          name, description, image_url, is_listed
        FROM board_product_sizes WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          product_id, name, is_listed, password, image_url, is_adjustable,
          manufacturer_id
        FROM board_layouts WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          product_size_id, x, y, mirrored_hole_id, mirror_group
        FROM board_holes WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          product_size_id, hole_id, position
        FROM board_leds WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          layout_id, hole_id, set_id, default_placement_role_id
        FROM board_placements WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          product_id, position, name, full_name, led_color, screen_color
        FROM board_placement_roles WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          name, hsm
        FROM board_sets WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || difficulty::text AS id,
          board_type, difficulty, boulder_name, route_name, is_listed
        FROM board_difficulty_grades WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || product_size_id::text || ':' || layout_id::text || ':' || set_id::text AS id,
          board_type, product_size_id, layout_id, set_id, image_url, is_listed
        FROM board_product_sizes_layouts_sets WHERE board_type = bucket.board_type
      - >
        SELECT board_type || ':' || id::text AS id, board_type, id AS original_id,
          position, name
        FROM board_attempts WHERE board_type = bucket.board_type
```

## Per-board selective sync

Users choose which boards to keep fresh with incremental sync. All boards are browsable offline from the pre-warmed database; enabling a board means it gets real-time updates.

### User flow

1. On first launch, all ~10 boards are available offline from the pre-warmed database.
2. In Settings > Offline Boards, the user enables boards they actively use.
3. Enabled boards sync incrementally via PowerSync (new climbs, updated stats in real-time).
4. Non-enabled boards remain browsable from the pre-warmed data but grow stale over time.

### Client-side implementation

```typescript
function BoardSyncSettings({ boards }) {
  const [enabledBoards, setEnabledBoards] = useMMKVObject<string[]>('sync_boards');
  const db = usePowerSyncDatabase();

  useEffect(() => {
    // Update PowerSync's dynamic parameters to sync enabled boards
    db.updateSyncParameters({
      boards: enabledBoards ?? [],
    });
  }, [enabledBoards]);

  // UI renders board list with toggles
}
```

## Write path — reuses existing GraphQL mutations

PowerSync's `uploadData()` callback fires when the app is online and there are pending local writes. Each operation is handled individually with error handling to prevent stuck queues.

```typescript
class BoardseshConnector extends AbstractPowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const token = await getAuthToken();
    return { endpoint: POWERSYNC_URL, token };
  }

  async uploadData(database: PowerSyncDatabase) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    for (const op of transaction.crud) {
      try {
        await this.processOperation(op);
      } catch (error) {
        if (isRetryable(error)) {
          throw error; // PowerSync retries the whole transaction
        }
        // Non-retryable (validation error, 404, etc.) — log and skip
        console.error(`Skipping failed operation: ${op.table}/${op.op}`, error);
      }
    }

    await transaction.complete();
  }

  private async processOperation(op: CrudEntry) {
    switch (op.table) {
      case 'boardsesh_ticks':
        return this.handleTickOp(op);
      case 'user_favorites':
        return this.handleFavoriteOp(op);
      case 'playlists':
        return this.handlePlaylistOp(op);
      case 'playlist_climbs':
        return this.handlePlaylistClimbOp(op);
      case 'user_follows':
      case 'setter_follows':
      case 'playlist_follows':
        return this.handleFollowOp(op);
      case 'user_playlist_pins':
        return this.handlePlaylistPinOp(op);
    }
  }

  private async handleTickOp(op: CrudEntry) {
    switch (op.op) {
      case 'put':
        // Send client-generated UUID as idempotency key
        await this.graphql('saveTick', {
          input: {
            uuid: op.opData.uuid, // client-generated, server uses for dedup
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
        await this.graphql('deleteTick', { uuid: op.opData.uuid });
        break;
    }
  }

  private async handleFavoriteOp(op: CrudEntry) {
    if (op.op === 'put') {
      await this.graphql('addFavorite', {
        input: {
          boardName: op.opData.board_name,
          climbUuid: op.opData.climb_uuid,
          angle: op.opData.angle,
        },
      });
    } else if (op.op === 'delete') {
      await this.graphql('removeFavorite', {
        input: {
          boardName: op.opData.board_name,
          climbUuid: op.opData.climb_uuid,
          angle: op.opData.angle,
        },
      });
    }
  }

  private async handlePlaylistOp(op: CrudEntry) {
    switch (op.op) {
      case 'put':
        await this.graphql('createPlaylist', {
          input: {
            uuid: op.opData.uuid, // client-generated for dedup
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
            playlistUuid: op.opData.uuid,
            name: op.opData.name,
            description: op.opData.description,
            isPublic: op.opData.is_public,
            color: op.opData.color,
            icon: op.opData.icon,
          },
        });
        break;
      case 'delete':
        await this.graphql('deletePlaylist', { playlistUuid: op.opData.uuid });
        break;
    }
  }

  private async handlePlaylistClimbOp(op: CrudEntry) {
    if (op.op === 'put') {
      await this.graphql('addClimbToPlaylist', {
        input: {
          playlistUuid: op.opData.playlist_uuid,
          climbUuid: op.opData.climb_uuid,
          angle: op.opData.angle,
        },
      });
    } else if (op.op === 'delete') {
      await this.graphql('removeClimbFromPlaylist', {
        input: {
          playlistUuid: op.opData.playlist_uuid,
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

  private async handlePlaylistPinOp(op: CrudEntry) {
    if (op.op === 'put') {
      await this.graphql('pinPlaylist', {
        input: { playlistUuid: op.opData.playlist_uuid },
      });
    } else if (op.op === 'delete') {
      await this.graphql('unpinPlaylist', {
        input: { playlistUuid: op.opData.playlist_uuid },
      });
    }
  }
}
```

### Backend changes needed for idempotent writes

The `saveTick` mutation must accept a client-supplied `uuid` and use it for dedup:

```sql
INSERT INTO boardsesh_ticks (uuid, user_id, ...) VALUES ($uuid, $userId, ...)
ON CONFLICT (uuid) DO NOTHING
```

Similarly, `createPlaylist` must accept a client-supplied `uuid`. This is a small backend change (~10 lines per mutation) but is required for safe retry handling.

## React component integration

```typescript
import { useQuery } from '@powersync/react-native';

function useTicksForClimb(climbUuid: string, boardType: string) {
  return useQuery(
    'SELECT * FROM boardsesh_ticks WHERE climb_uuid = ? AND board_type = ? ORDER BY climbed_at DESC',
    [climbUuid, boardType],
  );
}

// Climb search — uses synthesized id from Sync Rules
function useClimbSearch(boardType: string, angle: number, filters: SearchFilters) {
  return useQuery(
    `SELECT c.*, cs.display_difficulty, cs.quality_average, cs.ascensionist_count
     FROM board_climbs c
     LEFT JOIN board_climb_stats cs ON c.uuid = cs.climb_uuid
       AND cs.id = c.board_type || ':' || c.uuid || ':' || ?
     WHERE c.board_type = ? AND c.is_listed = 1
     AND (? IS NULL OR cs.display_difficulty BETWEEN ? AND ?)
     ORDER BY cs.quality_average DESC
     LIMIT 50`,
    [angle, boardType, filters.minGrade, filters.minGrade, filters.maxGrade],
  );
}

function useUserPlaylists(boardType: string) {
  return useQuery(
    'SELECT * FROM playlists WHERE board_type = ? ORDER BY last_accessed_at DESC',
    [boardType],
  );
}

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
  const tickUuid = crypto.randomUUID();
  await db.execute(
    `INSERT INTO boardsesh_ticks (id, uuid, board_type, climb_uuid, angle, status,
     attempt_count, quality, difficulty, comment, climbed_at, is_mirror, is_benchmark,
     created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tickUuid, // PowerSync id = uuid for this table
      tickUuid,
      tickData.boardType,
      tickData.climbUuid,
      tickData.angle,
      tickData.status,
      tickData.attemptCount,
      tickData.quality,
      tickData.difficulty,
      tickData.comment ?? '',
      new Date().toISOString(),
      tickData.isMirror ? 1 : 0,
      tickData.isBenchmark ? 1 : 0,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
}
```

## What stays the same

| Component | Status |
|---|---|
| `react-native-mmkv` | KV preferences: active board, theme, onboarding, enabled boards list |
| TanStack Query | Server-state for network-only data: nearby sessions, public profiles, feeds, notifications |
| GraphQL subscriptions | Real-time party mode: queue sync, session events, driver control |
| `expo-secure-store` | Auth tokens in iOS Keychain / Android Keystore |
| Backend GraphQL API | Unchanged except: `saveTick` and `createPlaylist` accept client-supplied `uuid` for idempotent retry |
| Aurora sync daemon | Unchanged. Picks up ticks without `aurora_id` and pushes to Aurora API. |

## Account lifecycle

PowerSync's local SQLite contains user-scoped data. On logout or account switch:

1. Await `db.disconnectAndClear()` — wipes the local database and disconnects from PowerSync.
2. Re-copy the pre-warmed database from app assets (restores all board reference data).
3. On new login, PowerSync syncs the new user's data (small, seconds).

This prevents user A's data from leaking to user B. The `disconnectAndClear()` call must be awaited before navigating to the login screen.

## Monitoring

### Replication slot health

```sql
-- Run periodically, alert when lag exceeds 500MB
SELECT slot_name,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag_bytes
FROM pg_replication_slots
WHERE slot_name = 'powersync_slot';
```

If `max_slot_wal_keep_size` (set to 1GB) is exceeded, Postgres invalidates the slot. Recovery requires PowerSync to create a new slot and do a full re-snapshot. Monitor and alert before this happens.

### PowerSync service health

- Health check endpoint on the PowerSync container
- MongoDB bucket storage size (alert on unexpected growth)
- Upload queue depth (stuck batches indicate `uploadData()` failures)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pre-warmed DB PoC fails | Medium | High | Fallback: pure PowerSync sync, no pre-warming. Users wait 3-5 min on first board enable. |
| MongoDB ops complexity | Medium | Medium | Railway MongoDB templates. Pin version. Document replica set init. Budget 3-node prod. |
| Replication slot WAL fills disk | Medium | High | Set `max_slot_wal_keep_size = 1GB`. Monitor lag. Alert at 500MB. Document recovery procedure. |
| PowerSync version breaks on redeploy | Medium | Medium | Pin Docker image version. Test upgrades in staging before prod. |
| App size too large for Play Store | Low | Medium | Use Play Asset Delivery for the pre-warmed database on Android. |
| `request.parameters()` API unavailable in self-hosted | Medium | Medium | PoC validates this. Fallback: include board list in JWT claims and reconnect on change. |
| Composite PK synthesis makes queries verbose | Certain | Low | Accept this cost. Wrap common joins in helper functions. |
| Schema drift between Drizzle and client schema | Medium | Medium | CI step that validates PowerSync client schema against Drizzle schema definitions. |

## Implementation timeline

### Phase 0: PoC (2 days, gates everything)

- Build a minimal PowerSync app that syncs one table with composite PK.
- Verify `request.parameters()` works in self-hosted PowerSync.
- Test the pre-warmed database approach: build SQLite → copy to app → verify incremental sync.
- If PoC fails on pre-warming: fall back to pure PowerSync (no embedded data, accept first-sync delay).
- If PoC fails on `request.parameters()`: use JWT claims for board selection instead.

### Phase 1 addition (Foundation, +1 day)

- Install `@powersync/react-native`, configure `PowerSyncDatabase`.
- Define client schema with synthesized IDs matching Sync Rules.
- Set up `BoardseshConnector` with `fetchCredentials()` and `uploadData()`.
- Add client-supplied `uuid` parameter to `saveTick` and `createPlaylist` backend mutations.

### Phase 2 addition (Core experience, +3 days)

- Deploy PowerSync service + MongoDB on Railway.
- Configure Postgres logical replication and `max_slot_wal_keep_size`.
- Write and test Sync Rules against dev DB (with composite PK synthesis).
- Build the pre-warmed database pipeline (GitHub Action).
- Wire `useQuery()` hooks for climb browsing, tick display, playlist listing.
- Test offline tick creation → reconnect → verify round-trip.
- Set up replication slot monitoring.

### Phase 5 changes (Platform features, -5 days)

- **Remove:** Custom mutation queue, idempotency key dedup table, single-concurrency drainer.
- **Add:** Per-board sync toggle UI.
- **Add:** Sync status indicator ("last synced X minutes ago").

### Net timeline impact

+2 days PoC, +4 days in Phases 1-2, -5 days in Phase 5. **Net: +1 day** versus the original plan — essentially the same timeline but with less custom code and more robust sync.

## Verification

### PoC (Phase 0, gates implementation)
1. Create a PowerSync app that syncs `board_climb_stats` (composite PK).
2. Verify the synthesized ID (`board_type:climb_uuid:angle`) works in queries.
3. Build a pre-warmed SQLite, place it at PowerSync's database path.
4. Verify PowerSync opens it and syncs incrementally without re-downloading.
5. Verify `request.parameters()` works for per-board bucket selection.

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
2. Enable Kilter for incremental sync.
3. Add a new climb on web. Verify it appears on mobile within seconds.
4. Disable Kilter sync. Add another climb. Verify it does NOT appear on mobile.
5. Browse Kilter climbs in airplane mode — pre-warmed data still available.

### uploadData() resilience
1. Create a tick offline with a climb_uuid for a delisted climb.
2. Reconnect. Verify `uploadData()` logs the error and skips the operation (non-retryable).
3. Verify subsequent operations in the batch still succeed.
4. Verify the upload queue does not get stuck.

### Infrastructure
1. Stop PowerSync service. Verify offline reads/writes still work.
2. Restart PowerSync service. Verify pending writes sync and new changes stream.
3. Monitor Postgres replication slot size under normal use.
4. Simulate 24-hour PowerSync downtime. Verify WAL stays under 1GB. Verify recovery.
