# Queue Control Bar Pivot — Bar Mirrors the Wall, Lightbulb Controls the Driver

**Status:** Plan, ready for implementation
**Decision date:** 2026-05-16
**Driven by:** Observed user-testing pain in large-group party sessions, supported by 3 months of Vercel Analytics + 1 week of PostHog
**Owner (assign on pickup):** TBD

---

## Problem

The current Queue Control Bar collapses two distinct concepts into one piece of state:

1. **What the user is looking at / has just tapped** (browse state).
2. **What is physically lit up on the climbing wall** (wall state).

Every tap, swipe, list click, or list-cover click currently mutates the "active climb" and therefore the wall.

**In large-group party sessions this is observed user pain (user-tested).** Non-climbing party members — resting between turns and trying to line up what to climb next — cannot browse the catalogue without immediately changing what is lit on the wall for whoever is currently climbing. This isn't a problem inferred from event ratios; it is a problem we have watched happen in user research.

The analytics review supports the observed pain: the persistent Queue Control Bar UI is essentially dead as an interaction surface (~20 events vs 28,795 underlying queue operations over 3 months), and explicit queue building is rare (53:1 sends-to-explicit-adds). Both are consistent with users not safely interacting with a control surface that has destructive side effects.

## The pivot

Decouple **wall state** from **browse state**. Introduce a single explicit control gesture — the lightbulb — that mediates whether the current user is driving the wall.

Four rules:

1. **The Queue Control Bar mirrors the wall.** It always shows what is physically lit, regardless of who put it there. In solo it's whatever the user last sent. In party it's whatever the current driver has on the wall, streamed in over the existing party WS subscription.
2. **The lightbulb means "I am driving."** Press to take control. Press again to release. Yank-on-press with no negotiation — strictly better than today, where any list-tap from anyone yanks the wall with no affordance at all. A climber-on-wall safety lock (cooldown / "wall in use" modal) is explicitly v2; the v1 model is already a large improvement over the status quo.
3. **Browsing is consequence-free.** Tapping a climb in the list, swiping through the Play View drawer, opening climb details — none of it touches the wall or the wall mirror. Only an explicit lightbulb-press broadcasts.
4. **Prev/next controls live on the wall-control surfaces, not the browsing surface.** The Queue Control Bar prev/next and the Live Activity widget prev/next are visible to *everyone*, driver or not — both surfaces obviously *are* the wall (the bar mirrors it; the widget is a remote control), so pressing prev/next on them is an unambiguous "I want to change the wall" gesture. The Play View Drawer prev/next *buttons* are driver-only and hidden for non-drivers (the drawer is a browsing surface and buttons there would be ambiguous about whether they navigate-and-broadcast or just-navigate). Non-drivers still get swipe-as-preview in the drawer — see rule 5.
5. **Swipe in the drawer is preview-only for non-drivers, broadcast for drivers.** The swipe gesture stays available for everyone (the dominant interaction in the data — 4,753 next-swipes per week). For non-drivers it walks the suggested-climbs feed only (skips the queue, since the queue represents what the driver is committed to climbing — not a non-driver's browsing surface) and does not broadcast. For drivers it walks queue → suggestions and broadcasts each step, identical to driver-side prev/next buttons.
6. **Pressing bar or Live Activity prev/next as a non-driver is a single combined action: take control + advance + broadcast.** No separate "grab the light first" step. The button press itself is the explicit take-control gesture. It walks from whatever the current wall climb is — queue first, then suggestions — and broadcasts the new step. Previous driver's lightbulb releases automatically (same yank-on-press semantics as pressing the lightbulb directly).

A seventh, already-implemented rule worth naming: **BLE is transport, not scope.** If any party member has an active BLE connection to the board, anyone in the party can drive the wall — the lightbulb-press travels via WebSocket to whichever member holds BLE and they relay to the board. The lightbulb controls session state, not the current phone's pairing.

## The queue and suggestions model

Two distinct lists, both already represented in code (`QueueContext.tsx`):

- **Shared session queue (`state.queue`).** One per party. Anyone in the session can append to it via Add to Queue. Lightbulb-press on a specific climb also appends. The queue is per-session — it persists for the life of the session and becomes the session history on close. Represents "the climbs we agreed on."
- **Suggested climbs (`suggestedClimbs`).** Derived from the user's current browse context (filter, search results, list view) — see `use-queue-data-fetching.tsx:234`. Updates as the user navigates the catalogue. Represents "what else is interesting right now." Filtered to exclude items already in the queue.

Navigation rules layer on top:

- **Driver, any surface (drawer buttons, drawer swipe, bar buttons, Live Activity buttons):** walks `queue` first, falls through to `suggestedClimbs` when the queue is exhausted. Each step broadcasts. This is exactly the existing `getNextClimbQueueItem` logic in `QueueContext.tsx:576-580` — the pivot keeps it and gates the broadcast on driver status.
- **Non-driver, drawer swipe:** walks `suggestedClimbs` only. Does not touch the queue. Does not broadcast. Pure preview.
- **Non-driver, bar buttons or Live Activity buttons:** single combined action — take control, advance from the current wall climb (queue → suggestions fall-through), broadcast. The button press *is* the take-control gesture; no separate lightbulb-tap needed.

A separate "personal saved climbs" library (cross-session, private) is a future concept and **out of scope for this PR**.

## Queue list rendering rules

The expanded queue list view (`packages/web/app/components/queue-control/queue-list.tsx`) renders three regions in order:

1. **History** — climbs already sent to the wall in this session. **Default: render the most recent 5 history items.** A "Show full history" button at the top of the history region expands to show every history item from the session. Today's `scrollToHistoryIndex = historyItems.length - 2` logic in `queue-list.tsx:230` should be reworked around this 5-item default.
2. **Current item** — the climb currently lit on the wall.
3. **Upcoming queue** — items added via Add to Queue that haven't been broadcast yet, followed by suggested-climbs once the queue is exhausted (same fall-through as navigation).

**Open behavior:** when the list is opened (drawer or full-screen view), scroll so the current item is vertically centered in the visible area. Existing `scrollToCurrentClimb` API at `queue-list.tsx:50` is the right hook — its scroll target needs to be the center of the viewport, not the top. If there aren't enough history items to push the current item to true center (e.g. session just started), let it sit at its natural position rather than padding artificially.

## User flows after the pivot

### Solo, BLE quickstart from Home

1. User connects via BLE quickstart on Home. Lightbulb auto-engages.
2. User taps a climb in any list → Play View Drawer opens (current behaviour).
3. The drawer's primary action is the lightbulb. Solo + connected = auto-on, so pressing it sends to the board.
4. Drawer also shows prev/next (driver-only controls). They walk the session queue and broadcast.
5. Closing the drawer leaves the wall as-is. The Queue Control Bar mirrors the lit climb with the lightbulb in held-state and its own prev/next visible.

**Net for solo: essentially unchanged.** Once BLE is connected, tap-and-send still works as today. The model is the same; the abstraction is just consistently applied.

### Solo, no BLE

1. Tap → drawer opens → lightbulb is off (no output device).
2. Pressing the lightbulb initiates BLE pairing.
3. Prev/next controls are hidden — there's no wall to drive.

### Party member, joining an existing session, not driving

1. User joins party. Lightbulb is off (someone else is driving).
2. Queue Control Bar mirrors the current driver's climb live via party WS.
3. **Prev/next buttons in the drawer are hidden.** They only appear for the driver. The Queue Control Bar's prev/next *and* the Live Activity widget's prev/next remain visible — pressing either takes control + advances + broadcasts as a single action.
4. User browses freely — tap list rows, open drawer, search, filter. Swipe in the drawer walks the suggested-climbs feed (preview only, does not broadcast, does not navigate the shared queue). No wall-side consequences from drawer interaction.
5. User finds a climb they want to suggest → press "Add to Queue". Appends to the shared session queue; visible to everyone but does not change the wall and does not take control.
6. User wants to take a turn → press lightbulb on the climb in the drawer. Yanks control from current driver, broadcasts new climb, party WS pushes update to every member's bar.
7. New driver's prev/next controls appear in their drawer + bar; Live Activity widget activates. Previous driver's lightbulb releases automatically; their drawer prev/next disappears.

### Party host with no BLE, while another member has BLE

Same as above except every wall-mutating action (lightbulb-press, prev/next) routes over WS to the BLE-holding member, which relays to the board. From the user's perspective, identical — with a small "via Alice" microcopy on the bar so the user understands the path.

### BLE-holder drops mid-session in party

1. Bar continues to mirror last-known wall state for a 5-second grace period.
2. If no other BLE-capable member reconnects in that window, bar surfaces a "Wall offline" indicator.
3. Lightbulb becomes a "Claim wall" affordance — any member who can establish BLE can take over.
4. When a new holder establishes BLE, normal operation resumes silently for the current driver.

## Out of scope for this PR

- Renaming the literal word "queue" in user-facing copy. The lightbulb teaches the model; the word can wait. (We *will* rename `Set Active Climb` → "Send to board" — see Phase 2 — because that's a one-line copy change with no design cost.)
- "Personal saved climbs" library (cross-session, private). Future work, not needed for the pivot.
- Bulk-tick / session-summary surface. The natural next pivot built on the cleaner session history this work produces. Tracked separately.
- Workout Generator surfacing changes. Separate workstream.
- Climber-on-wall safety lock / yank cooldown. The v1 yank-on-press model is strictly better than today's "any list-tap yanks instantly"; safety polish is a v2 follow-up.

## Implementation phases

Each phase should ship behind a small, scoped change and be independently verifiable in dev.

### Phase 1 — Decouple bar state from active climb

**Goal:** the Queue Control Bar reflects what is on the wall, not what the user has navigated to.

- Introduce a `wallClimb` field (or equivalent — pick the cleanest name) on the queue/session state. In solo this updates only when a BLE send succeeds. In party this updates from the party WS broadcast.
- Update `packages/web/app/components/queue-control/queue-control-bar.tsx` to render `wallClimb` instead of `currentClimb` for its primary display.
- Verify: opening the drawer, swiping inside it, and tapping list items does not change what the bar shows. Only an explicit send does.
- Preserve the implicit `setCurrentClimb` behaviour for now — phase 2 takes that away. This phase is read-only changes to the bar.

Files: `queue-control-bar.tsx`, `graphql-queue/QueueContext.tsx`, possibly `packages/backend/src/services/room-manager/queue-state.ts` if `wallClimb` needs server-side tracking for party.

### Phase 2 — Lightbulb + driver-only navigation + Set Active rename

**Goal:** browsing stops mutating active state. The lightbulb becomes the only way to set the wall. Prev/next controls become driver-only. `Set Active Climb` is renamed to "Send to board" in the same change.

- Add a lightbulb action to the Play View Drawer. Pressing it triggers what used to be `setCurrentClimb` — sends to board (solo) or broadcasts to party.
- Add a lightbulb state to the Queue Control Bar that reflects whether the local user is currently driving. Pressing toggles ownership.
- Change `setCurrentClimb` in `QueueContext.tsx:383` so it no longer fires on tap. The current implicit append-to-queue side effect (`shouldAddToQueue: true, insertAfterCurrent: true`) fires from the lightbulb path only.
- List-row clicks (`Climb List Row Clicked`, `Climb List Cover Clicked`) continue to open the drawer; they no longer call `setCurrentClimb`.
- Solo default: lightbulb auto-engages once BLE is connected (so quickstart-from-home → first tap → first lightbulb press feels like the old tap-to-send flow).
- Party default: lightbulb is off on join; user presses to take a turn.
- Yank-on-press in party: pressing lightbulb sends a `TakeControl` message; server broadcasts new driver to all members. Previous driver's lightbulb releases.
- **Driver tracking on the session.** Add a `driverParticipantId: ID` field to the `Session` GraphQL type (`packages/shared-schema/src/schema/session.ts`, around the existing `participants` field at line ~175). Update `SessionParticipant` resolver / payload to be orderable by driver-first. Server is the source of truth; the field is broadcast over the existing party WS subscription on take-control, release, and disconnect.
- **Driver-only prev/next in the drawer:** `next-climb-button.tsx` and `previous-climb-button.tsx`, *when used inside the Play View Drawer*, render only when the local user holds the lightbulb. Navigating prev/next here walks the shared session queue first, then falls through to `suggestedClimbs` once the queue is exhausted, broadcasting each step. The existing `getNextClimbQueueItem` logic in `QueueContext.tsx:576-580` already implements this fall-through; the change is gating the broadcast on driver status.
- **Always-visible prev/next on the Queue Control Bar and in the Live Activity widget:** these render for everyone. For the driver they behave identically to the drawer buttons. For a non-driver, pressing one is a single combined action — take control, advance from the current wall climb (queue → suggestions fall-through), broadcast. Implement as: handler checks driver status, if not driving issues a `TakeControl` first (server-side ordering: take-control then advance), then runs the standard advance + broadcast. No separate user gesture required.
- **Non-driver swipe handler:** drawer swipe stays available for non-drivers but walks `suggestedClimbs` only (skips `state.queue`) and does not broadcast. This is a different code path from the driver swipe — extract a shared helper or split the navigation hook so the driver/non-driver split is explicit.
- **Rename `Set Active Climb` → "Send to board"** in `set-active-action.tsx` and the i18n catalog (`packages/web/i18n/locales/en-US/common.json`). The PostHog event name stays `Set Active Climb` for analytics continuity — only the user-facing label changes.

Files: `play-view-drawer.tsx`, `queue-control-bar.tsx`, `QueueContext.tsx`, `set-active-action.tsx`, `next-climb-button.tsx`, `previous-climb-button.tsx`, backend `queue-navigation.ts`, `room-manager.ts`, possibly new `take-control` message type in `packages/shared-schema`, i18n `common.json`.

### Phase 3 — Visual states + accessibility

The lightbulb appears in two places with two roles. They must be visually distinguishable and screen-reader-correct.

- **Drawer lightbulb:** "send/take this climb" — outlined, pressable. State depends on whether the user currently drives.
- **Bar lightbulb:** "I am holding control" — filled / glowing when held by the local user; dimmed with the current driver's avatar inline when held by someone else.
- **Driver-first avatar group on the session mini bar.** The party member `AvatarGroup` (currently in `queue-control-bar.tsx:1025-1045` and the expanded variant at `:1112+`) must order the current driver first. The driver's avatar carries a small lit-up lightbulb badge in the corner (overlay), matching the bar lightbulb's filled/glowing visual. Non-driver avatars render without a badge in their existing order. The expanded version of the avatar menu (the roster view) follows the same ordering and badging rules so the driver is unambiguous wherever members are listed.
- **VoiceOver/TalkBack labels** must be role-and-state distinct:
  - Drawer + driving: "Send '{climbName}' to the wall."
  - Drawer + not driving: "Take wall control and send '{climbName}'."
  - Bar + you're holding: "You're driving. Tap to release."
  - Bar + someone else holds: "{name} is driving. Tap to take over."
- **State must not be encoded by colour alone** (WCAG 1.4.1). Use fill/outline variants + avatar attribution on the bar.
- **Hit targets** minimum 48×48dp. Lightbulb on the drawer must sit in the bottom action row (thumb-zone-aligned for iPhone Pro Max one-handed use).
- **First-run coachmark:** on the user's first drawer-open after this ships, pulse the lightbulb once with a brief tooltip ("Send to the wall"). Persist a `lightbulbSeen` flag in IndexedDB per the existing `swipeHint:*` pattern in `queue-control-bar.tsx`.

Use existing tokens from `packages/web/app/theme/theme-config.ts`. No new colours or spacing primitives.

### Phase 4 — BLE-holder disconnect handling

**Goal:** the wall-offline state must ship in v1, not as a follow-up. A silent stuck-on-last-climb state is worse than today's behaviour and would erode trust in the new model.

- Track BLE-holder presence in the room manager. On disconnect, start a 5-second grace timer.
- If grace expires with no other BLE-capable member, broadcast a `WallOffline` state to all party members.
- Bar UI surfaces a small "Wall offline" indicator (text + muted styling on the wall-climb preview).
- Lightbulb becomes a "Claim wall" affordance for any member who can establish BLE.
- On successful BLE establishment by a new holder, broadcast `WallOnline` and resume.

Files: `packages/backend/src/services/room-manager/room-manager.ts`, `client-lifecycle.ts`, `packages/shared-schema` for new message types, `queue-control-bar.tsx` for the offline visual.

### Phase 5 — Instrumentation

Update analytics so we can verify the pivot works in production. **Critical: do not change the semantics of any existing event** — that would break the time series and make it impossible to measure success against today's baseline.

- **New event** `Wall Control Taken` — properties: `source: 'lightbulb_drawer' | 'lightbulb_bar' | 'send_to_board_menu' | 'auto_solo'`, `previousDriver: 'none' | 'self' | 'other'`, `mode: 'solo' | 'party'`, `boardLayout`.
- **New event** `Wall Control Released` — properties: `reason: 'manual' | 'yanked' | 'disconnect'`, `mode`, `boardLayout`.
- **New events** `Wall Offline` and `Wall Online` — fired when the BLE-holder grace period expires / a new holder establishes. Properties: `mode`, `previousHolderRole: 'self' | 'other'`, `gracePeriodMs`.
- **Existing event** `Set Active Climb` — semantics unchanged. Still fires from the (now renamed-in-UI to "Send to board") menu action. The lightbulb path fires `Wall Control Taken` instead. Do not collapse the two — keep them distinct so the time series is interpretable.
- **Existing event** `Queue Navigation` — semantics unchanged. After the pivot it fires only from the now-driver-only prev/next paths, so volume will drop in absolute terms (only drivers fire) but each event represents a deliberate broadcast, which is the cleaner signal.
- **Existing `Queue Operation`** — expect a dramatic drop in `setCurrentClimb` operations (today 60% of all queue ops, ~18K events / 3 months) because browsing no longer mutates. The cleaner signal that survives is the explicit lightbulb-press.
- **Existing `Add to Queue`** — semantics unchanged; expect modest growth as the feature has a clearer purpose ("suggest for the session") distinct from broadcast. Watch the `swipe` vs `climbActions` split (today 57:43).

**Pre-registered success metric (lock in before launch):**

- Within 4 weeks of rollout, `Wall Control Taken` events per active party-mode user should exceed today's `Set Active Climb` event rate per active party-mode user.
- AND party-cohort retention (sessions per user over a 30-day window) should not decline relative to the 4 weeks before launch.

If either misses, the pivot is reverted or revised. Record the baselines before phase-2 ships.

Update `packages/web/app/lib/queue-metrics.ts` if the operation sampling logic needs to accommodate the new events.

### Phase 6 — QA + dev-server validation

Standard project flow per CLAUDE.md:

- Write `.boardsesh/qa-notes.md` with the QA plan before starting `vp run dev`.
- Cover: solo BLE quickstart → tap → press lightbulb path; solo no-BLE state; party join → browse without consequence → take control → driver's drawer prev/next appear → released-and-yanked flows; non-driver pressing bar prev/next yanks-and-advances in one gesture; non-driver pressing Live Activity prev/next yanks-and-advances in one gesture; offline-and-back-online in a party; BLE-holder drop with 5s grace and claim-wall handoff.
- Confirm drawer prev/next buttons disappear for non-drivers, but bar prev/next and Live Activity prev/next remain visible.
- Confirm "Send to board" label appears wherever "Set Active Climb" did.
- Run `vp check` and `vp run typecheck` before pushing.
- Open a PR with screenshots / screen recordings of the new lightbulb states and the driver-vs-non-driver UI difference.

## Background — why this design

**Observed pain (user-tested):** in large-group party sessions, climbers resting between turns cannot browse the catalogue to line up what they want next, because tapping a climb in the list immediately changes what is lit on the wall for the climber currently on the route. This pattern has surfaced repeatedly in user testing. The pivot's primary job is to fix this.

**Supporting analytics** — three months of production data from Vercel Analytics dashboard (no API access; PostHog only went live this week so its window is ~7 days):

| Metric | 3-month total | Visitors |
|---|---:|---:|
| Climb Sent to Board Success | 79,735 | 2,419 |
| Queue Operation (sampled) | 28,795 | 4,071 |
| Session Started + Session Joined | ~1,800 | ~1,400 |
| Add to Queue | 1,492 | 494 |
| Queue Control Bar swipe + button | ~20 | ~7 |

Queue Operation breakdown (3-month, sampled at max 5 per op-type per session; visitor counts are accurate, event totals are floors):

- `setCurrentClimb` — 60%, 4,000 visitors (essentially every user). Fires on every tap-to-make-active and currently auto-appends to the queue.
- `setCurrentClimbQueueItem` — 29%, 1,900 visitors. Navigating through queue history.
- `addToQueue` — 6%, 425 visitors.
- Long tail: `replaceQueueItem` 2%, `setQueue` 2%, `mirrorClimb` 1%.

`Add to Queue` UI events (3 months) by source: `swipe` 240, `climbActions` 183. The dedicated `queueButton` source fires zero events — likely an instrumentation gap or invisible affordance.

`Queue Navigation` UI events (PostHog week — directionally stable): 4,753 next-swipes + 1,085 previous-swipes inside the Play View drawer. 20 events combined on the Queue Control Bar arrows/swipe. 8 events on the bar's button arrows. The persistent control bar is structurally unused as an interaction surface.

Board concentration: Kilter Original 78% of sends, Kilter Homewall 17%, everything else combined 5%. Design Kilter-first; cross-board parity is a tax that returns nothing.

The 1,650-visitor gap between "queue-touching" (4,071) and "board-sending" (2,419) is consistent with hesitant-to-tap behaviour: users who would explore the catalogue but don't because the cost of tapping is "you change the wall." The pivot drops that cost to zero.

## Code pointers (verified, may drift)

- Queue state machine + context: `packages/web/app/components/graphql-queue/QueueContext.tsx`. `setCurrentClimb` is the function at line 383; the `shouldAddToQueue: true, insertAfterCurrent: true` payload at line 397 is what makes the implicit queue an auto-history of every tap. The queue → suggestions fall-through lives in `getNextClimbQueueItem` at line ~570-583.
- Suggestions derivation: `packages/web/app/components/queue-control/hooks/use-queue-data-fetching.tsx:234` (`suggestedClimbs` memo, derived from `climbSearchResults`).
- Queue Control Bar UI: `packages/web/app/components/queue-control/queue-control-bar.tsx`. Party member `AvatarGroup` lives at `:1025-1045` (mini bar) and `:1112+` (expanded variant) — both need driver-first ordering and the lightbulb badge.
- Queue list view: `packages/web/app/components/queue-control/queue-list.tsx`. History default count, "Show full history" button, and current-item-centered-on-open all land here. Existing `scrollToCurrentClimb` (`:50`), `history-item` / `history-divider` row types (`:40-41`), and `scrollTargetFlatIndex` logic (`:218+`) are the hooks to reuse.
- Session participant schema: `packages/shared-schema/src/schema/session.ts:147` (`SessionParticipant` type) and `:175` (`participants` field on `Session`). Add `driverParticipantId` on the `Session` type here.
- Play View Drawer (where the lightbulb action will live): `packages/web/app/components/play-view/play-view-drawer.tsx`.
- Prev/next button components: `packages/web/app/components/queue-control/next-climb-button.tsx`, `previous-climb-button.tsx`.
- BLE send + connection: `packages/web/app/components/board-bluetooth-control/bluetooth-context.tsx`, `auto-connect-handler.tsx`, `use-board-bluetooth.ts`.
- "Send to board" action (renamed from Set Active Climb): `packages/web/app/components/climb-actions/actions/set-active-action.tsx`.
- Backend party / queue state: `packages/backend/src/services/room-manager/queue-state.ts`, `room-manager.ts`, `client-lifecycle.ts`, `queue-navigation.ts`.
- Live Activity widget navigation: `packages/backend/src/handlers/widget-navigate.ts`.
- Analytics wrapper: `packages/web/app/lib/analytics.ts`. Queue Operation sampling: `packages/web/app/lib/queue-metrics.ts`.

## Open questions (remaining)

Not blockers. The implementing engineer should make the call in code review with whoever owns UX.

1. **Lightbulb hold without an output device (solo + no BLE).** Off until BLE is up (with a "Connect a board" affordance in its place), or auto-engage so pressing it triggers pairing? Recommend the latter — single discoverable affordance regardless of connection state.
2. **Hand-off notification UX.** When someone yanks control from you, what does your phone do? Recommend: a quiet toast ("Alice took the wall"), no haptic, no sound — climbing flow shouldn't have negotiation friction.
3. **Lightbulb position on the bar when someone else holds it.** Driver's avatar inline with the lightbulb; tapping the avatar opens the party roster.
4. **Add to Queue placement under the new model.** The action stays, but its UX placement may want revisiting (still swipe-on-list-row? still a menu item? both?). No change in this PR; flag for the design pass that follows.
5. **Swipe-in-drawer for non-drivers.** Resolved: swipe stays available and walks `suggestedClimbs` only (preview, no broadcast, skips the shared queue). See "The queue and suggestions model" above.

## Non-goals / explicit nos

- Do not rename the literal word "queue" in user-facing copy in this PR. (The `Set Active Climb` → "Send to board" rename *is* in scope and lands in Phase 2.)
- Do not change the `Add to Queue` swipe gesture or menu entry. They already work and the 57:43 swipe:menu ratio suggests the gesture is the preferred path.
- Do not pre-build a session-summary / bulk-tick surface in this PR.
- Do not change Workout Generator or Onboarding in this PR.
- Do not collapse the existing `Set Active Climb` event into the new `Wall Control Taken` event. Keep them distinct for analytics continuity.
- Do not ship a climber-on-wall safety lock or yank cooldown in this PR. Today's behaviour is "any list-tap yanks instantly"; lightbulb-press is strictly better and the cooldown polish can land in v2.
