# Queue Control Bar Pivot — Bar Mirrors the Wall, Lightbulb Controls the Driver

**Status:** Plan, ready for implementation
**Decision date:** 2026-05-16
**Driven by:** PostHog + Vercel Analytics review of 3 months of production data
**Owner (assign on pickup):** TBD

---

## Problem

The current Queue Control Bar collapses two distinct concepts into one piece of state:

1. **What the user is looking at / has just tapped** (browse state).
2. **What is physically lit up on the climbing wall** (wall state).

Every tap, swipe, list click, or list-cover click currently mutates the "active climb" and therefore the wall. In solo this is merely confusing. In party mode it is actively destructive — every browse action by any party member rewrites what every other member's wall is showing.

This conflation is the root cause behind several findings from the analytics review (see Background below). Most importantly: it makes the persistent Queue Control Bar UI essentially dead (~20 events vs 28,795 underlying queue operations over 3 months) because users can't safely interact with it.

## The pivot

Decouple **wall state** from **browse state**. Introduce a single explicit control gesture — the lightbulb — that mediates whether the current user is driving the wall.

Three rules:

1. **The Queue Control Bar mirrors the wall.** It always shows what is physically lit, regardless of who put it there. In solo this is whatever the user last sent. In party it is whatever the current driver has on the wall, streamed in over the existing party WS subscription.
2. **The lightbulb means "I am driving."** Press to take control (yank-on-press — no negotiation, matches established climbing-board apps). Press again to release.
3. **Browsing is consequence-free.** Tapping a climb in the list, swiping through the Play View drawer, opening climb details — none of it touches the wall or the wall mirror. Only an explicit lightbulb-press broadcasts.

A fourth, already-implemented rule worth naming: **BLE is transport, not scope.** If any party member has an active BLE connection to the board, anyone in the party can drive the wall — the lightbulb-press travels via WebSocket to whichever member holds BLE and they relay to the board. The lightbulb controls session state, not the current phone's pairing.

## User flows after the pivot

### Solo, BLE quickstart from Home

1. User connects via BLE quickstart on Home. Lightbulb auto-engages.
2. User taps a climb in any list → Play View Drawer opens (current behavior).
3. The drawer's primary action is the lightbulb. Because solo + connected = auto-on, the first press sends.
4. Swiping inside the drawer to the next/previous climb does not mutate the wall. The user must press the lightbulb on the climb they want.
5. Closing the drawer leaves the wall as-is. The Queue Control Bar still shows the lit climb, with the lightbulb in a held-state.

Net: same number of taps as today for the deliberate "I want to climb this" flow, but browse no longer accidentally commits.

### Solo, no BLE

1. Tap → drawer opens → lightbulb is off (no output device).
2. Pressing lightbulb either initiates BLE pairing or is a no-op with a clear "Connect a board" affordance.
3. The Queue Control Bar shows the user's history (queue) rather than the wall (no wall to mirror).

### Party member, joining an existing session

1. User joins party. Lightbulb is off (someone else is driving).
2. Queue Control Bar shows the current driver's climb, updated live from party WS.
3. User can freely browse, open drawer, swipe, search — nothing affects the wall.
4. User finds a climb they want to suggest → press "Add to Queue" (works as today, adds to shared queue, unobtrusive — does not take control).
5. User wants to take a turn → press lightbulb on the climb. Yanks control from current driver, broadcasts new climb, party WS pushes update to every member's bar.
6. Driver's bar now shows the new climb with lightbulb in held-state. Previous driver's lightbulb releases automatically.

### Party host with no BLE, while another member has BLE

Same as the above except the lightbulb-press travels over WS to the BLE-holding member and relays to the board. From the user's perspective, identical.

## Out of scope for this PR

- Renaming "queue" anywhere in the UI. The lightbulb teaches the model; the word does not need to change for this pivot.
- Bulk-tick / session-summary surface. That is the natural next pivot built on top of the cleaned-up history this work produces. Tracked separately.
- Live Activity / iOS lock-screen widget behaviour. The widget needs to be re-evaluated against the new mental model in a follow-up.
- Workout Generator surfacing. Separate workstream.

## Implementation phases

Each phase should ship behind a small, scoped change and be independently verifiable in dev.

### Phase 1 — Decouple bar state from active climb

**Goal:** the Queue Control Bar reflects what is on the wall, not what the user has navigated to.

- Introduce a `wallClimb` field (or equivalent — pick the cleanest name) on the queue/session state. In solo this updates only when a BLE send succeeds. In party this updates from the party WS broadcast.
- Update `packages/web/app/components/queue-control/queue-control-bar.tsx` to render `wallClimb` instead of `currentClimb` for its primary display.
- Verify: opening the drawer, swiping inside it, and tapping list items does not change what the bar shows. Only an explicit send does.
- Preserve the implicit `setCurrentClimb` behaviour for now — phase 2 takes that away. This phase is read-only changes to the bar.

Files to touch: `queue-control-bar.tsx`, `graphql-queue/QueueContext.tsx`, possibly `packages/backend/src/services/room-manager/queue-state.ts` if `wallClimb` needs server-side tracking for party.

### Phase 2 — Lightbulb as explicit control

**Goal:** browsing stops mutating active state. The lightbulb becomes the only way to set the wall.

- Add a lightbulb action to the Play View Drawer. Pressing it triggers what used to be `setCurrentClimb` — sends to board (solo) or broadcasts to party.
- Add a lightbulb state to the Queue Control Bar that reflects whether the local user is currently driving. Pressing toggles ownership.
- Change `setCurrentClimb` in `QueueContext.tsx:383` so it no longer fires on tap. The current implicit append-to-queue side effect (`shouldAddToQueue: true, insertAfterCurrent: true`) should fire from the lightbulb path only.
- List-row clicks (`Climb List Row Clicked`, `Climb List Cover Clicked`) continue to open the drawer; they do not call `setCurrentClimb` anymore.
- Solo default: lightbulb auto-engages once BLE is connected (so quickstart-from-home → first tap → first lightbulb press feels like the old "tap to send" flow).
- Party default: lightbulb is off on join; user presses to take a turn.
- Yank-on-press in party: pressing lightbulb sends a `TakeControl` message; server broadcasts new driver to all members. Previous driver's lightbulb releases.

Files to touch: `play-view-drawer.tsx`, `queue-control-bar.tsx`, `QueueContext.tsx`, `set-active-action.tsx` (collapse to a synonym for "open drawer + press lightbulb"), backend `queue-navigation.ts`, `room-manager.ts`, possibly new `take-control` message type in `packages/shared-schema`.

### Phase 3 — Visual states for the lightbulb

The lightbulb appears in two places with two roles. They must be visually distinguishable:

- **In the drawer:** "send/take this climb" — outlined, pressable. State depends on whether the user currently drives (and would press to release) or not (and would press to take).
- **On the bar:** "I am holding control" — filled / glowing when held by the local user; dimmed or neutral when held by another driver. In party, show whose avatar holds it.

Requires a quick design pass. Use existing tokens from `packages/web/app/theme/theme-config.ts`. No new colors or spacing primitives.

### Phase 4 — Instrumentation

Update analytics so we can verify the pivot works in production.

- **New event** `Wall Control Taken` — properties: `source: 'lightbulb_drawer' | 'lightbulb_bar' | 'set_active_menu' | 'auto_solo'`, `previousDriver: 'none' | 'self' | 'other'`, `mode: 'solo' | 'party'`, `boardLayout`.
- **New event** `Wall Control Released` — properties: `reason: 'manual' | 'yanked' | 'disconnect'`, `mode`, `boardLayout`.
- **Existing event** `Set Active Climb` — keep firing, but only when the user actually broadcasts. Existing 38-event/week baseline should jump to whatever the real send rate is (Vercel suggests ~33 sends per active user across 3 months).
- **Existing event** `Queue Navigation` — semantics change. After the pivot it is purely "navigating my session history", not "pushing to wall." Watch the swipe-vs-button ratio (today 95%+ swipe inside drawer).
- **Existing `Queue Operation`** — expect a dramatic drop in `setCurrentClimb` operations (today 60% of all queue ops, ~18K events / 3 months) because browsing no longer mutates. The cleaner signal that survives is the explicit lightbulb-press as the new `setCurrentClimb`.
- **Existing `Add to Queue`** — expect this to grow modestly as it gets a clearer purpose ("save for later / suggest for party") distinct from the now-explicit broadcast action. Watch the `swipe` vs `climbActions` split (today 57:43).

Update `packages/web/app/lib/queue-metrics.ts` if the operation sampling logic needs to accommodate the new events.

### Phase 5 — QA + dev-server validation

Standard project flow per CLAUDE.md:

- Write `.boardsesh/qa-notes.md` with the QA plan before starting `vp run dev`.
- Cover: solo BLE quickstart → tap → swipe → press lightbulb path; solo no-BLE state; party join → browse without consequence → take control → released-and-yanked flows; offline-and-back-online in a party.
- Run `vp check` and `vp run typecheck` before pushing.
- Open a PR with screenshots / screen recordings of the new lightbulb states.

## Background — why this design

Three months of production data (from Vercel Analytics, since PostHog only went live this week):

| Metric | 3-month total | Visitors |
|---|---:|---:|
| Climb Sent to Board Success | 79,735 | 2,419 |
| Queue Operation (sampled) | 28,795 | 4,071 |
| Session Started + Session Joined | ~1,800 | ~1,400 |
| Add to Queue | 1,492 | 494 |
| Queue Control Bar swipe + button | ~20 | ~7 |

Queue Operation breakdown (3-month, sampled):

- `setCurrentClimb` — 60% of operations, 4,000 visitors (essentially every user). Fires on every tap-to-make-active and currently auto-appends to the queue. This is the implicit-queue-building mechanism.
- `setCurrentClimbQueueItem` — 29%, 1,900 visitors. Navigating through queue history.
- `addToQueue` — 6%, 425 visitors. Explicit add.
- Long tail: `replaceQueueItem` 2%, `setQueue` 2%, `mirrorClimb` 1%.

`Add to Queue` UI events (3 months) by source: `swipe` 240, `climbActions` 183. The dedicated `queueButton` source fires zero events — likely an instrumentation gap or invisible affordance.

`Queue Navigation` UI events (PostHog week — directionally stable): 4,753 next-swipes + 1,085 previous-swipes inside the Play View drawer. 20 events combined on the Queue Control Bar arrows/swipe. 8 events on the bar's button arrows. The persistent control bar is structurally unused as an interaction surface.

Board concentration: Kilter Original 78% of sends, Kilter Homewall 17%, everything else combined 5%. Design Kilter-first; cross-board parity is a tax that returns nothing.

The 1,650-visitor gap between "queue-touching" (4,071) and "board-sending" (2,419) is the other big finding from this review. A non-trivial portion is likely users who hesitate to tap because they assume tapping commits to the wall and they're afraid of disrupting whoever is climbing. The pivot fixes this directly — browsing becomes consequence-free, so the cost of "just looking around" drops to zero.

## Code pointers (verified, may drift)

- Queue state machine + context: `packages/web/app/components/graphql-queue/QueueContext.tsx`. `setCurrentClimb` is the function at line 383; the `shouldAddToQueue: true, insertAfterCurrent: true` payload at line 397 is what makes the implicit queue an auto-history of every tap.
- Queue Control Bar UI: `packages/web/app/components/queue-control/queue-control-bar.tsx`.
- Play View Drawer (where the lightbulb action will live): `packages/web/app/components/play-view/play-view-drawer.tsx`.
- BLE send + connection: `packages/web/app/components/board-bluetooth-control/bluetooth-context.tsx`, `auto-connect-handler.tsx`, `use-board-bluetooth.ts`.
- Set Active action (becomes a synonym for "open drawer + lightbulb"): `packages/web/app/components/climb-actions/actions/set-active-action.tsx`.
- Backend party / queue state: `packages/backend/src/services/room-manager/queue-state.ts`, `room-manager.ts`, `queue-navigation.ts`.
- Analytics wrapper: `packages/web/app/lib/analytics.ts`. Queue Operation sampling: `packages/web/app/lib/queue-metrics.ts`.

## Open questions to resolve during implementation

These are intentionally not pre-decided — the implementing engineer should make the call in code review with whoever owns UX.

1. **Lightbulb hold without an output device.** Solo + no BLE: does the lightbulb auto-engage anyway so the user has something to press to trigger pairing, or does it stay off until BLE is up? Recommend: off until BLE, with a "Connect a board" affordance in its place.
2. **Disconnect of the sole BLE holder in a party.** What does the wall mirror show — last-known climb, "wall disconnected" state, or auto-fallback to next member with BLE? Recommend: last-known + a small "wall offline" indicator until someone reconnects.
3. **Hand-off notification UX.** When someone yanks control from you, what does your phone do? Recommend: a quiet toast ("Alice took the wall"), no haptic, no sound — climbing flow shouldn't have negotiation friction.
4. **Lightbulb position on the bar.** Whose avatar shows when someone else holds it? Single avatar of current driver, or none at all and just a dimmed lightbulb? Recommend: single avatar tap-to-see-party-roster.
5. **The 38-event-per-week `Set Active Climb` menu entry.** Keep, rename to "Send to board", or collapse entirely into the drawer + lightbulb flow? Recommend: keep and rename. It's a niche power-user gesture that costs nothing to maintain.

## Non-goals / explicit nos

- Do not rename "queue" in user-facing copy in this PR. Tempting, deferred. We will revisit after the pivot lands and we can see whether the lightbulb-led mental model is enough.
- Do not change the `Add to Queue` swipe gesture or menu entry. They already work and the 57:43 swipe:menu ratio suggests the gesture is the preferred path. Leave it.
- Do not pre-build a session-summary / bulk-tick surface in this PR. Phase it separately on top of the cleaner history this work produces.
- Do not change Workout Generator, Live Activity, or Onboarding in this PR. All three are downstream beneficiaries; each gets its own pivot doc.
