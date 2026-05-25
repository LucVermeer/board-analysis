## Onboarding Tour

### Tour Architecture

The onboarding tour is a 15-step guided overlay managed by three key modules:

- **`OnboardingTourProvider`** (`onboarding-tour-provider.tsx`): React context managing tour state, step transitions, analytics, and side effects.
- **`OnboardingTourOverlay`** (`onboarding-tour-overlay.tsx`): Visual overlay rendering step content, anchoring to UI elements.
- **`onboarding-tour-steps.ts`**: Static step definitions with route matching, anchor selectors, advance triggers, and side effects.

### Tour Steps

| #   | ID                        | Route     | Anchor                                                 | Title                             | Advance Trigger                                        | Side Effects                                     |
| --- | ------------------------- | --------- | ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| 1   | `home-intro`              | `/`       | None (centred)                                         | "Let's get you climbing"          | `next` (button)                                        | --                                               |
| 2   | `home-pick-board`         | `/`       | None                                                   | "Pick a board to start your sesh" | `route-change`                                         | Enter: opens Start Sesh drawer                   |
| 3   | `climb-list-grid-view`    | `/*/list` | `#onboarding-view-mode-grid`                           | "Two ways to browse"              | `view-mode-grid`                                       | --                                               |
| 4   | `climb-list-back-to-list` | `/*/list` | `#onboarding-view-mode-list`                           | "Back to list view"               | `view-mode-list`                                       | --                                               |
| 5   | `climb-list`              | `/*/list` | `#onboarding-climb-card-2` or `#onboarding-climb-card` | "Your wall, your climbs"          | `current-climb-set` (via `TOUR_CLIMB_LIST_PICK_EVENT`) | --                                               |
| 6   | `queue-add`               | `/*/list` | `#onboarding-climb-card` or `#onboarding-climb-card-2` | "Queue one up"                    | `queue-added`                                          | Enter: replays swipe hint animation              |
| 7   | `queue-bar`               | `/*/list` | `#onboarding-queue-bar`                                | "This is your current climb"      | `current-climb-set` (via `notifyCurrentClimb`)         | --                                               |
| 8   | `queue-thumbnail`         | `/*/list` | Climb thumbnail `[data-testid="climb-thumbnail"]`      | "Tap a thumbnail"                 | `play-drawer-open` (via `PLAY_DRAWER_EVENT`)           | --                                               |
| 9   | `play-view`               | `/*/list` | None (banner)                                          | "Everything for this climb"       | `next` (button)                                        | --                                               |
| 10  | `play-queue`              | `/*/list` | None (banner)                                          | "One queue for the whole crew"    | `next` (button)                                        | Enter: opens play queue; Exit: closes play queue |
| 11  | `queue-bar-reopen`        | `/*/list` | `#onboarding-queue-bar`                                | "Jump back anytime"               | `next` (button)                                        | Enter: closes play view                          |
| 12  | `session-mini-bar`        | `/*/list` | `[data-tour-anchor="session-mini-bar"]`                | "Open your session"               | `next` (button)                                        | --                                               |
| 13  | `sesh-invite`             | `/*/list` | None (banner)                                          | "Invite your crew"                | `next` (button)                                        | Enter: opens dummy sesh drawer                   |
| 14  | `sesh-activity`           | `/*/list` | None (banner)                                          | "Every ascent, logged"            | `next` (button)                                        | --                                               |
| 15  | `sesh-analytics`          | `/*/list` | None (banner)                                          | "See how the night went"          | `finish` (button)                                      | Exit: closes dummy sesh drawer                   |

### Overlay Rendering

Three visual modes based on step configuration:

**1. Intro dialog (step 1):**

- Full-screen semi-transparent scrim (`introScrim`: fixed, inset 0, z-index 1999, `var(--overlay-dark)` background).
- Centred `Paper` (`introPaper`): fixed, 50%/50% transform, z-index 2000, max-width 420px, min-width 280px, border-radius `var(--border-radius-xl)`.
- `role="dialog"`, `aria-modal="true"`.
- Focus trap via Tab key handler (wraps focus between first/last focusable elements).
- Autofocuses the primary button on open via `requestAnimationFrame`.
- Escape key skips the tour.

**2. Anchored overlay (steps with anchor elements):**

- Cutout box: fixed-position `Box` with 2px primary-colour border, 6px padding around the anchor element, `box-shadow: 0 0 0 9999px var(--overlay-dark)` creating the spotlight effect. z-index 1300. Transition: `all 160ms ease`.
- MUI `Popper` anchored to the element, z-index 1301, with offset [0, 14], preventOverflow padding 12, flip fallback placements.
- Content in an elevated `Paper` (elevation 8) with the step's configured `placement` (top/bottom/left/right, default bottom).
- Anchor element is scrolled into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`).

**3. Banner (non-anchored steps on board routes):**

- Fixed top banner: `bannerPaper`, centred horizontally, top offset `max(var(--spacing-6), env(safe-area-inset-top))`.
- z-index 2000, width `calc(100% - 2 * var(--spacing-4))`, max-width 420px.
- Used for steps that narrate open drawers where an anchor would overlap.

**Overlay content (all modes):**

- Title: `font-size-lg`, weight 600, margin-bottom `spacing-2`.
- Body: `font-size-sm`, line-height 1.55, colour `neutral-500`, margin-bottom `spacing-5`.
- Footer: flex row, space-between. Left: step counter "N of 15" (`font-size-xs`, `neutral-400`). Right: "Skip tour" underlined text button + primary "Next"/"Finish" `Button` (contained, small).
- Primary button is hidden for event-driven steps (`primaryLabel: null`).

### Anchor Resolution

`useAnchorElement(selectors, active)`:

- Polls the DOM for anchor elements every 100ms for up to 2s (`ANCHOR_POLL_DURATION_MS`).
- Uses `document.querySelector` against the step's `anchorSelectors` array (first match wins).
- After resolution, scroll/resize listeners keep the reference current.
- No document-wide MutationObserver runs during the tour.

`useAnchorRect(anchor)`:

- Tracks the anchor's `getBoundingClientRect()` via `requestAnimationFrame`.
- Updates on scroll, resize, and element resize (via `ResizeObserver`).

### State Management

**Tour provider (`OnboardingTourProvider`):**

- State persisted in IndexedDB per user via `getTourProgress` / `saveTourProgress`.
- Hydrates on mount but does NOT auto-show (only restores `currentStepId` for potential resume).
- `start()`: always restarts from step 1, clearing any persisted progress. Fires cleanup side effects for any previously-open tour drawers.
- `next()`: advances to the next step, running exit/enter side effects. On the last step, calls `complete()`.
- `skip()`: runs the current step's exit effect, clears progress, saves onboarding status.
- `complete()`: same as skip, plus fires "Onboarding Tour Completed" analytics with duration.

**Event-driven advances:**

- `notifyQueueLength(length)`: advances `queue-add` when queue length increases.
- `notifyCurrentClimb(climbUuid)`: advances `queue-bar` when a new climb is set. Uses a 1.5-second grace period (`CURRENT_CLIMB_GRACE_MS`) so the user sees the step copy before advancing.
- `notifyViewMode(mode)`: advances `climb-list-grid-view` when mode switches to grid, `climb-list-back-to-list` when mode switches to list. Also uses the grace period.
- `TOUR_CLIMB_LIST_PICK_EVENT`: custom window event fired by `ClimbsList` when the user explicitly taps a climb. Advances `climb-list` step. Separate from `notifyCurrentClimb` because async queue hydration can change the active climb without user interaction.
- `PLAY_DRAWER_EVENT`: advances `queue-thumbnail` to `play-view` when the play drawer opens.
- Route change detection: `useEffect` on `pathname` advances `home-pick-board` to `climb-list-grid-view` when the path matches a board list route.

**Side effects (dispatched via window `CustomEvent`):**

| Effect                         | Event                         | Purpose                                                  |
| ------------------------------ | ----------------------------- | -------------------------------------------------------- |
| `open-start-sesh`              | `onboarding:open-start-sesh`  | Opens the Start Session drawer                           |
| `open-dummy-sesh`              | `onboarding:open-dummy-sesh`  | Opens the Sesh Settings drawer with mock data            |
| `close-dummy-sesh`             | `onboarding:close-dummy-sesh` | Closes the mock session drawer                           |
| `open-play-queue`              | `onboarding:open-play-queue`  | Opens the play view queue section                        |
| `close-play-queue`             | `onboarding:close-play-queue` | Closes the play view queue section                       |
| `close-play-view`              | `onboarding:close-play-view`  | Closes the play view drawer                              |
| `replay-climb-list-swipe-hint` | (direct call)                 | Replays the swipe hint animation on the first climb card |

**Mock session data (`mock-session-detail.ts`):**

The tour uses a pre-built `SessionDetail` with:

- Session name: "Thursday crew night", goal: "Project the V6 crux".
- 4 mock participants: Alex (7 sends, 2 flashes), Priya (5 sends, 3 flashes), Jordan (4 sends), Sam (2 sends).
- 19 mock ticks across grades V3-V7, with realistic climb names.
- Grade distribution: V3 (3), V4 (4), V5 (5), V6 (4), V7 (1).
- Duration: 90 minutes.
- QR code shows `boardsesh:onboarding-tour-preview` (non-navigable).

### Mobile Adaptation

- Replace `Popper` with a React Native equivalent (e.g., `react-native-walkthrough-tooltip` or custom positioned `View`).
- The cutout spotlight can be achieved with `react-native-svg` masks or `react-native-hole-view`.
- Step content renders in a floating `Card` component positioned relative to the anchor.
- Swipe hint animation uses `react-native-reanimated` spring animations.
- Progress persistence uses `expo-secure-store` or `AsyncStorage` instead of IndexedDB.
- Tour events use a simple event emitter (e.g., `eventemitter3`) instead of window `CustomEvent`.

---
