# Mobile Play View Roadmap

## Overview

This document tracks the multi-phase effort to bring the React Native play drawer to full parity with the web version. The web play view is the most interaction-dense surface in Boardsesh -- it combines climb browsing, queue navigation, tick logging, board rendering, and party mode into a single drawer. Porting it to mobile requires adapting every gesture, animation, and layout to native primitives while sharing as much logic as possible through the `@boardsesh/play-view` package.

Each phase is scoped to ship independently. Phase 1 delivers a usable drawer that covers the core loop (view climb, navigate queue, log tick). Later phases layer on swipe navigation, nested drawers, advanced gestures, party mode, and polish.

## Canonical Spec Reference

The authoritative design spec for the play view lives at [`docs/ui/06-play-view.md`](ui/06-play-view.md). That document defines the layout, interaction model, component hierarchy, and visual tokens for both platforms. This roadmap tracks implementation progress against that spec -- it does not redefine the design.

## Shared Package

`@boardsesh/play-view` at `packages/shared/play-view/` contains platform-agnostic logic extracted from the web implementation and consumed by both web and mobile:

- Queue navigation helpers (next, previous, jump-to-index)
- Grade display formatting (font grade, V-scale, circuit)
- Tick utility functions (attempt counting, send detection, quality mapping)
- Shared TypeScript types for climb state, drawer state, and action bar actions
- Constants (action bar button definitions, default snap points, animation durations)

## Feature Parity Table

| Feature | Web | Mobile | Shared Code | Phase |
|---|---|---|---|---|
| Play drawer (bottom sheet shell) | Done | Done | Snap points, state machine | 1 |
| Climb header (grade + name + stats) | Done | Done | Grade formatting, stat utils | 1 |
| Board renderer | Done | Done | Hold data transforms | 1 |
| Action bar (8 buttons) | Done | Done | Button definitions, action types | 1 |
| Tick FAB | Done | Done | Tick state logic | 1 |
| Queue navigation (prev/next) | Done | Done | Navigation helpers | 1 |
| Board carousel (swipe) | Done | Planned | Prefetch logic | 2 |
| Inline tick bar | Done | Planned | QuickTickBar logic | 2 |
| Wake lock | Done | Planned | -- | 2 |
| Queue drawer (nested) | Done | Planned | Queue list logic | 3 |
| Below-fold sections (logbook, similar, community) | Done | Planned | Section data types | 3 |
| Climb actions sheet | Done | Planned | Action definitions | 3 |
| Angle selector | Done | Planned | Angle range utils | 3 |
| Zoom/pan | Done | Planned | Transform math | 4 |
| Double-tap favorite | Done | Planned | Favorite toggle logic | 4 |
| Party mode (mini session bar, driver, drift) | Done | Planned | Session state types | 5 |
| BLE lightbulb integration | Done | Planned | Protocol (via @boardsesh/ble-protocol) | 5 |
| Coachmarks | Done | Planned | Coachmark definitions | 6 |
| Beta videos section | Done | Planned | Video data types | 6 |
| Analytics section | Done | Planned | Stat aggregation | 6 |

## Phase Descriptions

### Phase 1: Drawer Shell (current)

Delivers the core play loop: open a climb, see the board, navigate the queue, log a tick.

- **`@boardsesh/play-view` shared package** -- queue navigation helpers, grade display formatting, tick utilities, shared TypeScript types
- **`PlayDrawer`** -- bottom sheet component built on `@gorhom/bottom-sheet`, with collapsed/expanded snap points matching the web drawer heights
- **`PlayDrawerHeader`** -- grade pill, climb name, ascent count, and star rating, using shared grade formatting
- **`PlayDrawerActionBar`** -- 8 icon buttons matching the web action bar (favorite, share, add to playlist, mirror, rotate, angle, lightbulb, queue)
- **`PlayDrawerTickFab`** -- floating green check button anchored above the bottom sheet, triggers the tick flow
- **Navigation integration** -- climb list taps open the drawer instead of pushing a new screen; back gesture collapses or dismisses the drawer
- **Queue integration** -- previous/next buttons in the action bar cycle through the queue using shared navigation helpers

### Phase 2: Board Carousel + Tick Bar

Adds swipe-to-navigate and inline tick logging without opening a full sheet.

- **Horizontal swipe between climbs** -- `react-native-gesture-handler` `PanGestureHandler` combined with `react-native-reanimated` for 60fps transitions between queue items
- **Peek animation** -- next and previous climbs slide in from the edge during a swipe gesture, giving spatial context within the queue
- **Inline tick bar** -- collapsible bar below the board with grade picker, quality picker, tries counter, and comment field; expands on tap, collapses on submit or outside tap
- **Extract `QuickTickBar` logic into `@boardsesh/play-view`** -- grade/quality/tries state management and validation shared between web and mobile
- **Wake lock** -- `expo-keep-awake` activated while the play drawer is open, released on dismiss

### Phase 3: Queue Drawer + Below-Fold Sections

Adds queue management and deferred content sections.

- **Nested queue bottom sheet** -- second bottom sheet stacked over the play drawer, opened via the queue action bar button; dismissed by swipe-down or tap-outside
- **Queue list** -- three regions (history, current, up-next) with drag-to-reorder, swipe-to-remove, edit mode for bulk operations
- **Below-fold deferred sections** -- logbook entries, similar climbs, and community data loaded via `InteractionManager.runAfterInteractions()` to avoid blocking the initial drawer render
- **Climb actions sheet** -- action sheet triggered by long-press or the overflow button, with options: share, add to playlist, copy link, report
- **Angle selector sheet** -- bottom sheet with angle slider or segmented control, updating the board renderer and persisting the selection

### Phase 4: Advanced Interactions

Adds zoom, pan, and gesture shortcuts.

- **Zoom/pan** -- `PinchGestureHandler` and `PanGestureHandler` composed with reanimated shared values for smooth scale and translate transforms on the board renderer
- **Double-tap favorite** -- `TapGestureHandler` with `numberOfTaps={2}` triggers a favorite toggle with a heart burst animation (reanimated scale + opacity sequence)
- **Floating zoom reset button** -- appears when zoom level exceeds 1x, taps animate back to default scale and origin

### Phase 5: Party Mode

Adds real-time collaborative climbing sessions.

- **Mini session bar** -- persistent bar above the play drawer showing connected users, driver name, and session status
- **Driver state and lightbulb behavior** -- driver controls which climb is displayed and sends lightbulb commands; non-drivers see the driver's selection in real time
- **Drift state** -- non-driver users can browse ahead in the queue without affecting the session; a "return to session" button snaps back to the driver's current climb
- **Wall-confirm watcher** -- listens for wall-confirm events from the board hardware and advances the session state
- **BLE lightbulb** -- connect to the board via `@boardsesh/ble-protocol`, take control of the LEDs, release control on disconnect or session end

### Phase 6: Polish

Final pass for discoverability, feedback, and extended content.

- **Coachmarks** -- first-use hints for the lightbulb button, zoom gesture, and swipe navigation; shown once per user, persisted via `expo-secure-store`
- **Haptic feedback** -- `expo-haptics` triggered on tick submit, favorite toggle, queue navigation, swipe thresholds, and zoom reset
- **Beta videos section** -- below-fold section showing user-submitted beta videos for the current climb
- **Analytics section** -- below-fold section with personal stats (attempts, sends, grade progression) and crew logbook entries for the current climb

## Platform Adaptation Notes

Key substitutions when translating web patterns to React Native:

| Web | Mobile | Notes |
|---|---|---|
| `SwipeableDrawer` (MUI) | `@gorhom/bottom-sheet` | Native bottom sheet with snap points, gesture-driven open/close |
| `react-swipeable` | `react-native-gesture-handler` | `PanGestureHandler` for horizontal swipe between climbs |
| CSS transitions / `@keyframes` | `react-native-reanimated` | Shared values and `useAnimatedStyle` for 60fps animations on the UI thread |
| `@use-gesture/react` (pinch/pan) | `PinchGestureHandler` + `PanGestureHandler` | Composed gesture handlers with reanimated for zoom/pan transforms |
| Web Wake Lock API | `expo-keep-awake` | `activateKeepAwakeAsync()` while the drawer is open |
| URL sync (search params) | Expo Router navigation state | Drawer state lives in component state, not the URL; deep links open the drawer via route params |
| `startTransition` (React) | `InteractionManager.runAfterInteractions()` | Defers below-fold section rendering until the drawer animation completes |
