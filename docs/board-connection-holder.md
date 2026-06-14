# Board connection holder — "who's connected / writing to the wall"

Implementation plan + spec. Self-contained: a fresh session can execute it from this file alone.

**Branch:** `feat/board-connection-holder` (off latest `main`). Backend core already committed (`07148193c`). This **supersedes** PRs #2842/#2843 (the session-scoped wall model) — do not build on those; they were 43 commits behind `main` and only carried the now-abandoned session-wall apparatus.

---

## Why this exists

R1 (#2842/#2843, unmerged) gave the wall a **session-scoped, auto-claimed** BLE-writer slot (`announceWallLink` → Redis `HSETNX` on `session:{id}:wallConnections`, a `deriveIsWallWriter` write-gate). Product feedback reshaped it:

- **No separate claim** — it's implied by a confirmed send. Every wall write already calls a confirm mutation that carries who sent it.
- **No auto-promotion** — when the holder leaves/loses the link, the slot empties and stays empty until someone presses the lightbulb.
- **Board-scoped, universal** — the holder lives on **board presence** (`board_id`), and **everyone emits regardless of session or login** (solo/party, logged-in/anonymous). Board presence becomes **auth-optional** so anonymous web users are first-class; anonymous holders display as a **"?"**.

## The model

A board's current holder = the **emitter** (`userId` if logged-in, else `conn:{connectionId}`) of the most recent `reportBoardClimb`, cleared when that connection drops. Everyone watching the board sees it; the displayed climb propagates via `CurrentClimbChanged`; the holder's phone writes the frames and each confirm re-affirms them. **No write-gate** — Aurora controllers are last-connection-wins, so one phone is physically connected at a time; `BluetoothAutoSender` mounts on `isConnected` alone. The holder is a **display + take** concept.

Display states (client): **active** (connected, recent send → lit, avatar or "?"), **idle/unknown** (connected, no send in >15 min → avatar + "?" badge), **free** (disconnected → "tap to take").

## Decisions locked (product owner)

1. Board-scoped holder = identity of the last confirmed send; cleared on that connection's drop.
2. Everyone emits to board presence regardless of session/login. `reportBoardClimb` is auth-optional; anon keyed by `conn:{connectionId}`.
3. No separate claim — implied by the send (the lightbulb press connects + pushes the climb).
4. No auto-promotion; always-take (latest send wins; last-connection-wins boots the previous BLE).
5. Anonymous holders shown as "?" (logged-in → real avatar + name).
6. Idle "?" once the holder hasn't changed the board in 15 min. No ticking minutes.
7. Explicit disconnect: the lightbulb is a toggle — press to connect/take, press again to disconnect → immediately clears the holder (wall free).

---

## Already done (committed `07148193c`, typecheck + lint clean, codegen regenerated)

- **`packages/backend/src/pubsub/index.ts`** — `board:{boardId}:writer` Redis key (TTL = `BOARD_MEMBERSHIP_TTL`) + `setBoardWriter` (returns previous holder), `clearBoardWriterIf` (atomic Lua compare-and-delete), `getBoardWriter`. Redis-only (degrades to "no holder" without Redis).
- **`packages/backend/src/graphql/resolvers/board-presence/mutations.ts`**
  - `reportBoardClimb` is **auth-optional**: `requireAuthenticated` dropped; `const emitterId = ctx.userId ?? \`conn:${ctx.connectionId}\``; membership check + dwell gate keyed by `emitterId`; sender-profile query only when `ctx.userId` (anon → null name/avatar); `board_climb_events.userId = ctx.userId ?? null`. After the `BoardClimbSet` publish it calls `setBoardWriter` and publishes `BoardConnectionChanged` **only on a hand-off** (holder changed).
  - New `reportBoardDisconnect(boardId)`: `clearBoardWriterIf(emitterId)`; on success publishes `BoardConnectionChanged { holder: null }`. Auth-optional.
- **`packages/backend/src/graphql/resolvers/board-presence/queries.ts`** — new `boardConnection(boardId): BoardConnectionHolder` (auth-optional): `getBoardWriter` + the newest live climb for identity/`lastSentAt` (the holder IS the last sender; `conn:` emitter → null userId).
- **SDL** `packages/shared-schema/src/schema/{board-presence,queries,mutations}.ts` — `BoardConnectionHolder` + `BoardConnectionChanged` (added to the `BoardPresenceEvent` union streamed by `boardNowPlaying`), `boardConnection` query, `reportBoardDisconnect` mutation, `reportBoardClimb` doc updated to auth-optional.
- **Hand-written types** `packages/shared-schema/src/types/board-presence.ts` — `BoardConnectionHolder`, `BoardConnectionChanged`, union extended. (Resolvers use these, not codegen output.)
- Codegen regenerated (`vp run codegen`).

---

## Remaining work

### 1. Auth relaxation so anon can be a board member (REQUIRED — the anon path is dead without it)

`reportBoardClimb` is auth-optional, but it still requires `hasBoardMembership(boardId, emitterId)`, and membership is only stamped by the board-resolve mutations, which are `requireAuthenticated`. So an anonymous client today can never pass the membership check. Fix:

- In `packages/backend/src/graphql/resolvers/board-presence/mutations.ts`, the **read/connect** resolvers `resolveBoardForConfig` and `resolveBoardForUuid`: drop `requireAuthenticated`; stamp membership by the emitter id (`ctx.userId ?? \`conn:${ctx.connectionId}\``) via `pubsub.stampBoardMembership(boardId, emitterId)`. **Keep create/own (e.g. `createBoard`, `recordBoardSerial`/serial *write* paths) auth-only.** `resolveBoardForSerial` can stay auth-only for now if simpler (the anon web path uses config/uuid); confirm during build.
- `stampBoardMembership`/`hasBoardMembership`/`getBoardMembershipFirstSeen` take a string id already — no signature change; pass the emitter id. Keys become `presence:board:{id}:user:conn:{cid}` for anon, which is fine (unique).
- **Security review (the biggest surface):** anon can now emit to the live feed + durable `board_climb_events` (userId=null). Confirm: rate-limit covers anon (it's keyed on the connection); the 60s dwell gate still filters noise; `requireActiveBoardById` still bounds it to real boards; anon can connect to **existing** boards but never create/own. Do not relax `boardPresenceStats`/anything that exposes private data — only the live "now on the wall" + holder.

### 2. Crash backstop — clear the holder on the holder's last connection drop

Otherwise a crashed holder's slot lingers up to the 12h TTL. On `main` the per-connection cleanup scaffolding from #2842 does **not** exist (it was only on that branch), so re-create the minimal piece:

- `packages/backend/src/services/room-manager/types.ts` `ConnectedClient`: add `boardWriterEmitter?: { boardId: number; emitterId: string }` (or a set) recorded when this connection emits/holds.
- Record it where the holder is set — simplest is in `reportBoardClimb` via a room-manager call `roomManager.noteBoardWriter(ctx.connectionId, boardId, emitterId)` (mirror the announce-record pattern that existed in #2842's `recordWallLinkForConnection`).
- In `room-manager.ts` `disconnectClient(connectionId)` (and `leaveSession`): before delegating, read the connection's `boardWriterEmitter` and `pubsub.clearBoardWriterIf(boardId, emitterId)`; on success publish `BoardConnectionChanged { holder: null }` (+ `nextBoardSeq`). Keyed by emitter, so a logged-in user's graphql-ws blip (same userId reconnects) does NOT clear it.
- **Note:** an anonymous emitter's `connectionId` is NOT stable across reconnects — a blip resets it, briefly freeing then (on the next send) re-taking. Acceptable per the design; document it.
- Backstop only — the clean path is the client's `reportBoardDisconnect` on BLE drop (below), which is immune to WS blips because BLE stays up across a WS reconnect.

### 3. Backend tests (extend `packages/backend/src/__tests__/board-presence.test.ts`)

- Anonymous `reportBoardClimb` (no `ctx.userId`) succeeds once the anon emitter is a board member, and the durable row has `userId = null`.
- Holder hand-off: two emitters; the second's `reportBoardClimb` broadcasts `BoardConnectionChanged` with the new holder; a same-emitter repeat does NOT re-broadcast.
- `reportBoardDisconnect` clears only-if-holder (a non-holder call is a no-op; the holder's call broadcasts `holder: null`).
- `getBoardWriter`/`boardConnection` reflect set/clear.
- Crash backstop: holder's connection drop clears the slot; a same-emitter reconnect does not.
- The backend test DB / mock-redis: `clearBoardWriterIf` uses `eval` (Lua) — confirm the mock-redis `eval` handles the compare-and-delete, or add a tiny shim (see the hash-op shims added for the session-persistence test on the abandoned #2842 branch for the pattern).

### 4. Mobile (`packages/mobile/`)

- **Emit always** — `providers/bluetooth-provider.tsx` `handleWallConfirmed`: fire `reportBoardClimb` on every confirmed write **regardless of session** (today it's session/flag-gated). No `announceWallLink`/write-gate exists on `main` to remove.
- **Lightbulb = connect/disconnect toggle** — `components/play-drawer/lightbulb-control.ts` + `PlayDrawer.tsx`: replace the driver-model press actions (`take_party`/`release_party`/`reconnect_ble`/`deriveIsDriver`) with the existing toggle in `components/ble/use-lightbulb-toggle.ts` (press-connect / press-again-`bluetooth.disconnect()`). Not-connected → connect (the auto-push takes the board); connected → disconnect → `reportBoardDisconnect`. Visual: lit iff connected; else show the board-connection holder.
- **"Who's connected" badge** (new small component): holder + last-send from `useBoardPresenceCurrent().currentClimb` (`@boardsesh/board-presence-react`) — `currentClimb.sentBy*` + `currentClimb.sentAt`; render via `Avatar` (`src/components/Avatar.tsx`, with no `uri` → a "?" glyph for anon). Idle "?" badge once `now - currentClimb.sentAt > 15 min` (single threshold check, ~1-min re-render, no ticking; `formatRelativeTime` from `src/lib/format-relative-time.ts` exists but isn't needed for a binary "?"). Free vs held from the board-connection state (the new `boardConnection` query + `BoardConnectionChanged` sub; null after disconnect).
- **Client ops + subscription** — add `BOARD_CONNECTION` query + `REPORT_BOARD_DISCONNECT` mutation (`src/lib/graphql/operations.ts` + the shared `@boardsesh/graphql` if web later needs them); make the board-presence provider handle `BoardConnectionChanged` on the existing `boardNowPlaying` subscription (it already subscribes — add the union case to `board-presence-react` + the mobile mapping). Call `reportBoardDisconnect(boardId)` on BLE disconnect (the explicit lightbulb-off + the unexpected-drop path).
- **Anon connect** — ensure an anonymous client can call `resolveBoardForConfig`/`resolveBoardForUuid` (relaxed in step 1) so it gets a `board_id` + membership.

### 5. Validate + ship

`vp run codegen`, `vp run typecheck` (web/backend/mobile), `vp check`, `vp test run --project backend`, `vp run test:mobile`, `vp run check:mobile-bundle`. Open a PR for `feat/board-connection-holder` against `main`. Then close/redirect #2842/#2843 (superseded).

---

## Reuse pointers (verified)

- `formatRelativeTime` — `packages/mobile/src/lib/format-relative-time.ts` (dayjs-based; not needed for the binary "?").
- `Avatar` — `packages/mobile/src/components/Avatar.tsx` (initials fallback when no `uri`; render "?" for anon holders).
- `useBoardPresenceCurrent` — `@boardsesh/board-presence-react`; `currentClimb.{sentByDisplayName,sentByAvatarUrl,sentAt}` is the holder's identity + last-send (the holder IS the last sender).
- `use-lightbulb-toggle` — `packages/mobile/src/components/ble/use-lightbulb-toggle.ts` (clean connect/disconnect, calls `wrappedDisconnect`).
- The board-presence provider already subscribes to `boardNowPlaying` (`packages/mobile/src/providers/board-presence-provider.tsx`).
- **Aurora controllers are last-connection-wins** (a new connect physically boots the holder) — this is why there's no write-gate and "always-take" is free.

## Open risks

- **Security of auth-optional board presence** (step 1) — the main review surface. Anon emit to feed + durable log; bound to existing boards; rate-limit + dwell gate; never create/own.
- **Anon `connectionId` not stable across reconnects** — a WS blip resets it (brief free-then-retake). Acceptable.
- **Crash backstop vs. blip** — clearing on last-connection-drop must be keyed by emitter so a logged-in same-user reconnect doesn't demote them; rely primarily on the client's BLE-drop `reportBoardDisconnect`.
- **`boardNowPlaying` union `__resolveType`** — verify it delivers `BoardConnectionChanged` (it maps by `__typename`; backend typecheck passed, but confirm the subscription actually fans it out end-to-end).
- **OTA** — the shipped driver model (`takeControl`/`driverParticipantId`/`DriverChanged`) stays deprecated-but-functional until the R2 min-version gate; old bundles keep working. The new model is additive.

## Verification (end-to-end, 2 phones one board — A logged-in, B anonymous)

A presses lightbulb → A lit, others see A's avatar; only A writes. A idle 15 min → others see A's avatar gain a "?". B presses → B's BLE boots A (A unlit); others see "?" (anon) as the holder; nobody auto-promoted in between. B presses again → disconnect → others see the board free. A killed while holding → free (backstop), stays free until someone presses. Solo (no session): press → connect + you're the holder, emitting to board presence; press again → disconnect; a WS blip does not free you.
