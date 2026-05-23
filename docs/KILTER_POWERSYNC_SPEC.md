# Kilter PowerSync Specification

**Covered version**: Kilter Board mobile app, current as of 2026-05-23
**Sibling docs**: [KILTER_HTTP_API_SPEC.md](KILTER_HTTP_API_SPEC.md), [AURORA_BLUETOOTH_PROTOCOL_SPEC.md](AURORA_BLUETOOTH_PROTOCOL_SPEC.md), [aurora-sync.md](aurora-sync.md)

> Kilter's catalog (climbs, ratings, walls, users, logs, etc.) is **not** served by classical REST endpoints. It's mirrored from Postgres into the client via [PowerSync](https://www.powersync.com), an open-source bidirectional sync layer. To consume Kilter user data from Boardsesh — the analogue of what `@boardsesh/aurora-sync` does for Tension/Decoy/So-iLL — Boardsesh needs to act as a **PowerSync client** against `sync1.kiltergrips.com`. This document describes Kilter's PowerSync setup and the implementation plan for a Kilter sync runner inside Boardsesh.
>
> Where confidence is lower than HIGH, sections are explicitly marked.

---

## Table of Contents

1. [Background: PowerSync in 90 seconds](#1-background-powersync-in-90-seconds)
2. [Kilter's PowerSync deployment](#2-kilters-powersync-deployment)
3. [Authentication for the sync stream](#3-authentication-for-the-sync-stream)
4. [Wire protocol](#4-wire-protocol)
5. [Synced tables and indexes](#5-synced-tables-and-indexes)
6. [Bucket model (inferred)](#6-bucket-model-inferred)
7. [Client-side writes (CRUD queue)](#7-client-side-writes-crud-queue)
8. [Boardsesh implementation plan](#8-boardsesh-implementation-plan)
9. [Open questions and risks](#9-open-questions-and-risks)

---

## 1. Background: PowerSync in 90 seconds

PowerSync sits between a Postgres database and SQLite clients. The shape:

```
┌──────────────┐    logical replication    ┌────────────────┐
│  Postgres    │ ───────────────────────▶  │  PowerSync     │
│  (server)    │                           │  Service       │
└──────────────┘    upstream CRUD writes   │  (sync1.*)     │
        ▲          ◀────────────────────── │                │
        │                                  └────────┬───────┘
        │                                           │ streaming sync
        │                                           ▼
        │                                  ┌────────────────┐
        └────── REST writes ─────────────  │  Client SDK    │
                  (uploadData hook)        │                │
                                           └────────────────┘
                                                    │
                                                    ▼
                                           local SQLite (mirror)
```

Key concepts:

- **Sync rules** (server-side YAML) declare *buckets*. Each bucket is a parameterised query over Postgres that selects which rows belong in it. Buckets are the unit of sync — a client subscribes to buckets, the server streams oplog rows.
- **Parameters** come from the auth JWT (e.g. `request.user_id()`) or from client-supplied parameters in the connection request. Typical patterns: a `global` bucket of public catalog rows; one `by_user[uid]` bucket per authenticated user; potentially `by_wall[wall_uuid]`, `by_circuit[circuit_uuid]`, etc.
- **Client schema**: clients register a SQLite schema declaring which tables/columns/indexes they want. The PowerSync SQLite extension creates the tables and maintains them as oplog rows arrive.
- **CRUD upstream**: clients enqueue local mutations into a `ps_crud` table. PowerSync's `uploadData` callback hands those rows to app code, which calls the developer's REST API. After the REST call succeeds, the client calls `write-checkpoint2.json` so PowerSync knows the write has been persisted server-side.
- **Transport**: an authenticated long-poll-style streaming HTTP request (BSON-stream or NDJSON), with WebSocket as an alternative on newer protocol versions. Reconnects with a checkpoint cursor.

PowerSync's client and protocol are open-source: see [`powersync-ja/powersync-service`](https://github.com/powersync-ja/powersync-service) and [`powersync-ja/powersync-js`](https://github.com/powersync-ja/powersync-js).

---

## 2. Kilter's PowerSync deployment

| Property | Value |
| --- | --- |
| Service host | `https://sync1.kiltergrips.com` |
| Client SDK | PowerSync Dart SDK; SQLite extension pinned to `>=0.2.0 <1.0.0` |
| Storage | Local SQLite + the PowerSync SQLite extension |
| Backend connector | Custom — Kilter implements their own connector backed by the REST API |
| Auth mode | **Keycloak access token used directly** as PowerSync JWT (see [§3](#3-authentication-for-the-sync-stream)) |
| Streaming endpoint | `POST https://sync1.kiltergrips.com/sync/stream` |
| Write-checkpoint endpoint | `https://sync1.kiltergrips.com/write-checkpoint2.json?client_id=<powersync_client_id>` |
| Content-Type negotiation | `Accept: application/vnd.powersync.bson-stream;q=0.9,application/x-ndjson;q=0.8` |

The client identifies itself with a stable UUID returned by `SELECT powersync_client_id()` — the PowerSync extension generates and persists this per install. It's appended to write-checkpoint calls so the server can correlate uploaded writes with the streaming session.

> Confidence: HIGH for endpoint, content-type, and client_id flow.

---

## 3. Authentication for the sync stream

Kilter does **not** appear to mint a separate PowerSync JWT. Instead, the standard Keycloak `access_token` is passed directly as the bearer token to `sync1.kiltergrips.com`. The PowerSync service is configured to validate JWTs against `https://idp.kiltergrips.com/realms/kilter/protocol/openid-connect/certs` (the Keycloak JWKS endpoint), with `sub` mapped to the user identifier.

Why this is the most likely model:

- No `/auth/token`, `/sync-token`, or `/api/auth` style endpoint surfaces alongside the public Kilter API. The only token endpoint is the standard Keycloak `/protocol/openid-connect/token`.
- PowerSync's `BackendConnector.fetchCredentials()` typically returns `{ endpoint, token, expiresAt, userID }`. With `endpoint` = `https://sync1.kiltergrips.com` and `token` = Keycloak access JWT, this works as long as PowerSync is configured to trust the Keycloak issuer — which it can be via the standard JWKS configuration.

**Implications for Boardsesh**:

- No separate token-exchange endpoint is needed — once Boardsesh has a Keycloak access_token, it can talk to PowerSync directly.
- Token TTL matches Keycloak's `access_token` lifetime (commonly 5–15 minutes). The sync agent must refresh proactively, either via the OIDC refresh_token grant or by re-running ROPC against `/token` if Boardsesh's auth flow uses that.
- Since the same JWT validates both REST API calls (`portal.kiltergrips.com/api/*`) and the sync stream, one credential store covers both planes.

> Confidence: MEDIUM-HIGH. A 30-second traffic capture against one real login would confirm definitively.

---

## 4. Wire protocol

Kilter uses a stock PowerSync client, so the documented PowerSync streaming protocol applies. The high-level shape:

### 4.1 Initial connection

```http
POST /sync/stream HTTP/1.1
Host: sync1.kiltergrips.com
Authorization: Bearer <keycloak_access_token>
Accept: application/vnd.powersync.bson-stream;q=0.9,application/x-ndjson;q=0.8
Content-Type: application/json

{
  "client_id": "<uuid from powersync_client_id()>",
  "buckets": [],                        // empty on first sync; checkpoint resumes on later runs
  "include_checksum": true,
  "raw_data": true                      // request row JSON rather than diffs
}
```

The body shape is fixed by the PowerSync protocol — clients don't choose buckets, the server determines them from sync rules + JWT claims.

### 4.2 Streamed messages

The server responds with `Transfer-Encoding: chunked`, emitting newline-delimited JSON (or length-prefixed BSON if the client negotiated BSON). Message types:

| Message | Purpose |
| --- | --- |
| `StreamingSyncCheckpoint` | Marks a consistent checkpoint that includes a `last_op_id`, list of buckets, and per-bucket checksums |
| `StreamingSyncCheckpointDiff` | Incremental change to the active bucket set |
| `StreamingSyncCheckpointComplete` | Server has finished sending all data up to the checkpoint |
| `StreamingSyncData` | A batch of oplog rows for one bucket (`{ bucket, data: [{ op_id, op, object_type, object_id, checksum, data }] }`) |
| `StreamingSyncKeepalive` | Periodic heartbeat with `token_expires_in` seconds — client should refresh auth before this hits zero |

### 4.3 CRUD upload

Local writes are batched into `ps_crud` and flushed via the connector's `uploadData(database)` callback. The callback:

1. Reads pending entries (`object_type`, `op`, `id`, `data`) from `ps_crud`.
2. Calls Kilter's REST API (`portal.kiltergrips.com/api/...`) to apply the mutation. Most non-trivial writes hit `/api/.../transaction` endpoints which take the equivalent of the local row set in one call.
3. On 2xx, calls `POST https://sync1.kiltergrips.com/write-checkpoint2.json?client_id=<id>` so the sync service can correlate the upload with the next streaming checkpoint.
4. Calls `database.deleteCrudBatch()` to mark it persisted.

This means the streaming endpoint is **read-only from the client's perspective** — every server-side write to Postgres flows through Kilter's REST API, and PowerSync mirrors it back out to all subscribed clients.

> Confidence: HIGH that the protocol matches stock PowerSync (the SDK is unmodified); MEDIUM on the exact JSON keys in the request body — they may differ slightly by SDK version.

---

## 5. Synced tables and indexes

The client schema is registered programmatically using PowerSync's standard `replace_schema` flow. The table/index inventory below is what the client maintains in its local SQLite mirror.

### 5.1 Master inventory

| Table | Indexed columns (and inferred PK) | Notes |
| --- | --- | --- |
| `users` | `user_uuid` (pk), `email` | Public-ish user profiles |
| `user_settings` | `user_uuid` (pk) | Per-user preferences |
| `user_analytics` | `user_uuid` (pk) | Aggregated stats |
| `user_followers` | `user_uuid` | Follower edges (per follower) |
| `user_blocked_climbs` | `user_uuid`, `climb_uuid` | Composite |
| `user_notifications` | `user_uuid`, `receiver_uuid` | Notification feed |
| `gym_followers` | `user_uuid` | Gym follow edges |
| `gym_notifications` | `gym_uuid`, `receiver_uuid` | Notifications scoped to a gym |
| `climbs` | `climb_uuid` (pk), `user_uuid`, `product_name`, `created_at`, `accumulated_hold_set_value` | Schema in [KILTER_HTTP_API_SPEC.md §7](KILTER_HTTP_API_SPEC.md#7-local-sqlite-schema-client-side-mirror) |
| `climb_stats` | `climb_uuid_angle` (composite pk), `climb_uuid`, `angle` | Schema in HTTP spec §7 |
| `climb_ratings` | `climb_rating_uuid` (pk), `user_uuid`, `climb_uuid`, `wall_uuid`, `gym_uuid`, `product_layout_uuid`, `difficulty_grade_id` | Heavily indexed — many query angles |
| `climb_mounting_holes` | `climb_uuid`, `product_layout_uuid`, `mounting_hole_uuid`, `hold_placement_id`, `placement_type`, `default_placement_type`, `hold_id` | Highly denormalized |
| `climb_beta_links` | `climb_uuid`, `angle`, `link` | External beta video/post links |
| `circuits` | (inferred: `circuit_uuid` pk; user filters via `circuit_climbs`) | Curated route lists |
| `circuit_climbs` | `circuit_uuid`, `climb_uuid` | Many-to-many |
| `logs` | `user_uuid`, `climb_uuid`, `product_layout_uuid`, `created_at` | Confirmed ascents |
| `attempts` | `user_uuid`, `product_layout_uuid`, `angle` | **Separate** from `logs` — tracks attempts/bids vs sends |
| `walls` | `wall_uuid` (pk), `product_layout_uuid`, `product_name`, `gym_uuid` | Physical boards |
| `products` | `product_name` (pk) | Board models (Kilter Original / Homewall / Mini / Grasshopper / etc.) |
| `product_layouts` | `product_layout_uuid` (pk), `product_name` | Specific layout variants per product |
| `mounting_holes` | `mounting_hole_uuid` (pk), `product_name` | Hardware catalog — every hole on every board |
| `holds` | `hold_id` (pk) | Hold catalog |
| `hold_sets` | `hold_set_name` (pk) | Hold-set groupings (Kilter HS, KS, etc.) |
| `placement_types` | `placement_type` (pk), `short_ref` | start/hand/foot/finish enum |
| `difficulty_grades` | `difficulty_grade_id` (pk) | Grade catalog (V-scale, font-scale) |

A separate local-only table — `recently_tried_climbs` — is not synced; it's populated by the client and never leaves the device. (See [KILTER_HTTP_API_SPEC.md §7](KILTER_HTTP_API_SPEC.md#7-local-sqlite-schema-client-side-mirror).)

### 5.2 Notes on schema vs. PowerSync semantics

- PowerSync types are coerced to SQLite's three storage classes (`TEXT`, `INTEGER`, `REAL`). Booleans on the wire become `INTEGER 0/1`. Timestamps are `TEXT` ISO-8601.
- Every synced table carries an additional client-side `id TEXT PRIMARY KEY` column injected by PowerSync if the table doesn't declare one explicitly. Kilter's tables all have natural primary keys (`*_uuid` etc.), but PowerSync still adds `id` under the hood — Boardsesh's translator should ignore it.
- The `attempts` vs `logs` split matches Aurora's `bids` vs `ascents` distinction. Boardsesh already dual-writes both into `boardsesh_ticks` ([aurora-sync.md](aurora-sync.md)); the Kilter equivalent should follow the same pattern.

> Confidence: HIGH that the listed tables sync. MEDIUM-HIGH on PK / index column choices. The `attempts` table is worth explicit confirmation when wiring up the dual-write rule.

---

## 6. Bucket model (inferred)

PowerSync sync rules are server-side YAML; we don't have them. The likely bucket structure based on the table/index inventory and PowerSync conventions:

| Bucket name (likely) | Parameters | Tables | Notes |
| --- | --- | --- | --- |
| `global_catalog` | — | `products`, `product_layouts`, `mounting_holes`, `holds`, `hold_sets`, `placement_types`, `difficulty_grades` | Public, identical for every user |
| `public_climbs` | — | `climbs` (where `is_listed = true AND is_draft = false`), `climb_stats`, `climb_mounting_holes` for listed climbs, `climb_beta_links` | World-readable route catalog |
| `walls_public` | — | `walls` (where `is_listed = true`), possibly all gym-affiliated walls | Gym wall catalog |
| `user_owned[uid]` | `uid = request.user_id()` | `users` row for self; `climbs` / `walls` where `user_uuid = uid`; `climb_mounting_holes` for those climbs; `user_settings`; `user_analytics`; `user_blocked_climbs`; `circuits` (own) | The user's own writeable content |
| `user_activity[uid]` | `uid = request.user_id()` | `logs`, `attempts`, `climb_ratings` where `user_uuid = uid` | Activity log |
| `user_social[uid]` | `uid = request.user_id()` | `user_followers` where source or target = `uid`; `user_notifications` where `receiver_uuid = uid`; `gym_followers` where `user_uuid = uid`; `gym_notifications` where `receiver_uuid = uid` | Social graph + inbox |

If Kilter has chosen finer-grained buckets (e.g. one bucket per circuit, one per gym), the index pattern doesn't directly reveal it. The above is the simplest model that matches the observed indexing.

> Confidence: MEDIUM. Bucket names and exact membership are unverifiable from the client side alone. The *categories* (global catalog vs per-user) are HIGH confidence because the auth model leaves no other way to partition.

---

## 7. Client-side writes (CRUD queue)

The client issues writes through the standard PowerSync `ps_crud` queue, which uploads via the REST endpoints documented in [`KILTER_HTTP_API_SPEC.md`](KILTER_HTTP_API_SPEC.md):

- `climbs` + `climb_mounting_holes` writes → `/api/climbs/create-climb/transaction`, `/api/climbs/update-climb/transaction`.
- `circuits` + `circuit_climbs` writes → `/api/circuits` and `/api/circuit-climbs`.
- `user_settings`, `user_blocked_climbs` writes → `/api/users/user-settings`, `/api/users/block-climb`, `/api/users/unblock-climb/...`.
- `logs` and `climb_ratings` writes → `/api/logs/`, `/api/logs/bulk`, `/api/climb-rating/`.

The "transaction" REST endpoints exist because PowerSync's upload callback delivers `ps_crud` entries in committed order but applies them one row at a time — the server-side `*-transaction` endpoint accepts the whole row set (parent + children) at once to avoid partial commits.

> Confidence: HIGH that the upload flow goes through PowerSync's CRUD queue (it's a default behavior of the SDK).

---

## 8. Boardsesh implementation plan

See [`kilter-sync.md`](kilter-sync.md) for the integration design — schema migrations, the climb-dedup mechanism, per-user bidirectional sync, the three-writer extension to `board_climb_stats`, daemon shape, and phased rollout. That doc supersedes this section.

---

## 9. Open questions and risks

1. **Token-exchange endpoint?** We're assuming the Keycloak access_token is the PowerSync JWT. If Kilter adds a middleman (e.g. minted by an `/api/auth/sync-token` endpoint), the auth flow flips and we need to discover that endpoint first. **Validation cost**: one traffic capture.
2. **Ratelimits or anti-scraping**: Kilter may enforce a per-user concurrency cap (one active PowerSync stream per `sub`). If we open a sync stream while the user has the app open, one of us may get disconnected. The daemon should serialize per-user.
3. **Schema drift**: Kilter ships new client releases. The synced tables and their indexes can grow. We need a smoke-test that fails loudly on schema mismatches rather than silently dropping rows.
4. **ToS / abuse considerations**: this is doing what their app does, on behalf of users who explicitly opt in by handing over Keycloak credentials. Same shape as `aurora-sync`. Worth a parallel section in CLAUDE.md / LEGAL.md once we move from POC to production.
5. **`attempts` table semantics**: confirm whether Kilter's `attempts` is "all attempts including sends" or "non-sends only" — this affects the `boardsesh_ticks` dual-write rule.
6. **Bucket model**: section [§6](#6-bucket-model-inferred) is inferred. Catalog rows we expect to be in `global_catalog` might actually only stream to authenticated users — if so, "open a stream as one user, capture catalog for all" works regardless, but understanding the rules helps reason about access control.
7. **Sync rules format**: PowerSync has had two sync-rule formats over its history; the choice affects which client SDK protocol version Kilter speaks. Our connection request must match.
8. **Refresh token lifetime**: Keycloak refresh_tokens often expire (default 30 days or "session idle"). The daemon needs to detect expired refresh and surface a re-auth prompt to the user rather than silently failing.
