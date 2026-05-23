# Kilter Sync

This document describes how Kilter Grips' backend (`portal.kiltergrips.com` REST + `sync1.kiltergrips.com` PowerSync stream) is consumed by Boardsesh — the analogue of [`aurora-sync.md`](aurora-sync.md) for Kilter. The wire-level spec for the upstream surface lives in [`KILTER_HTTP_API_SPEC.md`](KILTER_HTTP_API_SPEC.md) and [`KILTER_POWERSYNC_SPEC.md`](KILTER_POWERSYNC_SPEC.md); this doc covers what Boardsesh does with that surface.

> **Status**: design — implementation lives in a follow-up PR. Conventions here are how the runner *will* behave; the schema additions in §5 are migrations to be written.

## Overview

Kilter has split from Aurora's backend and runs on Keycloak + PowerSync + Postgres. Two flows:

1. **Catalog sync** (Kilter → Boardsesh, anonymous-ish). Periodic, cooldown-throttled. Pulls public climbs, walls, holds, hold sets, and the supporting reference tables into Boardsesh's `board_*` schema.
2. **Per-user sync** (bidirectional, opt-in). One PowerSync stream per cycle for one Kilter-linked user — pulls their logs/attempts/circuits/ratings into Boardsesh, then pushes Boardsesh-recorded ticks/ratings/circuits back to Kilter via the REST API.

The Bluetooth path is unchanged — Kilter's hardware uses the same Aurora-shared protocol covered in [`AURORA_BLUETOOTH_PROTOCOL_SPEC.md`](AURORA_BLUETOOTH_PROTOCOL_SPEC.md).

## Architecture

```
┌──────────────────────────┐                ┌─────────────────────┐
│  Keycloak                │  refresh_token │  Boardsesh daemon   │
│  idp.kiltergrips.com     │ ◀───────────── │  (Railway)          │
└────────────┬─────────────┘                └──────────┬──────────┘
             │ access_token JWT                        │
             ▼                                         │
┌──────────────────────────┐                           │
│  PowerSync stream        │ ─── oplog rows ──────────▶│  pull
│  sync1.kiltergrips.com   │                           │  (per user)
└──────────────────────────┘                           │
                                                       │  push
                                                       │  (per user)
┌──────────────────────────┐                           │
│  Kilter REST API         │ ◀────── /api/logs ───────│  POST
│  portal.kiltergrips.com  │ ◀────── /api/climb-rating│
└──────────────────────────┘ ◀────── /api/circuits ───┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │  Boardsesh Postgres │
                                            │  board_* / boardsesh_ticks /
                                            │  playlists / notifications│
                                            └─────────────────────┘
```

The same Keycloak access token authenticates both planes — no separate token exchange — so one credential per user covers pull and push.

### What we reuse from `aurora-sync`

| Existing piece | Used for |
| --- | --- |
| `aurora_credentials` (with column additions in §5) | Stores the encrypted Keycloak refresh token per `(userId, boardType='kilter')` |
| `user_board_mappings` | NextAuth user ↔ Kilter user UUID (Keycloak `sub`) |
| The crypto module (`AURORA_CREDENTIALS_SECRET`) | Same key, same AES-256-GCM scheme |
| `boardsesh_ticks` | Adds parallel `kilter*` columns alongside the existing `aurora*` columns — see §5 |
| `playlists` + `playlist_climbs` + `playlistOwnership` | Same circuit translation pattern as `aurora-sync/src/sync/user-sync.ts:325-389` |
| `board_*` catalog schema | Same FK-safe processing order as `aurora-sync/src/sync/shared-sync.ts:60-75` |
| `notifications` + `setter_follows` + `user_follows` | Same `new_climbs_synced` fan-out as `shared-sync.ts:892-986` |
| `recompute-climb-stats.ts` | Boardsesh-owned column stays the same — the three-writer extension only adds a new mirror column |

### What's new

- **PowerSync transport** in place of REST `/sync` long-poll. Implementation uses `@powersync/node` to drain a stream into a temporary local SQLite, then translates rows into Postgres.
- **Climb dedup** (§3) — Kilter's catalog has duplicate climbs at different UUIDs with identical hold layouts. We fingerprint holds and collapse duplicates behind aliases.
- **Bidirectional user sync** (§4) — `aurora-sync` is read-only; Kilter sync also pushes Boardsesh-recorded ticks back via the REST API.
- **Parallel identifier columns** — `kilterId` / `kilterType` / `kilterSyncedAt` / `kilterSyncError` sit alongside the existing `auroraId` / `auroraType` / etc. A single tick row can have both populated (Kilter historically imported Aurora logbooks, so the same logical ascent often has IDs in both systems).

## Authentication & Onboarding

One-time OAuth handshake served by Boardsesh:

1. User clicks "Connect Kilter account" in Boardsesh settings.
2. Boardsesh redirects to `idp.kiltergrips.com/realms/kilter/protocol/openid-connect/auth` with `response_type=code`, PKCE, `scope=openid profile email offline_access`, and a Boardsesh-owned `redirect_uri`.
3. User signs in at Keycloak; redirect returns with `?code=…`.
4. Boardsesh exchanges the code at the `/token` endpoint, receives `access_token` + `refresh_token` + `id_token`.
5. Boardsesh persists:
   - `aurora_credentials` row with `boardType='kilter'`, `encryptedRefreshToken=<encrypted>`, `syncStatus='pending'`.
   - `user_board_mappings` row with `boardType='kilter'`, `boardUserId=<sub from id_token>`, `boardUsername=<preferred_username>`.

Per sync cycle:

1. Daemon reads the encrypted refresh token, decrypts using the same crypto module aurora-sync uses.
2. POSTs to the Keycloak `/token` endpoint with `grant_type=refresh_token` to mint a fresh access token (5–15 min TTL).
3. Passes that JWT as `Authorization: Bearer …` to both the PowerSync stream and any REST push.
4. If Keycloak returns 401 (expired refresh), set `syncStatus='expired'` and stop trying. The Boardsesh UI surfaces a re-auth prompt; the user re-runs the OAuth handshake.

## Climb dedup

Kilter's catalog is **not UUID-clean** — the same climb (same hold layout, same board) can exist under multiple UUIDs with different names or setters. If we ingest each UUID as a separate `board_climbs` row the catalog gets noisy and per-climb stats fracture across duplicates. The dedup mechanism:

### Fingerprint

For every climb arriving from Kilter, compute:

```
fingerprint = sha256(
  sort(holds).map(h => `${h.holdId}:${h.holdState}:${h.frameNumber}`).join('|')
)
```

`holds` is the same data the existing aurora-sync `shared-sync.ts:604-620` already flattens out of the `frames` string via `convertLitUpHoldsStringToMap()`. Stored on `board_climbs.hold_fingerprint`, indexed on `(board_type, layout_id, hold_fingerprint)`.

### Alias table

```sql
CREATE TABLE board_climb_aliases (
  board_type       TEXT NOT NULL,
  alias_uuid       TEXT NOT NULL,
  canonical_uuid   TEXT NOT NULL,
  source           TEXT NOT NULL,     -- 'kilter' | 'aurora' | …
  first_seen_at    TIMESTAMP NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (board_type, alias_uuid)
);
```

Every Kilter UUID we ingest either becomes a canonical row in `board_climbs` (its UUID = `canonical_uuid` in the alias table) or an alias pointing at one that already exists.

### Ingestion rules

For each Kilter climb arriving via the catalog stream:

1. Compute `fingerprint`.
2. Lookup `SELECT uuid FROM board_climbs WHERE board_type='kilter' AND layout_id=$1 AND hold_fingerprint=$2`.
3. **Hit** — a canonical row already exists with the same hold layout:
   - Upsert `board_climb_aliases (board_type='kilter', alias_uuid=incoming.uuid, canonical_uuid=hit.uuid, source='kilter')`.
   - Cheap merge: if the canonical row's `name` / `description` is empty and the incoming has one, take it.
   - **Don't** insert a new `board_climbs` row.
   - Stats from the duplicate UUID (`climb_stats` for `incoming.uuid`) get applied to the canonical row — see §3.4.
4. **Miss** — no canonical with this fingerprint yet:
   - Insert as canonical (`board_climbs.uuid = incoming.uuid`, `hold_fingerprint = fingerprint`).
   - Upsert `board_climb_aliases (alias_uuid=incoming.uuid, canonical_uuid=incoming.uuid)` (self-alias, so downstream lookups always find an entry).

### Worked example

Two listed climbs come down the stream:

- `A`: UUID `aaaa-1111`, name `"Sloper Squeeze"`, setter `alice`, holds `[(12,start), (45,middle), (78,finish)]`, ascensionist_count 18.
- `B`: UUID `bbbb-2222`, name `"Squeeze the Slopers"`, setter `bob`, holds `[(12,start), (45,middle), (78,finish)]`, ascensionist_count 5.

`A` arrives first: fingerprint computed, no hit, canonical row created in `board_climbs` with `uuid=aaaa-1111`. Alias row `(aaaa-1111 → aaaa-1111)`. Stats: `kilter_ascensionist_count=18`.

`B` arrives second: same fingerprint, hits the canonical. Alias row `(bbbb-2222 → aaaa-1111)` added. `B`'s stats row keyed on `bbbb-2222` is **rekeyed** on insert: `UPSERT INTO board_climb_stats (climb_uuid=aaaa-1111, …) ON CONFLICT (…) DO UPDATE SET kilter_ascensionist_count = EXCLUDED.kilter_ascensionist_count + COALESCE(kilter_ascensionist_count, 0)` — the duplicate's 5 ascents accumulate onto the canonical's 18 for a total of 23.

Later, a user logs an ascent referencing `bbbb-2222`:

```
saveTick({ climbUuid: 'bbbb-2222', angle: 40, … })
  → resolveCanonicalClimbUuid('kilter', 'bbbb-2222') → 'aaaa-1111'
  → boardsesh_ticks.climbUuid = 'aaaa-1111'
```

The tick lands on the canonical row. The user's logbook UI can still display "you climbed Squeeze the Slopers" if `board_climb_aliases` retains the alias name (out of scope for v1 — keep it invisible).

### Resolution function

A single helper `resolveCanonicalClimbUuid(boardType, uuid) → uuid` is consulted by every downstream write that takes a Kilter `climb_uuid` (logs, attempts, climb_ratings, circuit_climbs, mounting_holes, tick saves from the GraphQL API). Implementation: small in-process cache populated per sync cycle from `board_climb_aliases`; on miss, query and cache.

### Tie-breakers and edge cases

- **Two canonicals with the same fingerprint at different layouts**: not a collision — fingerprint is unique per `(board_type, layout_id)`. Same hold layout on Kilter Original vs Homewall is genuinely two climbs.
- **A climb's holds change**: Kilter doesn't expose edits this way (every edit creates a new UUID via `/api/climbs/update-climb/transaction`), so the alias graph stays acyclic.
- **Two duplicates seen simultaneously with conflicting setters/names**: the first-seen UUID wins as canonical. If Kilter later changes which UUID they "promote", we don't follow — once a canonical, always a canonical.
- **Conflict resolution for the rare three-way duplicate**: log it, page nobody, take the existing canonical's word. Surface the count on a sync-health dashboard.

## Catalog sync (Flow A)

Periodic, **not long-lived**. Each cycle:

1. Acquire an access token (service account or piggyback — see §6).
2. Open a `@powersync/node` connection to `sync1.kiltergrips.com/sync/stream` scoped to the catalog buckets (all the global / public buckets — see [`KILTER_POWERSYNC_SPEC.md §6`](KILTER_POWERSYNC_SPEC.md#6-bucket-model-inferred)).
3. Wait for the initial `StreamingSyncCheckpointComplete`. PowerSync now has every catalog row in a local SQLite mirror.
4. For each table in the FK-safe processing order (mirroring `aurora-sync/src/sync/shared-sync.ts:60-75` — products → product_layouts → mounting_holes → holds → hold_sets → placement_types → difficulty_grades → climbs → climb_stats → climb_mounting_holes → climb_beta_links → walls), read the SQLite mirror and translate into Boardsesh's `board_*` tables.
5. Run the climb dedup logic from §3 for every `climbs` row.
6. After `climbs` ingest, gather the set of canonical UUIDs that were newly inserted (not just newly aliased) and call `createSetterSyncNotifications` exactly like `shared-sync.ts:892-986` does.
7. Close the PowerSync connection.

Cooldown: stamp `board_shared_syncs` with `lastSyncedAt = now()` before AND after the cycle. Default cooldown 1 hour — a successful or failed cycle both block the next one for the same window. Mirrors `aurora-sync/src/runner/sync-runner.ts:316-324`.

### Service account vs piggyback

PowerSync requires an authenticated client. Options:

- **Service account**: provision a Boardsesh-owned Kilter user (Keycloak signup via the normal flow), store its refresh token alongside the per-user creds, mark it as `syncStatus='service'` so the per-user runner ignores it. Catalog sync runs against this account on its own cadence.
- **Piggyback**: if no service account exists, the catalog cooldown check rides along with the per-user daemon — after a successful user sync, if the catalog cooldown elapsed, open a second short-lived stream using *that* user's token. Same shape as aurora-sync's shared-sync today.

V1 uses piggyback (no new account provisioning). The doc carries both designs so the service-account path is documented when we want to switch.

### Climb stats — three-writer model

`board_climb_stats.ascensionist_count` already follows a two-writer pattern with Aurora and Boardsesh. We extend it:

| Column | Owner | Updated by |
| --- | --- | --- |
| `aurora_ascensionist_count` | Aurora sync | `aurora-sync/src/sync/shared-sync.ts:411-468` |
| `kilter_ascensionist_count` | Kilter sync (this doc) | Kilter catalog sync's `upsertClimbStats` — written verbatim from the PowerSync `climb_stats` payload, rekeyed to canonical UUID where needed |
| `boardsesh_ascensionist_count` | Boardsesh recompute | `packages/backend/src/graphql/resolvers/ticks/recompute-climb-stats.ts` — unchanged |
| `ascensionist_count` | All three writers | `COALESCE(aurora,0) + COALESCE(kilter,0) + COALESCE(boardsesh,0)` recomputed on every write |

Same rule as today: whichever writer touches its own share also recomputes the sum in the same statement. Update `aurora-sync` and `recompute-climb-stats.ts` callsites in the same PR that introduces `kilter_ascensionist_count` so the sum stays consistent.

`fa_username` / `fa_at` follow the existing asymmetric rule. For Kilter-origin canonicals, Kilter wins. For Aurora-origin canonicals, Aurora wins. For Boardsesh-owned canonicals (`board_climbs.user_id IS NOT NULL`), Boardsesh recompute owns them. `quality_average` / `difficulty_average` / `display_difficulty` likewise — Kilter clobbers them on every sync for Kilter-origin canonicals, Boardsesh recompute only touches them for Boardsesh-owned climbs.

## Per-user sync (Flow B)

One PowerSync stream per cycle, one Kilter-linked user at a time. Inside the cycle, two phases:

### 4.1 Pull (Kilter → Boardsesh)

1. Refresh the user's access token from Keycloak.
2. Open a per-user PowerSync stream — server-side sync rules determine which buckets stream to this `sub`.
3. Wait for `StreamingSyncCheckpointComplete`, then read rows from the local SQLite mirror within a single `db.transaction()` (matching `aurora-sync/src/sync/user-sync.ts:509`).

| Kilter table | Boardsesh target | Notes |
| --- | --- | --- |
| `logs` | `boardsesh_ticks` with `status ∈ {flash,send}`, `kilterType='logs'`, `kilterId=<log_uuid>`; resolve `climb_uuid` via alias table | Mirrors `user-sync.ts:162-211` against the new `kilter*` columns |
| `attempts` | `boardsesh_ticks` with `status='attempt'`, `kilterType='attempts'`, `kilterId=<attempt_uuid>` | Mirrors `user-sync.ts:214-259` |
| `circuits` + `circuit_climbs` | `playlists` + `playlist_climbs` + `playlistOwnership`; record origin via `playlists.kilterId` | Full-replace pattern from `user-sync.ts:325-389` — delete then re-insert children. Existing `playlists.auroraId` untouched |
| `climb_ratings` | New `board_climb_ratings` table — see §5 | First-class table so push-back has a single source of truth |
| `user_settings` | `kilter_user_settings` (JSON blob, optional in v1) | Defer until we have a use case |
| `walls` where `gym_uuid IS NULL AND user_uuid = self` | `user_boards` | Homewalls appear in Boardsesh |
| `climbs` where `user_uuid = self AND is_listed = false` | Leave as alias-table entries only; don't promote drafts to public `board_climbs` | Drafts stay Kilter-local |

On transient errors (network, 5xx, timeout) leave `syncStatus` unchanged and re-throw — same policy as `sync-runner.ts:268-278`. On 401 from Keycloak, set `syncStatus='expired'`.

### 4.2 Push (Boardsesh → Kilter)

Selection query is on `kilterId IS NULL`, **independent** of `auroraId`. An Aurora-origin tick that the user wants on their Kilter logbook still needs to be sent.

```sql
SELECT * FROM boardsesh_ticks
WHERE userId = $1
  AND boardType = 'kilter'
  AND kilterId IS NULL
ORDER BY climbedAt
```

For each batch:

1. Resolve `climbUuid` through the alias table in reverse — prefer the Kilter-origin UUID if available. (If we chose the wrong canonical, the worst case is sending Kilter our UUID, which they don't recognize; sending them their own UUID is always safer.)
2. Group by status: `flash`/`send` → `POST /api/logs/bulk` with `topped=true`; `attempt` → same endpoint with `topped=false`. Confirm via traffic capture that `/api/logs/` accepts the `topped` flag for attempts; if Kilter exposes a separate attempts endpoint we'll switch (open question §7).
3. On 2xx, take the server-returned `logUuid` per row and write back: `kilterId = logUuid`, `kilterType = 'logs'` or `'attempts'`, `kilterSyncedAt = now()`. Leave `auroraId` and `auroraType` untouched.
4. On next pull the same row will mirror back through PowerSync — the upsert on `(boardType, kilterId)` is idempotent.

**Ratings push**: select `board_climb_ratings WHERE userId = $1 AND boardType = 'kilter' AND kilterId IS NULL` → `POST /api/climb-rating/` per row (Kilter's API doesn't expose a bulk variant) → write back the returned `climbRatingUuid` as `kilterId`.

**Circuit push**: select `playlists WHERE ownerId = $1 AND kilterId IS NULL AND <linked Kilter user>` → `POST /api/circuits` → for each climb in the playlist in order, `POST /api/circuit-climbs` with the position index. Kilter's `circuit_climbs.order` is integer-positional and the playlist's `playlist_climbs.position` already gives us the order.

### 4.3 Tick conflict resolution

Natural key on the Boardsesh side: `(userId, boardType, climbUuid, angle, climbedAt within ±60 seconds)`. Both `auroraId` and `kilterId` are cross-system surrogates — a single row can legitimately carry both.

Rules during pull:

1. If no row matches the natural key, insert with `kilterId` set.
2. If a row matches with `kilterId IS NULL`, **adopt** the Kilter ID — fill the column on the existing row. Don't touch `auroraId`.
3. If a row matches with `kilterId` already set to the same value, no-op (this is PowerSync's mirror echo of our own push).
4. If a row matches but `kilterId` is set to a *different* value: log the conflict, prefer the older `kilterSyncedAt`, do not silently overwrite. This is rare and almost always indicates a server-side Kilter merge we didn't see — surfacing it is more useful than hiding it.

## Schema changes

Migrations the implementation introduces. The first column on the table indicates whether it's a new object or an addition to an existing one.

| Change | Object | Notes |
| --- | --- | --- |
| add | `board_climbs.hold_fingerprint TEXT NULL` | `sha256` of sorted holds; backfill from `board_climb_holds` for existing rows |
| index | `board_climbs(board_type, layout_id, hold_fingerprint)` | Dedup lookup hot path |
| new | `board_climb_aliases (board_type, alias_uuid PK, canonical_uuid, source, first_seen_at, last_seen_at)` | Maps duplicate Kilter UUIDs onto canonicals |
| new | `board_climb_ratings (id, board_type, climb_uuid, angle, user_id, rating, difficulty_grade_id, comment, weight, kilter_id, aurora_id, created_at, updated_at)` | First-class ratings, both ID columns from day one (nullable, separate unique indexes) |
| add | `boardsesh_ticks.kilter_id TEXT NULL UNIQUE` | Kilter's log UUID after push or pull |
| add | `boardsesh_ticks.kilter_type` enum `'logs' \| 'attempts'` NULL | Mirrors `aurora_type` semantics |
| add | `boardsesh_ticks.kilter_synced_at TIMESTAMP NULL` | Last successful push or pull for this row |
| add | `boardsesh_ticks.kilter_sync_error TEXT NULL` | Last error from Kilter push |
| add | `playlists.kilter_id TEXT NULL UNIQUE` | Set on push; existing `aurora_id` untouched for Aurora-origin playlists |
| add | `board_climb_stats.kilter_ascensionist_count BIGINT NULL` | Third writer column |
| update | `board_climb_stats.ascensionist_count` recompute formula | `COALESCE(aurora,0) + COALESCE(kilter,0) + COALESCE(boardsesh,0)` in every callsite |
| relax | `aurora_credentials.encrypted_username`, `encrypted_password` NOT NULL | Drop NOT NULL — for `board_type='kilter'` rows these stay empty |
| add | `aurora_credentials.encrypted_refresh_token TEXT NULL` | Explicit column — clearer than overloading `encrypted_password` |
| add | `user_board_mappings.board_user_id_text TEXT NULL` | Holds Keycloak `sub` UUID — `board_user_id` integer column stays for Aurora users |
| new | `kilter_user_settings (user_id PK, payload JSONB, updated_at)` | Optional, deferred until first consumer |

A single `boardsesh_ticks` row carrying both `aurora_id` and `kilter_id` is **expected** — Kilter imported a wave of Aurora-exported logbooks early on, so a logical ascent that exists in both systems is normal. Treat it as the happy path, not an anomaly.

The `aurora_credentials` table name becomes misleading once it stores Kilter Keycloak tokens. A rename is out of scope for v1; the column additions are non-breaking. Track the rename in a follow-up.

## Daemon shape

Single daemon process mirroring `aurora-sync/src/runner/daemon.ts`:

- Quiet-hours-aware loop (`Australia/Sydney`, same as aurora-sync — keep one set of quiet hours across both daemons).
- One Kilter-linked user picked per cycle: oldest `lastSyncAt` first, NULL ahead of any timestamp.
- Random 1–15 minute delay between cycles.
- Abort signal honored mid-cycle.
- Catalog sync piggybacks: after a successful per-user cycle, if `board_shared_syncs.lastSyncedAt` for `board_type='kilter'` is older than the cooldown (1 hour default), open a second short-lived PowerSync stream for the catalog buckets, drain, close.
- Per-user serialization — one active stream per Keycloak `sub`. If the user has the Kilter app open we may get disconnected; treat as transient, retry next cycle.
- Schema-drift detection — if the stream emits a column we don't have in the translator, fail the cycle with a loud error and skip the user (but stamp `lastSyncAt` so they're not first in line next time). Same for inverse.

### CLI

New package `packages/kilter-sync/` mirroring the `aurora-sync` layout (`api`, `cli`, `db`, `runner`, `sync` subfolders).

```bash
# Sync catalog once
kilter-sync catalog
kilter-sync catalog -v

# Sync one user (NextAuth ID)
kilter-sync user <userId>

# Run the daemon
kilter-sync daemon

# List Kilter credentials
kilter-sync list
```

Environment variables:

```
DATABASE_URL=postgresql://…
AURORA_CREDENTIALS_SECRET=…    # same key, generalized over both boardTypes
KILTER_OAUTH_CLIENT_ID=…       # registered Keycloak client for Boardsesh's redirect handshake
KILTER_OAUTH_REDIRECT_URI=…    # Boardsesh-owned endpoint
```

The daemon deploys alongside aurora-sync on Railway, hitting the same `/sync-cron` style endpoint when invoked externally.

## Phased rollout

1. **Traffic capture** — sign in to Kilter with one of our accounts, capture the `/sync/stream` request. Confirms the Keycloak-token-is-PowerSync-token assumption, the wire content-type, and the first few `StreamingSyncCheckpoint` payloads. Closes the top open question.
2. **Standalone POC** — Node script outside the Boardsesh repo: authenticate one user against Keycloak, open a PowerSync stream, print the `logs` table rows. No DB writes.
3. **Promote to `packages/kilter-sync/`** — write into `board_climbs` and `boardsesh_ticks` behind a per-user feature flag. Read-only (no push to Kilter yet). Dedup logic + alias table land here.
4. **Catalog spin-up** — add the cooldown-throttled catalog cycle and the `kilter_ascensionist_count` writer. Update aurora-sync and the recompute path to recognize the new column in the sum.
5. **Push-back: logs first**, then ratings, then circuits — each behind its own flag. Watch for tick duplication after enabling logs.
6. **Production rollout** — flip off the per-user flag once dedup false-positive rate is under 0.5% on the spike data and one full week has elapsed with zero ticks lost or duplicated across enabled users.

## Open questions

These tie back to [`KILTER_POWERSYNC_SPEC.md §9`](KILTER_POWERSYNC_SPEC.md#9-open-questions-and-risks), plus integration-specific ones:

- **Attempts endpoint**: traffic capture needed to confirm that `POST /api/logs/` with `topped=false` is how Kilter records attempts, vs a separate `/api/attempts/` endpoint. Push-back design for `status='attempt'` ticks hinges on this.
- **Canonical tie-breaker policy** when two duplicate UUIDs both have setters and non-zero stats. Default is "first-seen UUID wins"; revisit if dedup spikes false-positives.
- **Alias visibility in UI**: a tick on `bbbb-2222` lands on canonical `aaaa-1111` — does the user see "Squeeze the Slopers" (the alias) or "Sloper Squeeze" (the canonical) in their logbook? V1: canonical name wins (invisible alias). Revisit if users complain.
- **Service-account provisioning**: when do we cut a Boardsesh-owned Kilter user for the catalog daemon? Piggyback is fine until we have zero opted-in Kilter users.
- **Refresh-token lifetime**: Keycloak defaults to 30 days idle. The daemon needs to detect this cleanly and surface a re-auth prompt — confirm Keycloak realm config when we get there.
