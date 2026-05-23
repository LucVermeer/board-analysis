# Boardsesh Mobile App Plan — v10.0

## What this document is

A working plan for the native mobile app. v10.0 is a direction change from v9.x:

1. **Build a React Native (Expo) app for mobile.** The Capacitor WebView approach from v9.x had two structural problems: WebView scroll/animation performance can't match native, and every new iOS/Android capability requires a Capacitor plugin that may not exist. With mobile becoming the primary surface, the app needs to be genuinely native.
2. **Keep Next.js for web.** The 14-week Vite + TanStack Start migration from v9.x was motivated by enabling the Capacitor bundle switch. Without Capacitor, that motivation disappears. Next.js stays deployed on Vercel. No framework migration, no hosting migration, no auth migration on the web side.
3. **Share business logic, not UI.** BLE protocol encoding, queue state machine, GraphQL schema, board configuration, and type definitions live in shared packages. Web and mobile each get the UI layer that's best for their platform.

Everything from v9.x's offline-first design — the query router shape, mutation queue with idempotency keys, refdata SQLite, App Store Plan B — carries forward, implemented natively in React Native instead of through a WebView.

## Non-negotiable: web and Capacitor apps must keep working

The React Native app is additive. The existing web app (Next.js on Vercel) and the existing Capacitor app (`mobile/`) must continue working throughout RN development and after launch. Concrete rules:

1. **No breaking changes to `packages/web/`.** Every PR that touches shared packages or backend must pass the existing web test suite and `vp check`. The web app is the primary product until the RN app reaches feature parity — regressions are not acceptable.
2. **No breaking changes to `packages/backend/`.** The backend serves both web and (eventually) RN clients. New endpoints or schema changes for RN must be additive. Existing GraphQL queries, mutations, and subscriptions must remain unchanged.
3. **No breaking changes to `mobile/` (Capacitor).** The Capacitor app is live in the App Store. It loads `https://www.boardsesh.com` in hosted mode and uses BLE, Live Activity, and deep linking. It must keep working on every deploy. The Capacitor directory is not deleted until the RN app is live in the App Store and users have migrated.
4. **Shared package extraction is additive.** When moving logic from `packages/web/` to `packages/shared/`, the web files must re-export everything from the shared package so downstream imports are unchanged. No import path changes for existing web code.
5. **Backend bearer token auth stays backward-compatible.** The existing Capacitor native OAuth flow (`/auth/native-start`, `/auth/native/exchange`) must keep working. RN reuses the same endpoints — no separate auth path that could break the existing one.
6. **Database schema changes are migration-safe.** Any new tables or columns for RN features use standard additive migrations via `bunx drizzle-kit generate`. No destructive schema changes that would break the web or Capacitor apps.

The Capacitor app (`mobile/`) will be retired only after: (a) the RN app is accepted in both App Store and Play Store, (b) existing Capacitor users have had at least 30 days to update, and (c) analytics confirm <5% of sessions come from the old Capacitor build.

## Pinned user story

A user opens Boardsesh in airplane mode at the gym. They launch the app, browse and search climbs for their board, build a queue, connect via BLE, send climbs to the board (LEDs light up), and tick the ones they sent. Real-time-only features (party mode, comments, others' profiles) show a "needs network" state. When the user reconnects, queued ticks and edits sync to the server. This end-to-end story is the terminal milestone.

## Why React Native (not Capacitor, not Flutter)

### vs Capacitor (v9.x approach)

- **Native UI components** instead of WebView rendering. No scroll jank, no animation limits, no "almost native" feel.
- **Direct platform access.** New iOS/Android features (interactive widgets, app intents, SharePlay, background processing) are available immediately through native modules, not gated on plugin availability.
- **App Store guideline 4.2 risk largely disappears.** A React Native app is genuinely native — there's no WebView wrapper to trigger review flags.
- **Faster path to App Store.** The v9.x plan required completing a 14-week framework migration before the Capacitor bundle switch even started. React Native ships independently of the web.

### vs Flutter

- **Same language and ecosystem.** The team already knows React and TypeScript. No Dart learning curve.
- **Shared business logic.** BLE protocol encoding, queue state machine, GraphQL schema — all existing TypeScript that transfers directly to shared packages. Flutter would require rewriting everything in Dart.
- **Flutter web is not viable** for SEO-heavy pages. We'd still maintain Next.js separately with zero shared code. React Native shares types, logic, and API definitions.

### What we lose

- **Two UI codebases.** Web uses MUI + React DOM; mobile uses React Native Paper/Tamagui + React Native. No component sharing between them.
- **Existing Capacitor work is abandoned.** BLE adapters (~200 lines), Live Activity widget (~500 lines Swift), HealthKit bridge (~100 lines) need reimplementation. This is accepted — the code is small relative to the full app.

## Current state (verified against `main`)

| Area                | Status                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Web app             | Next.js 16.1.6 on Vercel. 47 routes, 68 dynamic route files. Stays as-is.                                                              |
| Backend             | GraphQL-WS + Hono on Railway. 14 resolver domains. Stays as-is.                                                                        |
| Database            | Postgres + PostGIS on Railway. Drizzle ORM. Stays as-is.                                                                               |
| Shared schema       | `packages/shared-schema/` with GraphQL types. Already extracted.                                                                       |
| Board constants     | `packages/board-constants/` with product metadata, LED placements, hold states, grade colors. Already extracted.                       |
| BLE protocol (web)  | Aurora v2/v3 encoding, MoonBoard UART framing in `packages/web/app/components/board-bluetooth-control/`. Pure TypeScript, extractable. |
| Queue reducer (web) | 30+ action handlers, delta-based updates in `packages/web/app/components/queue-control/reducer.ts`. Pure TypeScript, extractable.      |
| Board data (web)    | Board metadata, compatibility checks in `packages/web/app/lib/board-data.ts`, `board-compatibility.ts`. Pure TypeScript, extractable.  |
| Capacitor shell     | `mobile/` directory with iOS + Android projects, BLE adapter, Live Activity widget. Will be replaced.                                  |
| App store metadata  | Full iOS + Android listing text in `mobile/metadata/`. Reusable.                                                                       |
| APNs backend        | Token-based push infrastructure in `packages/backend/src/services/apns/`. Reusable by RN.                                              |

## Architecture

```
packages/
  web/              # Next.js (stays as-is — web, SEO, desktop)
  mobile/           # React Native (Expo) — NEW, replaces Capacitor
  backend/          # GraphQL-WS + Hono backend (unchanged)
  db/               # Drizzle schema + migrations (unchanged)
  shared-schema/    # GraphQL types (unchanged, enhanced)
  board-constants/  # Board metadata, LED placements (unchanged)
  shared/           # NEW: extracted business logic
    ble-protocol/   #   Aurora/MoonBoard encoding, chunking, checksums
    queue/          #   Queue reducer, playlist suggestions
    board-config/   #   Board metadata, compatibility, hold layouts
```

### Data flow

```
┌────────────────── boardsesh.com (Vercel) ──────────────────┐
│  packages/web (Next.js, unchanged)                         │
│   • SSR for SEO surfaces, client components for in-app     │
│   • Imports from packages/shared/ for business logic       │
└────────────────────────────────────────────────────────────┘
         │                                    │
         │ HTTPS GraphQL                      │ WebSocket
         │                                    │
┌────────┴────────── Railway ────────────────┴──────────────┐
│  packages/backend (Hono + graphql-ws, unchanged)          │
│   • GraphQL queries, mutations, subscriptions             │
│   • APNs push (reused by RN via device token registration)│
│   • Auth: NextAuth for web cookies, bearer tokens for RN  │
│                                                            │
│  Postgres + PostGIS + Redis                                │
└───────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │ HTTPS GraphQL                      │ WebSocket
         │                                    │
┌────────┴────────── Mobile ────────────────┴──────────────┐
│  packages/mobile (React Native / Expo)                    │
│   • Native UI (React Native Paper or Tamagui)             │
│   • BLE via react-native-ble-plx + shared protocol logic  │
│   • Board rendering via @shopify/react-native-skia        │
│   • Offline: expo-sqlite for climb data, MMKV for prefs   │
│   • Auth: bearer tokens via expo-auth-session             │
│   • Live Activity via react-native-live-activity           │
│                                                            │
│  Local data:                                               │
│   • Refdata SQLite per board                               │
│   • Cached ticks, playlists, profile                       │
│   • Pending mutations (write queue)                        │
└───────────────────────────────────────────────────────────┘
```

## Shared business logic — what transfers

These are pure TypeScript modules with no DOM, React DOM, or platform-specific dependencies. They move to `packages/shared/` and are imported by both web and mobile.

### BLE protocol encoding (100% shareable)

**Source files:** `packages/web/app/components/board-bluetooth-control/bluetooth-aurora.ts`, `bluetooth-moonboard.ts`, `bluetooth-shared.ts` (constants + `splitMessages` only)

- Aurora v2/v3 LED position encoding, color quantization, power budget scaling
- MoonBoard hold-to-serial-position mapping, UART frame construction
- Packet wrapping with checksums, message chunking
- Device name parsing (API level, serial number, board type detection)

The `BluetoothAdapter` interface (connect, disconnect, write) stays platform-specific. Web implements it with Web Bluetooth; React Native implements it with `react-native-ble-plx`.

### Queue state machine (100% shareable)

**Source files:** `packages/web/app/components/queue-control/reducer.ts`, `types.ts`, `playlist-suggestions.ts`

- `queueReducer` function — 30+ action handlers, pure reducer
- Delta-based queue updates with idempotent insertion
- Optimistic update tracking via correlation IDs
- Playlist suggestion source management, suggestion pruning

The `useQueueReducer` React hook wrapper stays in each platform's code. The reducer function itself is framework-agnostic.

### Board configuration (100% shareable)

**Source files:** `packages/web/app/lib/board-data.ts`, `board-compatibility.ts`, `moonboard-config.ts`

- Board metadata (names, layout IDs, size IDs, image dimensions)
- Climb-to-board compatibility checks
- MoonBoard grid configuration (11 columns x 18 rows)

### Already extracted

- `packages/shared-schema/` — GraphQL schema, TypeScript types (Climb, ClimbQueueItem, SessionUser, etc.)
- `packages/board-constants/` — Product sizes, LED placements, hold state maps, grade colors

## iOS-first with SwiftUI native modules

75% of Boardsesh users are on iOS. The app uses Expo's native modules API to write performance-critical iOS views in SwiftUI, with Kotlin/Jetpack Compose equivalents for Android. Most screens (climb lists, queue, search, settings, profiles) are standard React Native — shared across both platforms.

### When to use SwiftUI vs React Native

| Use SwiftUI (iOS) / Compose (Android)                              | Use React Native (shared)         |
| ------------------------------------------------------------------ | --------------------------------- |
| Board renderer — GPU-accelerated hold circles via SwiftUI `Canvas` | Climb browsing, search, filtering |
| Live Activity widget — ActivityKit requires SwiftUI                | Queue management                  |
| BLE device picker — platform-native list with RSSI                 | Navigation, settings, profiles    |
| HealthKit workout logging                                          | Party mode, social features       |

The Expo Modules API bridges SwiftUI views into React Native. The same `<BoardRenderer holds={holds} />` JSX component renders a SwiftUI `Canvas` on iOS and a Compose `Canvas` on Android. All platform-specific code lives in the module's `ios/` and `android/` directories — the React Native layer is unaware of which platform is rendering.

This gives iOS users the best possible performance on the most critical view (the board renderer) while Android still gets a native equivalent without maintaining a separate app.

## What gets rebuilt for React Native

### Board renderer

**Current (web):** SVG + Canvas/WASM with Web Worker pool (2-5 workers), LRU bitmap cache (150 items), lazy loading. Files: `board-renderer.tsx`, `board-canvas-renderer.tsx`, `board-image-layers.tsx`, `worker-manager.ts`, `board-render.worker.ts`.

**React Native:** Expo native module with SwiftUI `Canvas` on iOS and Jetpack Compose `Canvas` on Android. The rendering math (hold position coordinates, color mapping via `HOLD_STATE_MAP`, mirroring transforms) is shareable from `packages/board-constants/` and `packages/shared/`. The rendering engine is platform-native. Fallback: `@shopify/react-native-skia` if the native module approach proves too complex.

**Risk:** This is the highest-complexity rebuild (~40% of total UI effort). Start in Phase 2 and validate early.

### BLE transport adapter

**Current (web):** `capacitor-adapter.ts` (~200 lines), `native-ios-adapter.ts` (~300 lines), `web-adapter.ts` (~150 lines).

**React Native:** New `BluetoothAdapter` implementation using `react-native-ble-plx`. The adapter is thin — it implements the `requestAndConnect`, `disconnect`, `write` interface. All protocol logic (packet construction, chunking, checksums) comes from `packages/shared/ble-protocol/`.

### Navigation

**Current (web):** Next.js App Router with deeply nested dynamic routes (`/[board_name]/[layout_id]/[size_id]/[set_ids]/[angle]/...`).

**React Native:** Expo Router (file-based routing, similar mental model). The route structure will be flatter — native apps don't expose URL-style deep nesting to users. Deep links (`boardsesh://climb/<uuid>`, `boardsesh://party/join/<id>`) map to specific screens.

### Auth

**Current (web):** NextAuth with cookie sessions.

**React Native:** `expo-auth-session` for OAuth flows. Bearer token exchange via a new backend endpoint. Tokens stored in `expo-secure-store` (iOS Keychain, Android Keystore). Fetch interceptor attaches `Authorization: Bearer <jwt>`.

The backend already supports bearer token auth for the existing Capacitor native OAuth flow (`/auth/native-start`, `/auth/native/callback`). This infrastructure is reusable.

### Offline storage

**Current (web):** IndexedDB via `idb` package for preferences, drafts, session history, etc.

**React Native:**

- `react-native-mmkv` for key-value preferences (fastest KV store on mobile)
- `expo-sqlite` for offline climb database (replaces the planned `@capacitor-community/sqlite`)
- Same data schema, different storage engine

### Platform features

| Feature            | Current (Capacitor)                  | React Native (Expo)                                                       |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------- |
| Board renderer     | Canvas/WASM + SVG                    | Expo native module: SwiftUI `Canvas` (iOS) / Compose `Canvas` (Android)   |
| Live Activity      | Custom Swift widget (~500 lines)     | Expo native module: SwiftUI ActivityKit (iOS only, no Android equivalent) |
| HealthKit          | Custom bridge (~100 lines)           | Expo native module: SwiftUI HealthKit (iOS) / Health Connect (Android)    |
| BLE device picker  | Capacitor BLE plugin                 | Expo native module: SwiftUI list (iOS) / Compose list (Android)           |
| Push notifications | APNs backend (reused)                | `expo-notifications` + existing APNs backend                              |
| In-app review      | `@capacitor-community/in-app-review` | `expo-store-review`                                                       |
| Wake lock          | `@capacitor-community/keep-awake`    | `expo-keep-awake`                                                         |
| Geolocation        | `@capacitor/geolocation`             | `expo-location`                                                           |
| Shake detection    | `@capacitor/motion`                  | `expo-sensors`                                                            |

## What gets deleted

- `mobile/` — Entire Capacitor directory (iOS/Android projects, config, Swift widgets)
- `packages/web/app/lib/ble/capacitor-adapter.ts` — Capacitor BLE adapter
- `packages/web/app/lib/ble/native-ios-adapter.ts` — Native iOS BLE adapter
- `packages/web/app/lib/ble/capacitor-browser.ts` — Platform detection for Capacitor
- `packages/web/app/lib/capacitor.ts` — `isCapacitor()`, `isNativeApp()` detection
- All Capacitor-specific code paths gated on `isNativeApp()`

The web app's `web-adapter.ts` (Web Bluetooth) stays for browser-based BLE on Chrome desktop.

## What stays unchanged

- `packages/web/` — Next.js on Vercel, all routes, all features. No migration.
- `packages/backend/` — GraphQL-WS backend on Railway. No changes except adding RN-specific auth endpoints if needed.
- `packages/db/` — Drizzle schema + migrations. No changes.
- `packages/shared-schema/` — Types. Enhanced with any new types RN needs.
- `packages/board-constants/` — Board metadata. No changes.

## Phase plan

```
0 Shared extraction ──→ 1 Foundation ──→ 2 Core experience ──→ 3 BLE ──→ 4 Social ──→ 5 Platform ──→ 6 Polish
```

### Phase 0: Shared package extraction (2 weeks)

Extract pure business logic from `packages/web/` to `packages/shared/`:

- `packages/shared/ble-protocol/` — Aurora v2/v3 + MoonBoard protocol encoding, message chunking, device name parsing
- `packages/shared/queue/` — Queue reducer, playlist suggestions, queue types
- `packages/shared/board-config/` — Board data, compatibility checks, MoonBoard config

Update `packages/web/` imports to reference the shared packages. Run `vp check` and `vp run typecheck` to verify nothing breaks. Web app behavior is unchanged.

### Phase 1: Foundation (3 weeks)

- Expo project setup in `packages/mobile/` with Expo Router
- Auth flow: `expo-auth-session` + backend bearer token endpoint (reuse existing `/auth/native-start` flow)
- GraphQL client: TanStack Query + `graphql-request` (same pattern as web)
- Navigation skeleton: board selection, climb list, climb detail, queue, settings, profile
- Basic design system: React Native Paper with theme tokens matching web

### Phase 2: Core climb experience (4-5 weeks)

- Climb browsing, search, filtering with `@shopify/flash-list`
- Board renderer with `@shopify/react-native-skia` — hold circles, colors, mirroring, image backgrounds
- Climb detail view with board visualization
- Queue management using shared reducer from `packages/shared/queue/`
- Climb create form

### Phase 3: BLE + board control (3 weeks)

- `react-native-ble-plx` integration
- `BluetoothAdapter` implementation using shared protocol from `packages/shared/ble-protocol/`
- Device scanning UI, connection management, LED control
- Test against physical Kilter, Tension, and MoonBoard hardware
- Background BLE persistence (iOS `CBCentralManager` restoration, Android foreground service)

### Phase 4: Real-time + social (3 weeks)

- WebSocket GraphQL subscriptions (party mode, queue sync)
- Notifications via `expo-notifications` + existing APNs backend
- Feed, profiles, comments
- Party session join/create flow

### Phase 5: Platform features (3 weeks)

- Live Activity widget (iOS lock screen queue navigation)
- HealthKit integration (`react-native-health`)
- Offline climb database via `expo-sqlite`
- Push notification token management (reuse existing backend schema)
- Offline mutation queue

### Phase 6: Polish + App Store (2 weeks)

- Performance optimization (startup time, list scrolling, board rendering)
- App store submission (metadata already exists in `mobile/metadata/`)
- TestFlight / Play Store beta testing
- Error tracking with Sentry (React Native SDK)

### Timeline

| Phase               | Duration  | Cumulative  |
| ------------------- | --------- | ----------- |
| 0 Shared extraction | 2 weeks   | 2 weeks     |
| 1 Foundation        | 3 weeks   | 5 weeks     |
| 2 Core experience   | 4-5 weeks | 9-10 weeks  |
| 3 BLE               | 3 weeks   | 12-13 weeks |
| 4 Social            | 3 weeks   | 15-16 weeks |
| 5 Platform features | 3 weeks   | 18-19 weeks |
| 6 Polish            | 2 weeks   | 20-21 weeks |

**Total: ~20 weeks (~5 months) to App Store submission.**

Compare with v9.x: ~37 weeks (~9 months) before the Capacitor bundle switch even happened.

## Key libraries

| Capability      | Library / Approach                          | Notes                                                                |
| --------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| Navigation      | `expo-router`                               | File-based, similar to Next.js App Router                            |
| BLE             | `react-native-ble-plx`                      | Mature, 5k+ GitHub stars, direct CoreBluetooth/Android BLE           |
| Board rendering | Expo native module (SwiftUI / Compose)      | SwiftUI `Canvas` on iOS, Compose `Canvas` on Android. Fallback: Skia |
| Lists           | `@shopify/flash-list`                       | Drop-in FlatList replacement, 60fps scrolling                        |
| Storage (KV)    | `react-native-mmkv`                         | Fastest KV store on mobile, JSI-based                                |
| Storage (SQL)   | `expo-sqlite`                               | For offline climb database                                           |
| Auth            | `expo-auth-session`                         | Standard OAuth flows                                                 |
| Secure storage  | `expo-secure-store`                         | iOS Keychain, Android Keystore                                       |
| Live Activity   | Expo native module (SwiftUI ActivityKit)    | iOS lock screen widgets, no Android equivalent                       |
| HealthKit       | Expo native module (SwiftUI HealthKit)      | iOS; Android uses Health Connect via same module                     |
| Push            | `expo-notifications`                        | APNs + FCM                                                           |
| UI components   | `react-native-paper`                        | Material Design, stable, well-maintained                             |
| GraphQL         | `@tanstack/react-query` + `graphql-request` | Same pattern as web                                                  |
| Error tracking  | `@sentry/react-native`                      | Crash reporting + performance                                        |
| Native modules  | `expo-modules-core`                         | SwiftUI (iOS) + Kotlin/Compose (Android) bridge                      |

## Auth design

### Mobile (React Native)

1. User taps "Sign in" → `expo-auth-session` opens system browser for OAuth
2. OAuth provider redirects to `boardsesh.com/auth/callback` (in system browser)
3. Backend issues a short-lived HMAC transfer token, redirects to `boardsesh://auth/callback?token=...`
4. Expo app intercepts the deep link, POSTs the transfer token to `/auth/native/exchange`
5. Backend validates, issues JWT (30d) + refresh token
6. Tokens stored in `expo-secure-store` (Keychain/Keystore)
7. Fetch interceptor attaches `Authorization: Bearer <jwt>` to every request
8. WebSocket `connectionParams` includes the token

**Refresh:** When JWT is within 24h of expiry, the interceptor uses the refresh token to mint a new pair. Failed refresh triggers re-auth.

### Web (unchanged)

NextAuth cookie sessions. No changes to the web auth flow.

### Backend

The existing bearer token infrastructure (used by the current Capacitor native OAuth flow) is reused. The backend already handles:

- Transfer token generation at `/auth/native-start`
- Token exchange at `/auth/native/exchange`
- Bearer token validation in GraphQL resolvers
- WebSocket auth via connection params

New work: ensure the token exchange endpoint returns a proper JWT + refresh token pair (may already be implemented; verify).

## Offline design

### Refdata SQLite (Phase 5)

Same design as v9.x, implemented natively:

- `expo-sqlite` stores climb data per board
- Tables: `board_climbs`, `board_climb_stats`, `board_difficulty_grades`, `board_holes`, `board_layouts`, `board_product_sizes`, `board_products`, `board_sets`, `board_product_sizes_layouts_sets`
- Sync: new climbs on 24h cadence, stats refresh weekly
- Build pipeline: GitHub Action exports SQLite snapshots to Cloudflare R2
- Download on first board selection; "Syncing climbs" progress indicator

**Measurement spike (start of Phase 5):** Run the export script against the dev DB. If compressed Kilter data exceeds 200 MB, fall back to per-layout split or lazy-fetch frames on first view.

### Mutation queue (Phase 5)

Same design as v9.x:

- Client-generated UUID v7 idempotency keys
- Server-side `mutation_dedup` table (30-day expiry)
- Single-concurrency drainer in `createdAt` order
- Per-mutation conflict resolution (tick.create: idempotent, playlist ops: set ops, playlist.rename: last-write-wins)

### User data cache (Phase 5)

- Profile, ticks, playlists cached in MMKV after first online load
- SWR refresh on next online launch
- "Needs network" state for real-time features (party, comments, feed)

## App Store distribution

### Review notes

> Boardsesh controls climbing-board hardware via Bluetooth Low Energy. The app is built with React Native and provides native performance for climb browsing, board visualization, and hardware control. Key native features:
>
> 1. CoreBluetooth integration for BLE board control (Kilter, Tension, MoonBoard)
> 2. Offline climb database (~150 MB per board, stored in SQLite)
> 3. Live Activity widget showing current climb on the lock screen
> 4. HealthKit workout logging for climbing sessions
>
> Demo flow (no physical board needed):
>
> 1. Open the app, select "Kilter"
> 2. Browse and search climbs — results render from the local database
> 3. Tap any climb — detail page shows hold positions and grade
> 4. Tap the BLE icon — device picker appears (won't find a board in test environment)

### Plan B if iOS rejected on guideline 4.2

This is much less likely with a genuinely native app (no WebView wrapper), but if it happens:

1. Ship Android first via Play Store
2. Add native onboarding screens highlighting BLE + offline + Live Activity
3. Resubmit with explicit per-feature citations

## Risks

| Risk                                                       | Likelihood | Impact | Mitigation                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board renderer complexity (Canvas/WASM to SwiftUI/Compose) | Medium     | High   | Start early in Phase 2. Fallback: `@shopify/react-native-skia`, then `react-native-svg`.                                                                                                                       |
| Two UI codebases to maintain                               | Certain    | Medium | Share everything below UI. Intentional divergence — each platform gets its best experience.                                                                                                                    |
| react-native-ble-plx maintenance slowdown                  | Medium     | High   | No major release since 2023. Protocol logic is shared; only the transport adapter differs. Backup: `react-native-ble-manager`. Last resort: custom Expo native module with CoreBluetooth/Android BLE directly. |
| Metro bundler + monorepo friction                          | Medium     | Medium | Shared packages use raw TypeScript (`"main": "src/index.ts"`). Metro needs `watchFolders` + `nodeModulesPaths` config. Set up and verify in Phase 1 week 1.                                                    |
| No CI/CD for native builds                                 | Certain    | Medium | EAS Build setup, TestFlight distribution, GitHub Actions integration. Budget 1 week in Phase 1.                                                                                                                |
| Expo ecosystem churn                                       | Low        | Medium | Pin SDK versions. Expo's continuous native generation (CNG) handles native project updates.                                                                                                                    |
| Refdata SQLite > 200 MB                                    | Medium     | Medium | Phase 5 measurement spike. Fallback: per-layout split or frames lazy-fetch.                                                                                                                                    |
| Bearer token refresh edge cases                            | Medium     | High   | Dedicated test suite. Failed refresh triggers re-auth, not silent failure.                                                                                                                                     |
| Live Activity reimplementation complexity                  | Medium     | Medium | Defer to Phase 5. Existing Swift widget logic serves as reference. SwiftUI Expo module.                                                                                                                        |
| Phase 5 scope overload                                     | High       | Medium | Phase 5 packs SQLite + mutation queue + Live Activity + HealthKit into 3 weeks. Ship v1 without Live Activity and HealthKit to de-risk. Add them in a fast-follow.                                             |
| Apple 4.2 rejection                                        | Low        | High   | Native RN app has minimal risk. Plan B above if needed.                                                                                                                                                        |

## Performance targets

| Metric                      | Target                             |
| --------------------------- | ---------------------------------- |
| Cold start to interactive   | < 1.5s on a 2022 mid-tier Android  |
| Climb search (local SQLite) | < 100ms p95                        |
| Board renderer FPS          | 60fps during interaction           |
| BLE connection              | < 5s                               |
| BLE LED send                | < 1s after connect                 |
| App binary size             | < 30 MB without refdata            |
| List scrolling              | 60fps with 1000+ items (FlashList) |

## Platform requirements

|         | Minimum                                    |
| ------- | ------------------------------------------ |
| iOS     | 15.0 (Expo SDK 53 minimum)                 |
| Android | API 24 / Android 7.0 (Expo SDK 53 minimum) |

## Success criteria

| Layer             | Done when                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Shared extraction | BLE protocol, queue reducer, board config in `packages/shared/`. Web imports updated. `vp check` passes. |
| Foundation        | Expo project builds, auth works, navigation skeleton complete, GraphQL queries return data.              |
| Core experience   | Climb browsing, search, board visualization, queue management work end-to-end on iOS + Android.          |
| BLE               | Connect to physical Kilter/Tension/MoonBoard, send climbs, LEDs light up correctly.                      |
| Social            | Party mode, notifications, feed work via WebSocket subscriptions.                                        |
| Platform          | Live Activity, HealthKit, offline SQLite, push notifications, mutation queue all functional.             |
| App Store         | Accepted on iOS App Store and Google Play Store. TestFlight beta with 10+ testers.                       |

## Considered alternatives

**Stay on Capacitor (v9.x).** Avoids the React Native learning curve and reuses existing native code. Rejected because WebView performance and native feature access are structural limitations. The 14-week Vite migration was primarily motivated by enabling the Capacitor bundle switch — removing that motivation removes the justification for the migration.

**Flutter.** Best raw performance and excellent BLE support. Rejected because Dart is a completely different language with zero code sharing from the existing TypeScript codebase. Team would need to learn new ecosystem, state management, and testing tools.

**Keep Capacitor, skip Vite migration.** Ship the existing hosted WebView to the App Store. Rejected because hosted mode has the worst App Store rejection risk (guideline 4.2) and the worst offline story.

**React Native + migrate web to Vite anyway.** The Vite migration has independent value (dev speed, no Vercel lock-in). Deferred — the web works fine on Next.js/Vercel today, and the mobile app is higher priority. Can revisit the web framework later if pain accumulates.

---

## Changelog

**v10.0 — current.** Direction change from Capacitor to React Native (Expo):

- Drop the Vite + TanStack Start migration (Phase 1 from v9.x)
- Drop the Vercel-to-Railway hosting migration for web (Phase 0a from v9.x)
- Drop the NextAuth-to-arctic+lucia auth migration for web (Phase 0c from v9.x)
- Replace `mobile/` Capacitor project with `packages/mobile/` Expo project
- Extract shared business logic to `packages/shared/` (BLE protocol, queue reducer, board config)
- Timeline reduced from ~37 weeks (v9.x) to ~20 weeks
- Keep Next.js on Vercel for web, unchanged

**v9.2.** PostHog migration sub-plan, Vercel platform inventory gaps.

**v9.1.** Beta subdomain migration strategy, hosted-mode Capacitor compatibility.

**v9.0 — superseded by v10.0.** Committed to Vite + TanStack Start, Railway self-hosting, arctic + lucia auth. 14-week framework migration. 37-week critical path.

**v8.0 and earlier — see git history of this file.**
