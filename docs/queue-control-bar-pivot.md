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
4. **Prev/next controls exist only for the driver.** Drawer prev/next, Queue Control Bar prev/next, and the Live Activity widget prev/next are all visible only while you hold the lightbulb. When you're not driving, those controls disappear entirely — there is no meaningful action they could take (broadcasting from a non-driver would be a silent yank, the worst possible UX). The driver's prev/next walks the shared session queue and broadcasts to the wall.

A fifth, already-implemented rule worth naming: **BLE is transport, not scope.** If any party member has an active BLE connection to the board, anyone in the party can drive the wall — the lightbulb-press travels via WebSocket to whichever member holds BLE and they relay to the board. The lightbulb controls session state, not the current phone's pairing.

## The queue model

**One shared session queue per party.** Anyone in the session can append to it via Add to Queue. The driver navigates through it with prev/next. Lightbulb-press on a specific climb also appends to the shared queue. The queue is per-session — it persists for the life of the session and becomes the session history on close.

A separate "personal saved climbs" library (cross-session, private) is a future concept and **out of scope for this PR**. The single shared session queue is the only thing this work encodes.

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
3. **Prev/next controls in the drawer are hidden.** They only appear for the driver.
4. User browses freely — tap list rows, open drawer, swipe through climbs in the drawer (preview only, does not broadcast), search, filter. No wall-side consequences.
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
- **Driver-only prev/next:** `next-climb-button.tsx` and `previous-climb-button.tsx` render only when the local user holds the lightbulb. Same on the Queue Control Bar and in the Live Activity widget (which is already conceptually a remote-control for the driver). Navigating prev/next walks the shared session queue and broadcasts.
- **Rename `Set Active Climb` → "Send to board"** in `set-active-action.tsx` and the i18n catalog (`packages/web/i18n/locales/en-US/common.json`). The PostHog event name stays `Set Active Climb` for analytics continuity — only the user-facing label changes.

Files: `play-view-drawer.tsx`, `queue-control-bar.tsx`, `QueueContext.tsx`, `set-active-action.tsx`, `next-climb-button.tsx`, `previous-climb-button.tsx`, backend `queue-navigation.ts`, `room-manager.ts`, possibly new `take-control` message type in `packages/shared-schema`, i18n `common.json`.

### Phase 3 — Visual states + accessibility

The lightbulb appears in two places with two roles. They must be visually distinguishable and screen-reader-correct.

- **Drawer lightbulb:** "send/take this climb" — outlined, pressable. State depends on whether the user currently drives.
- **Bar lightbulb:** "I am holding control" — filled / glowing when held by the local user; dimmed with the current driver's avatar inline when held by someone else.
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
- Cover: solo BLE quickstart → tap → press lightbulb path; solo no-BLE state; party join → browse without consequence → take control → driver's prev/next appear → released-and-yanked flows; offline-and-back-online in a party; BLE-holder drop with 5s grace and claim-wall handoff.
- Confirm prev/next disappears for non-drivers in drawer, bar, and Live Activity widget.
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

- Queue state machine + context: `packages/web/app/components/graphql-queue/QueueContext.tsx`. `setCurrentClimb` is the function at line 383; the `shouldAddToQueue: true, insertAfterCurrent: true` payload at line 397 is what makes the implicit queue an auto-history of every tap.
- Queue Control Bar UI: `packages/web/app/components/queue-control/queue-control-bar.tsx`.
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
5. **Swipe-in-drawer for non-drivers.** Today swipe navigates queue. After the pivot, prev/next buttons are hidden for non-drivers. Recommend swipe-as-preview stays (climbs flip, no broadcast) so browsing-the-drawer continues to feel fluid.

## Non-goals / explicit nos

- Do not rename the literal word "queue" in user-facing copy in this PR. (The `Set Active Climb` → "Send to board" rename *is* in scope and lands in Phase 2.)
- Do not change the `Add to Queue` swipe gesture or menu entry. They already work and the 57:43 swipe:menu ratio suggests the gesture is the preferred path.
- Do not pre-build a session-summary / bulk-tick surface in this PR.
- Do not change Workout Generator or Onboarding in this PR.
- Do not collapse the existing `Set Active Climb` event into the new `Wall Control Taken` event. Keep them distinct for analytics continuity.
- Do not ship a climber-on-wall safety lock or yank cooldown in this PR. Today's behaviour is "any list-tap yanks instantly"; lightbulb-press is strictly better and the cooldown polish can land in v2.
