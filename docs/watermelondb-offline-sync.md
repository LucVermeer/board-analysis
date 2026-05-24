# WatermelonDB Offline Sync Plan

Offline data layer for the React Native mobile app. Replaces the `expo-sqlite` + custom mutation queue approach from [mobile-app-plan.md](mobile-app-plan.md) with WatermelonDB — one database for user data and board reference data, with built-in sync.

## Why WatermelonDB

The mobile app plan (v11.0, Phase 5) calls for three pieces of custom infrastructure: `expo-sqlite` for a local climb database, `react-native-mmkv` for key-value preferences, and a hand-built mutation queue with UUID v7 idempotency keys, a `mutation_dedup` server table, and a single-concurrency drainer. WatermelonDB replaces the first and third pieces.

**What it provides:**

- **Built-in `synchronize()` protocol.** Pull/push with timestamp-based delta sync. The server returns `{created, updated, deleted}` arrays per table since the last pull; the client sends its pending local changes. This replaces the entire custom mutation queue — the queue, the drainer, the idempotency key dedup table, and the per-mutation retry handling.
- **Observable queries.** Components subscribe to database queries and re-render when records change. A tick written offline immediately appears in the logbook list without manual cache invalidation.
- **Lazy loading.** Model objects are instantiated only when accessed. A board with 150K+ climbs in the database uses memory proportional to the visible window, not the full dataset.
- **Record-level dirty tracking.** WatermelonDB tracks which records have local changes and need pushing. No separate "pending mutations" table.
- **SQLite under the hood with JSI.** Same storage engine as expo-sqlite, but accessed via JSI (no bridge overhead). WatermelonDB's database files are standard SQLite, which enables pre-seeding from downloadable snapshots.

**What it does NOT replace:**

| Keep as-is | Why |
|---|---|
| `react-native-mmkv` | Synchronous reads for simple KV (active board, theme, onboarding flags). WatermelonDB is async and overkill for flat preferences. |
| TanStack Query | Server-state caching for network-only data (nearby sessions, search results, public profiles, feeds). |
| GraphQL subscriptions | Real-time party mode (queue sync, session events). WebSocket, not offline. |
| `expo-secure-store` | Auth tokens in iOS Keychain / Android Keystore. |

**Tradeoffs:**

- Adds a dependency (~300KB) and requires learning the decorator-based Model API.
- WatermelonDB schema migrations are manual (you write migration steps keyed by schema version), separate from Drizzle server migrations. Two migration systems to maintain.
- The sync protocol expects a REST-like endpoint, not GraphQL. A new Hono route is needed.
- Debugging: the ORM layer can obscure raw SQL. The SQLite database is inspectable via Flipper or expo-dev-client's database inspector.

## All-in-one database

Everything lives in a single WatermelonDB database — user data (ticks, playlists, favorites, follows) and board reference data (climbs, stats, holes, LEDs, placements). No separate expo-sqlite instance.

This works because:

1. **Lazy loading** — WatermelonDB only instantiates records when accessed. 500K climbs across 3 boards sitting in the database costs ~0 memory until queried.
2. **Per-board scoping** — every reference data record has a `board_type` column. Queries filter by the active board, and SQLite indexes make this fast.
3. **Pre-seeded SQLite** — initial board data is loaded by replacing the underlying SQLite file, not by running 500K individual INSERTs through the sync protocol.

## Per-board selective sync

Boardsesh supports ~10 boards (Kilter, Tension, MoonBoard, Decoy, Touchstone, Grasshopper, etc.), each with a large climb database. Users choose which boards to make available offline.

### User flow

1. On first launch (or in Settings > Offline Boards), the user sees a list of boards with estimated download sizes.
2. Toggling a board on downloads a compressed SQLite seed file from the CDN.
3. The seed is merged into the WatermelonDB database using a batch import.
4. After seeding, `synchronize()` handles incremental updates — new climbs, updated stats, new user ticks.
5. Toggling a board off deletes that board's reference data from the local database (user data like ticks is kept).

### Seed file pipeline

```
Postgres (prod) ──► GitHub Action (nightly) ──► SQLite export per board ──► gzip ──► Cloudflare R2
                                                                                         │
                                                                            Mobile app downloads
                                                                            on board toggle
```

Each seed file contains: `climbs`, `climb_stats`, `difficulty_grades`, `products`, `product_sizes`, `layouts`, `holes`, `leds`, `placements`, `placement_roles`, `sets`, `product_sizes_layouts_sets` — filtered to a single `board_type`.

The export script records the current server timestamp. After import, the app stores this as the board's `lastPulledAt` so subsequent `synchronize()` calls only pull changes since the seed was built.

### Estimated sizes per board

| Board | Climbs (approx) | Compressed seed |
|---|---|---|
| Kilter | ~200K | ~40 MB |
| Tension | ~100K | ~25 MB |
| MoonBoard | ~50K | ~15 MB |
| Others | ~10-30K each | ~5-10 MB each |

These are rough estimates. The GitHub Action measures actual sizes and updates a manifest file that the app reads to show download sizes.

## Schema design

### Three categories of tables

1. **Syncable user data** — participates in bidirectional `synchronize()`. Tables: `ticks`, `playlists`, `playlist_climbs`, `favorites`, `user_follows`, `setter_follows`.
2. **Board reference data** — pulled from server, never pushed. Tables: `climbs`, `climb_stats`, `difficulty_grades`, `products`, `product_sizes`, `layouts`, `holes`, `leds`, `placements`, `placement_roles`, `sets`, `product_sizes_layouts_sets`.
3. **Local-only data** — never synced, device-only. Tables: `tick_drafts`, `recent_playlists`. Uses WatermelonDB's `isLocal` option.

### User data models

These map to the Postgres schema in `packages/db/src/schema/app/`.

**Tick** (mirrors `boardsesh_ticks`):

```typescript
import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text } from '@nozbe/watermelondb/decorators';

export default class Tick extends Model {
  static table = 'ticks';
  static associations = {
    inferred_sessions: { type: 'belongs_to' as const, key: 'inferred_session_id' },
  };

  @text('uuid') uuid!: string;
  @text('board_type') boardType!: string;
  @text('climb_uuid') climbUuid!: string;
  @field('angle') angle!: number;
  @field('is_mirror') isMirror!: boolean;
  @text('status') status!: 'flash' | 'send' | 'attempt';
  @field('attempt_count') attemptCount!: number;
  @field('quality') quality!: number | null;
  @field('difficulty') difficulty!: number | null;
  @field('is_benchmark') isBenchmark!: boolean;
  @text('comment') comment!: string;
  @date('climbed_at') climbedAt!: Date;
  @text('session_id') sessionId!: string | null;
  @text('inferred_session_id') inferredSessionId!: string | null;
  @field('board_id') boardId!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
```

**Playlist** (mirrors `playlists` + `playlist_ownership`):

```typescript
export default class Playlist extends Model {
  static table = 'playlists';
  static associations = {
    playlist_climbs: { type: 'has_many' as const, foreignKey: 'playlist_id' },
  };

  @text('uuid') uuid!: string;
  @text('board_type') boardType!: string;
  @field('layout_id') layoutId!: number | null;
  @text('name') name!: string;
  @text('description') description!: string | null;
  @field('is_public') isPublic!: boolean;
  @text('color') color!: string | null;
  @text('icon') icon!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
```

**PlaylistClimb** (mirrors `playlist_climbs`):

```typescript
export default class PlaylistClimb extends Model {
  static table = 'playlist_climbs';
  static associations = {
    playlists: { type: 'belongs_to' as const, key: 'playlist_id' },
  };

  @text('playlist_id') playlistId!: string;
  @text('climb_uuid') climbUuid!: string;
  @field('angle') angle!: number | null;
  @field('position') position!: number;
  @date('added_at') addedAt!: Date;
}
```

**Favorite** (mirrors `user_favorites`):

```typescript
export default class Favorite extends Model {
  static table = 'favorites';

  @text('board_name') boardName!: string;
  @text('climb_uuid') climbUuid!: string;
  @field('angle') angle!: number;
  @readonly @date('created_at') createdAt!: Date;
}
```

### Board reference data models

These are read-only on the client. Populated by seed files and incremental sync pulls.

**Climb** (mirrors `board_climbs`):

```typescript
export default class Climb extends Model {
  static table = 'climbs';

  @text('climb_uuid') climbUuid!: string;
  @text('board_type') boardType!: string;
  @field('layout_id') layoutId!: number;
  @text('setter_username') setterUsername!: string | null;
  @text('name') name!: string | null;
  @text('frames') frames!: string | null;
  @field('angle') angle!: number | null;
  @field('frames_count') framesCount!: number;
  @field('is_listed') isListed!: boolean;
  @field('is_draft') isDraft!: boolean;
}
```

**ClimbStat** (mirrors `board_climb_stats`):

```typescript
export default class ClimbStat extends Model {
  static table = 'climb_stats';

  @text('board_type') boardType!: string;
  @text('climb_uuid') climbUuid!: string;
  @field('angle') angle!: number;
  @field('display_difficulty') displayDifficulty!: number | null;
  @field('ascensionist_count') ascensionistCount!: number | null;
  @field('difficulty_average') difficultyAverage!: number | null;
  @field('quality_average') qualityAverage!: number | null;
  @text('fa_username') faUsername!: string | null;
}
```

Additional reference models follow the same pattern for each table in `packages/db/src/schema/boards/unified.ts`: `DifficultyGrade`, `Product`, `ProductSize`, `Layout`, `Hole`, `Led`, `Placement`, `PlacementRole`, `Set`, `ProductSizeLayoutSet`. Each has a `board_type` field used as a query filter.

### WatermelonDB schema definition

```typescript
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    // Syncable user data
    tableSchema({
      name: 'ticks',
      columns: [
        { name: 'uuid', type: 'string' },
        { name: 'board_type', type: 'string' },
        { name: 'climb_uuid', type: 'string' },
        { name: 'angle', type: 'number' },
        { name: 'is_mirror', type: 'boolean' },
        { name: 'status', type: 'string' },
        { name: 'attempt_count', type: 'number' },
        { name: 'quality', type: 'number', isOptional: true },
        { name: 'difficulty', type: 'number', isOptional: true },
        { name: 'is_benchmark', type: 'boolean' },
        { name: 'comment', type: 'string' },
        { name: 'climbed_at', type: 'number' },
        { name: 'session_id', type: 'string', isOptional: true },
        { name: 'inferred_session_id', type: 'string', isOptional: true },
        { name: 'board_id', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'playlists',
      columns: [
        { name: 'uuid', type: 'string' },
        { name: 'board_type', type: 'string' },
        { name: 'layout_id', type: 'number', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'is_public', type: 'boolean' },
        { name: 'color', type: 'string', isOptional: true },
        { name: 'icon', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'playlist_climbs',
      columns: [
        { name: 'playlist_id', type: 'string' },
        { name: 'climb_uuid', type: 'string' },
        { name: 'angle', type: 'number', isOptional: true },
        { name: 'position', type: 'number' },
        { name: 'added_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'favorites',
      columns: [
        { name: 'board_name', type: 'string' },
        { name: 'climb_uuid', type: 'string' },
        { name: 'angle', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'user_follows',
      columns: [
        { name: 'following_id', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    // Board reference data (pulled, never pushed)
    tableSchema({
      name: 'climbs',
      columns: [
        { name: 'climb_uuid', type: 'string' },
        { name: 'board_type', type: 'string' },
        { name: 'layout_id', type: 'number' },
        { name: 'setter_username', type: 'string', isOptional: true },
        { name: 'name', type: 'string', isOptional: true },
        { name: 'frames', type: 'string', isOptional: true },
        { name: 'angle', type: 'number', isOptional: true },
        { name: 'frames_count', type: 'number' },
        { name: 'is_listed', type: 'boolean' },
        { name: 'is_draft', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'climb_stats',
      columns: [
        { name: 'board_type', type: 'string' },
        { name: 'climb_uuid', type: 'string' },
        { name: 'angle', type: 'number' },
        { name: 'display_difficulty', type: 'number', isOptional: true },
        { name: 'ascensionist_count', type: 'number', isOptional: true },
        { name: 'difficulty_average', type: 'number', isOptional: true },
        { name: 'quality_average', type: 'number', isOptional: true },
        { name: 'fa_username', type: 'string', isOptional: true },
      ],
    }),
    // ... difficulty_grades, products, product_sizes, layouts, holes,
    //     leds, placements, placement_roles, sets,
    //     product_sizes_layouts_sets
    //     following the same pattern from unified.ts
  ],
});
```

### ID strategy

WatermelonDB auto-generates string IDs for new records. The server's `uuid` column (on ticks, playlists, climbs) is the stable cross-system identifier. The `synchronize()` function uses `sendCreatedAsUpdated: true` since server-side bigserial PKs differ from WatermelonDB's client-generated string IDs.

On push, the client sends records keyed by WatermelonDB's `id`. The backend maps them to server-side records using the `uuid` field. On pull, the server returns records with WatermelonDB-compatible IDs derived from the `uuid`.

## Sync architecture

### WatermelonDB's synchronize() contract

```typescript
import { synchronize } from '@nozbe/watermelondb/sync';

await synchronize({
  database,
  sendCreatedAsUpdated: true,
  pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
    const response = await authenticatedFetch(
      `${BACKEND_URL}/api/sync/pull?last_pulled_at=${lastPulledAt ?? 0}&boards=${enabledBoards.join(',')}`,
    );
    const { changes, timestamp } = await response.json();
    return { changes, timestamp };
  },
  pushChanges: async ({ changes, lastPulledAt }) => {
    await authenticatedFetch(`${BACKEND_URL}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes, lastPulledAt }),
    });
  },
});
```

The `changes` object shape:

```typescript
{
  ticks:          { created: [...], updated: [...], deleted: ['id1', 'id2'] },
  playlists:      { created: [...], updated: [...], deleted: [] },
  playlist_climbs:{ created: [...], updated: [...], deleted: [] },
  favorites:      { created: [...], updated: [...], deleted: [] },
  climbs:         { created: [...], updated: [...], deleted: [] },
  climb_stats:    { created: [...], updated: [...], deleted: [] },
  // ...
}
```

### Backend sync endpoint

A new REST endpoint (not GraphQL) on the Hono backend. WatermelonDB's bulk sync payload maps poorly to GraphQL's typed query/mutation model — REST with a JSON body is simpler.

**Implementation:** `packages/backend/src/handlers/watermelon-sync.ts`

**Pull handler** — `GET /api/sync/pull?last_pulled_at=<timestamp>&boards=kilter,tension`

For each syncable table, queries Postgres for records where `updated_at > lastPulledAt`:

```sql
-- User data (scoped to authenticated user)
SELECT * FROM boardsesh_ticks WHERE user_id = $userId AND updated_at > $lastPulledAt;
SELECT p.* FROM playlists p JOIN playlist_ownership po ON ... WHERE po.user_id = $userId AND p.updated_at > $lastPulledAt;
SELECT * FROM user_favorites WHERE user_id = $userId AND created_at > $lastPulledAt;

-- Board reference data (scoped to enabled boards)
SELECT * FROM board_climbs WHERE board_type = ANY($boards) AND updated_at > $lastPulledAt;
SELECT * FROM board_climb_stats WHERE board_type = ANY($boards) AND updated_at > $lastPulledAt;
```

For deleted records, queries `deleted_at > lastPulledAt` (see soft delete section below).

**Push handler** — `POST /api/sync/push`

Processes client changes with ownership checks:

- **ticks.created**: `INSERT INTO boardsesh_ticks ... ON CONFLICT (uuid) DO NOTHING` (idempotent). After insert, triggers `assignInferredSession()` and `recomputeClimbStats()` — the same functions used by the existing `saveTick` GraphQL mutation.
- **ticks.updated**: `UPDATE boardsesh_ticks SET ... WHERE uuid = $uuid AND user_id = $userId`.
- **ticks.deleted**: soft-delete `SET deleted_at = NOW() WHERE uuid = $uuid AND user_id = $userId`.
- **playlists/playlist_climbs**: same pattern with ownership check via `playlist_ownership`.
- **favorites/follows**: upsert/soft-delete with user ownership check.

Reference data tables are never in the push payload — WatermelonDB knows they are server-authoritative because the client never writes to them.

### Aurora dual-write

When the push handler processes new ticks, it inserts them into `boardsesh_ticks` with `aurora_id = NULL`. The existing Aurora sync daemon (`packages/aurora-sync`) picks up ticks without `aurora_id` and pushes them to the Aurora API in its next cycle. No new Aurora integration needed — same flow as the current `saveTick` GraphQL mutation.

### Sync trigger points

| Trigger | When |
|---|---|
| App foreground | `AppState` listener, debounced to avoid rapid background/foreground cycles |
| Post-authentication | Immediately after login, pull all user data |
| Pull-to-refresh | User-initiated on logbook, playlists, or climb list screens |
| After local writes | Debounced (5s after last write) to push changes |
| Board toggled on | After seed import, initial sync to catch changes since seed was built |

`synchronize()` handles network failures gracefully — pending local changes stay in the dirty set and are pushed on the next successful sync.

## Conflict resolution

| Entity | Strategy | Rationale |
|---|---|---|
| Ticks | Client wins, UUID-idempotent | Write-once from a single user. `ON CONFLICT (uuid) DO NOTHING`. Edits are rare; last-write-wins on `updated_at`. |
| Playlists (metadata) | Last-write-wins by `updated_at` | Name/description changes are infrequent. Server keeps the later timestamp. |
| Playlist climbs | Set-union for adds, explicit delete for removes | Adding a climb is idempotent (unique on `playlist_id, climb_uuid`). Removing is an explicit delete. |
| Favorites | Toggle semantics | `ON CONFLICT DO NOTHING` for creates. Deletes are explicit. |
| Follows | Same as favorites | Idempotent creates, explicit deletes. |
| Board reference data | Server wins always | Client never pushes reference data. Server is authoritative. |

## Soft delete tracking

WatermelonDB's sync protocol requires the server to report which records were deleted since `lastPulledAt`. The current Postgres schema uses hard deletes. Add a `deleted_at` column to each syncable table:

```sql
ALTER TABLE boardsesh_ticks ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE playlists ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE playlist_climbs ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE user_favorites ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE user_follows ADD COLUMN deleted_at TIMESTAMP;
```

On delete, set `deleted_at = NOW()` instead of removing the row. The pull endpoint includes these IDs in the `deleted` array. A periodic cleanup job hard-deletes rows where `deleted_at < NOW() - 90 days`.

Existing GraphQL delete mutations (`deleteTick`, `removeClimbFromPlaylist`, `toggleFavorite`) are updated to set `deleted_at` instead of `DELETE FROM`.

## React component integration

### Observable hooks

```typescript
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';

function useTicksForClimb(climbUuid: string, boardType: string) {
  const database = useDatabase();
  const ticksCollection = database.get<Tick>('ticks');

  return useObservableState(
    ticksCollection.query(
      Q.where('climb_uuid', climbUuid),
      Q.where('board_type', boardType),
      Q.sortBy('climbed_at', Q.desc),
    ).observe(),
    [],
  );
}

function useUserPlaylists(boardType: string) {
  const database = useDatabase();
  return useObservableState(
    database.get<Playlist>('playlists').query(
      Q.where('board_type', boardType),
      Q.sortBy('updated_at', Q.desc),
    ).observe(),
    [],
  );
}
```

### Writing records offline

```typescript
async function saveTick(database: Database, tickData: TickInput) {
  await database.write(async () => {
    await database.get<Tick>('ticks').create((tick) => {
      tick.uuid = crypto.randomUUID();
      tick.boardType = tickData.boardType;
      tick.climbUuid = tickData.climbUuid;
      tick.angle = tickData.angle;
      tick.status = tickData.status;
      tick.attemptCount = tickData.attemptCount;
      tick.quality = tickData.quality;
      tick.difficulty = tickData.difficulty;
      tick.comment = tickData.comment ?? '';
      tick.climbedAt = new Date();
      tick.isMirror = tickData.isMirror ?? false;
      tick.isBenchmark = tickData.isBenchmark ?? false;
    });
  });
  // Record is immediately visible in observable queries.
  // synchronize() pushes it to the server on next sync.
}
```

### Climb search across user data and reference data

Both live in the same WatermelonDB database, so queries can join across them:

```typescript
function useClimbWithUserTicks(climbUuid: string, boardType: string) {
  const database = useDatabase();

  const climb = useObservableState(
    database.get<Climb>('climbs').query(
      Q.where('climb_uuid', climbUuid),
      Q.where('board_type', boardType),
    ).observe(),
    [],
  );

  const ticks = useObservableState(
    database.get<Tick>('ticks').query(
      Q.where('climb_uuid', climbUuid),
      Q.where('board_type', boardType),
    ).observe(),
    [],
  );

  return { climb: climb[0], ticks };
}
```

## Database setup

```typescript
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { migrations } from './migrations';
import Tick from './models/Tick';
import Playlist from './models/Playlist';
import PlaylistClimb from './models/PlaylistClimb';
import Favorite from './models/Favorite';
import Climb from './models/Climb';
import ClimbStat from './models/ClimbStat';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error) => {
    // Log to Sentry. If unrecoverable, wipe and re-sync.
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Tick, Playlist, PlaylistClimb, Favorite,
    Climb, ClimbStat,
    // ... other models
  ],
});
```

## What replaces what

| Current plan (expo-sqlite + custom queue) | WatermelonDB equivalent |
|---|---|
| `expo-sqlite` for refdata per board | WatermelonDB reference data tables, seeded from CDN SQLite files |
| Custom mutation queue with UUID v7 idempotency keys | WatermelonDB's built-in dirty tracking + `synchronize()` push |
| `mutation_dedup` server table (30-day expiry) | `ON CONFLICT (uuid) DO NOTHING` in push handler (idempotent) |
| Single-concurrency drainer in `createdAt` order | `synchronize()` handles ordering and retry |
| MMKV-based user data cache with SWR refresh | WatermelonDB observable queries (reactive, no manual refresh) |
| GraphQL `saveTick` mutation + optimistic update | `database.write(() => ticks.create(...))` + sync |
| GraphQL `toggleFavorite` mutation | `database.write(() => favorites.create/delete)` + sync |
| GraphQL `ticks` query + TanStack Query cache | WatermelonDB `ticks` table + observable hook |

## What stays on TanStack Query

These are network-only and don't need offline storage:

- `nearbySessions` — real-time discovery
- `publicProfile` — other users' profiles
- `activityFeed` / `trendingFeed` — social feeds
- `notifications` — push-driven
- `sessionSummary` — party mode data
- `searchClimbs` (server-side) — complex SQL search. Offline search runs against the local WatermelonDB climb data instead.

## Performance

| Metric | Target | Notes |
|---|---|---|
| Local climb search | < 100ms p95 | SQLite index on `(board_type, layout_id, is_listed)` |
| Tick write (offline) | < 10ms | Single SQLite INSERT, no network |
| Incremental sync | < 2s for typical session | ~50KB payload for a session's ticks + stats updates |
| Initial board seed | < 30s on LTE | ~40MB compressed download + bulk SQLite import |
| Memory (idle, 3 boards synced) | < 5MB for WatermelonDB | Lazy loading, no in-memory record cache |
| Cold start overhead | < 50ms | SQLiteAdapter init with JSI |

## Backend changes needed

1. **New handler:** `packages/backend/src/handlers/watermelon-sync.ts` — pull and push handlers.
2. **New routes:** Register in `packages/backend/src/server.ts` as `GET /api/sync/pull` and `POST /api/sync/push`.
3. **Soft delete migration:** Add `deleted_at` columns to `boardsesh_ticks`, `user_favorites`, `user_follows`, `playlists`, `playlist_climbs` via Drizzle migration.
4. **Pull query indexes:** Add `(user_id, updated_at)` indexes on syncable tables for efficient delta queries.
5. **Seed export script:** GitHub Action that exports per-board SQLite snapshots nightly to Cloudflare R2.
6. **Board manifest endpoint:** `GET /api/sync/boards` returning available boards with seed file URLs and sizes.

## Implementation timeline

WatermelonDB setup starts in Phase 1 (Foundation) since it's the data layer everything builds on. This is earlier than the current plan's Phase 5.

### Phase 1 addition (Foundation, +2 days)

- Install `@nozbe/watermelondb`, configure SQLiteAdapter with JSI, Metro babel plugin.
- Define schema and models for user data (ticks, playlists, favorites, follows).
- Set up database singleton in `packages/mobile/src/db/`.
- Define schema and models for reference data (climbs, climb_stats, etc.).

### Phase 2 addition (Core experience, +3 days)

- Implement sync endpoint on backend (`watermelon-sync.ts`).
- Implement `syncDatabase()` in mobile app with auth interceptor.
- Wire tick writes to WatermelonDB (offline-capable).
- Wire climb browsing to WatermelonDB observable queries.
- Wire playlist reads to WatermelonDB.
- Add soft-delete columns via Drizzle migration.

### Phase 5 changes (Platform features, -5 days)

- **Remove:** Custom mutation queue, idempotency key dedup table, single-concurrency drainer.
- **Remove:** MMKV-based user data cache with SWR refresh.
- **Keep:** Seed file pipeline (GitHub Action + R2).
- **Add:** Board manifest endpoint, per-board toggle UI, seed import logic.
- **Add:** Sync status indicator ("last synced X minutes ago").

### Net timeline impact

+5 days in Phases 1-2, -5 days in Phase 5. Net: **0 days** — the work shifts earlier but the total is the same, with less custom code to maintain long-term.

## Verification

### Offline tick flow
1. Put device in airplane mode.
2. Open a climb, record a tick (flash/send/attempt).
3. Verify tick appears immediately in the logbook (observable query).
4. Restore network. Trigger sync (pull-to-refresh or app foreground).
5. Verify tick appears in the web app's logbook.

### Server-to-mobile sync
1. Log a tick on the web app.
2. Open the mobile app (triggers sync on foreground).
3. Verify the tick appears in the mobile logbook.

### Board selective sync
1. Open Settings > Offline Boards.
2. Toggle Kilter on. Verify download starts and progress is shown.
3. After download, browse Kilter climbs in airplane mode.
4. Toggle Kilter off. Verify reference data is cleared but user ticks are preserved.
5. Toggle Tension on. Verify only Tension data is downloaded.

### Conflict resolution
1. Create a tick offline on mobile.
2. Before syncing, create a tick with the same UUID via the web (unlikely but possible in testing).
3. Sync mobile. Verify `ON CONFLICT DO NOTHING` — no duplicate, no crash.

### Large dataset
1. Sync a board with 200K+ climbs.
2. Scroll through the climb list. Verify 120fps (FlashList + lazy loading).
3. Search climbs. Verify < 100ms response.
4. Check memory. Verify < 150MB with board rendered.
