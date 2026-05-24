## Party Mode

### Driver Control System

The driver control system manages which participant controls the physical climbing board's LEDs. It is wired through the persistent session context (`PersistentSessionContext`) and the Bluetooth context (`BluetoothContext`).

**State model (`PersistentSessionStateType`):**

- `driverParticipantId: string | null` -- stable participant ID of the wall driver, or null when unclaimed.
- `participantId: string | null` -- the local user's participant ID (user UUID for authenticated, equals `clientId` for anonymous).
- Driver derivation: `isDriver = driverParticipantId === participantId`.

**Lightbulb button states:**

1. **Disconnected (no BLE):** Tapping initiates Bluetooth pairing. The `BluetoothProvider` creates a fresh adapter, shows the device picker (Web Bluetooth's `requestDevice` on web, custom `DevicePickerDialog` on Capacitor), and connects.

2. **Connected, no driver:** Board is connected but no one is driving. Lightbulb appears filled. Tapping calls `takeControl` mutation which claims the wall, optionally sending the current climb.

3. **Pending:** After tapping the lightbulb, a 2-second watcher timer starts. If `confirmClimbOnWall` arrives within that window (via the `wall-confirm-bus`), the timer is dismissed. If not, a fallback runs (auto-connect or device picker).

4. **Driver (self):** Active lightbulb with "ON WALL" pill indicator. Tapping calls `releaseControl` mutation to give up wall control.

5. **Non-driver viewing driver's climb:** The climb the driver confirmed on the wall is displayed. The queue auto-sends the current climb to the board via `BluetoothAutoSender`.

6. **Non-driver previewing different climb:** A "Return to wall" button appears, indicating the user has drifted from the driver's active climb.

**Wall confirmation flow:**

1. Driver taps lightbulb, triggering `takeControl` mutation (optionally passing a climb).
2. `BluetoothAutoSender` sends LED frames to the board via BLE (`sendFramesToBoard`).
3. On successful BLE write:
   - `emitWallConfirm(climbUuid)` fires on the local wall-confirm bus so the same phone's drawer dismisses its timer.
   - If a session exists, `confirmClimbOnWall(climbUuid)` mutation broadcasts to all participants.
4. All participants receive the `WallConfirmedClimb` event via their session-event subscription. The event is republished onto the wall-confirm bus.
5. The session records `confirmedAt` and `confirmedByParticipantId`.

**BLE write serialization (`BluetoothAutoSender`):**

The auto-sender uses a latest-wins queue pattern to avoid overlapping GATT operations:
- While a BLE write is in flight, new climbs are stored in `pendingClimbRef`.
- When the current write completes, the drain loop picks up whatever is pending.
- Same-UUID re-broadcasts are deduplicated via `lastSentUuidRef` to avoid double-firing analytics and wall-confirm.
- A single `AbortController` scoped to the AutoSender's lifetime aborts in-flight writes on unmount.

### Participant Tracking

**User list (`Session.users: SessionUser[]`):**

- Populated via the `joinSession` response and kept in sync via `SessionEvent` subscription events.
- Each user has: `id` (participant ID), `username`, `avatarUrl`, `isLeader`.
- The `PartyContext` (`party-context.tsx`) converts `SessionUser[]` to `ConnectedUser[]`, filtering out the current user and mapping `isLeader` to `isHost`.

**Avatar group:**

- Current driver is highlighted with a lightbulb badge.
- Tick badges on avatars show who has sent the current climb (from `tickedBy` on `ClimbQueueItem`).
- Tapping the avatar group expands to a full participant list with display names.

**Invite sharing:**

- Share link format: `{origin}/join/{sessionId}`.
- Share button uses `shareWithFallback` (Web Share API with clipboard fallback).
- QR code via `QRCodeSVG` component: 180px, level M, with 4px margin. Toggle via `QrCode2Outlined` icon button.
- During onboarding tour, a non-URL QR payload (`boardsesh:onboarding-tour-preview`) is shown so scanned codes don't navigate anywhere.

### Angle Sync

When any participant changes the board angle:

1. The angle-selector component pushes the new URL locally via `router.push` for instant feedback.
2. `setSessionBoardPath(boardPath)` mutation broadcasts the new path to all session members.
3. Other participants receive `SessionBoardPathChanged` event.
4. The `BoardSessionBridge` component's session-event subscription calls `router.replace(event.boardPath)` to sync the URL, preserving query string.
5. Self-originated events are suppressed via `changedByParticipantId` comparison.

### Board Serial Sharing

- `setSessionBoardSerial(serial)` mutation stores the serial on the session. Called from `BluetoothProvider.handleConnectSuccess` after a successful BLE connect.
- `SessionBoardSerialChanged` event notifies all participants, updating `session.lastConnectedBoardSerial`.
- Other mobile participants can use this serial to auto-connect to the same physical board.
- Duplicate serial broadcasts are suppressed when the new serial matches the existing one.
- The serial is parsed from the BLE device name via `parseSerialNumber()`.

### Connection Management

**WebSocket connection manager (`websocket-connection-manager.ts`):**

- Singleton `WebSocketConnectionManager` class tracks all registered `graphql-ws` clients.
- Connection states: `idle`, `connecting`, `connected`, `reconnecting`, `stale`, `error`.
- Health check runs every 1s (`HEALTH_CHECK_INTERVAL_MS`).
- Keep-alive: 5s (`KEEP_ALIVE_MS`). Stale grace: 25s (`STALE_GRACE_MS`).
- Handles `visibilitychange` events for background/foreground transitions.

**Persistent session lifecycle:**

- Session data persisted in IndexedDB via `ACTIVE_SESSION_KEY`.
- On restore: checks if the session was auto-finished by the backend due to inactivity, and shows the summary dialog if so.
- Corruption detection: 30-second cooldown (`CORRUPTION_RESYNC_COOLDOWN_MS`) between corruption-triggered resyncs.
- Split context architecture: `PersistentSessionActionsContext` (stable function references) and `PersistentSessionStateContext` (frequently-changing state) to minimise re-renders.

### Data Layer

| Operation | Type | Purpose |
|---|---|---|
| `takeControl` | Mutation | Claims wall driver status, optionally with a climb |
| `releaseControl` | Mutation | Releases wall driver status |
| `confirmClimbOnWall` | Mutation | Confirms a climb was sent to the board via BLE |
| `setSessionBoardPath` | Mutation | Broadcasts angle/board path change to all members |
| `setSessionBoardSerial` | Mutation | Shares which physical board serial is connected |
| `sessionUpdates` | Subscription | Real-time session events (driver changes, path changes, serial changes, participant joins/leaves) |
| `queueUpdates` | Subscription | Real-time queue state changes (add, remove, reorder, current climb) |

---

