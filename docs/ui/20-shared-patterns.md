## Shared UI Patterns

### Empty States

Empty states use contextual, climbing-specific language. Never "No data available." Examples from the codebase:

- Session with no climbs: "No climbs yet" (`detail.noClimbsYet`).
- Analytics section: "Log some climbs" (`detail.logSomeClimbs`).
- Anonymous user prompts: "Sign in to like climbs" with a description of what they gain.
- Session not found: title "Session not found" + subtitle text.

Each empty state includes a CTA when actionable: "Sign in for more" button, "Take the tour" card, etc. CTAs use active verbs.

**Mobile adaptation:** Same copy, rendered with React Native `Text` components. CTAs become `TouchableOpacity` or `Pressable` with the same labels.

### Loading States

**Skeleton screens:**

- Grade chips: `Skeleton variant="rounded"` at specific dimensions (80x32 for grade chips, 40x24 for small badges).
- Grade labels in distribution: `Skeleton variant="text"` width 40, matching `fontSize: '0.875rem'`.
- Used wherever formatted grade data depends on async grade format loading (`useGradeFormat().loaded`).

**Circular progress spinners:**

- Button mutations: `CircularProgress size={16}` as `startIcon`, button disabled during pending state.
- Full-page loading: `CircularProgress size={48}` centred in viewport (join redirect page).
- Drawer content loading: `CircularProgress size={28}` centred with `py: 4`.

**Alert fallbacks:**

- Network errors: `Alert severity="warning"` with i18n message (e.g., `settings.loadFailed`).

### Confirmation Dialogs

**Destructive confirmations (`ConfirmPopover`):**

- Used for tick deletion: title "Delete ascent", description "Delete ascent confirm", OK button with `color: 'error'`.
- Renders as a popover attached to the trigger element (delete icon button).
- OK text and button props are customisable.

**Non-destructive confirmations:**

- Simple `Dialog` with cancel/confirm buttons (e.g., session creation dialog).

**HealthKit save states:**

- Button label cycles through: "Save to Apple Health" -> "Saving..." (disabled) -> "Saved" (disabled) -> "Retry" on error.

### Infinite Scroll

**Implementation (`useInfiniteScroll` hook + sentinel):**

- A sentinel `Box` element at the bottom of the list is observed via `IntersectionObserver`.
- When the sentinel enters the viewport and `hasMore` is true, `onLoadMore` / `fetchNextPage` is called.
- Loading state: shows additional content (e.g., skeleton rows) while fetching.
- End message: configurable, hidden when `hideEndMessage` is true.
- Grid mode uses the sentinel observer; list mode uses the virtualizer's range change callback.

### Virtualized Lists

**Web implementation (`@tanstack/react-virtual`):**

- `QueueList` uses `useVirtualizer` with a flat discriminated union of row types:
  - `history-show-all`: 44px
  - `history-item` / `current-item` / `future-item`: 102px
  - `history-divider`: 17px
  - `suggestion-header`: 36px
  - `loading`: 220px
  - `end-message`: 52px
- `overscan: 10` items for smooth scrolling.
- `getItemKey` returns stable keys based on row type and item UUID.
- Scroll container passed as prop (`scrollContainer`).

**Mobile equivalent:** `@shopify/flash-list` with `estimatedItemSize` matching the web's default item height (102px). Use `renderItem` with the same row-type discrimination.

### Swipe Actions on List Items

**Hook: `useSwipeActions` (from `react-swipeable`):**

- `swipeThreshold`: 100px default to trigger action.
- `maxSwipe`: 120px default maximum distance.
- `maxSwipeLeft` / `maxSwipeRight`: per-direction overrides.
- `longSwipeLeftThreshold` / `longSwipeRightThreshold`: optional secondary threshold for extended swipe actions.
- `confirmationPeekOffset`: 76px (`DEFAULT_CONFIRMATION_PEEK_OFFSET`) -- how far content peeks after confirming.
- `CONFIRMATION_DISPLAY_MS`: 600ms -- how long the confirmation checkmark is visible before snap-back.
- `onSwipeZoneChange`: fires during gesture when crossing thresholds (zones: `none`, `left-short`, `left-long`, `right-short`, `right-long`).

**`ClimbListItem` swipe actions:**

- Left swipe (default): add to queue (`onAddToQueue` callback).
- Left swipe extended: opens more actions menu.
- Right swipe: toggle favourite (`onSwipeRight` callback).
- Action layers are positioned behind the content with opacity updated via direct DOM manipulation during the gesture for performance.
- Swipe is disabled in edit mode or when `disableSwipe` is true.

**Mobile adaptation:** Use `react-native-gesture-handler` `Swipeable` component or `react-native-reanimated` for the gesture. Thresholds and distances map directly.

### Toast/Snackbar Notifications

**`useSnackbar` hook from `snackbar-provider`:**

- `showMessage(message, severity)` where severity is `'success' | 'warning' | 'error' | 'info'`.
- Used for all mutation feedback:
  - Session started: `'success'`.
  - Share link copied: `'success'`.
  - Session creation failed: `'error'`.
  - Queue generation partial: `'warning'`.
  - BLE errors: `'error'` or `'warning'`.
- Auto-dismiss after approximately 3 seconds (MUI Snackbar default).
- Position: bottom of screen.

**Mobile adaptation:** Use `react-native-toast-message` or `burnt` (native iOS toasts). Position above the tab bar.

### Pull-to-Close on Bottom Sheets

**`SwipeableDrawer` + `useDrawerDragResize`:**

- Drag handle rendered via `drawerCss.dragHeaderWrapper` -- a div with `data-swipe-blocked=""` attribute and spread `dragHandlers`.
- `useDrawerDragResize` hook manages drawer height transitions:
  - `initialHeight`: starting height (e.g., `'60%'`, `'100%'`).
  - `expandedHeight`: height when expanded.
  - `onClose`: callback when dragged below threshold.
  - Returns `paperRef` (ref for the drawer paper element) and `dragHandlers` (touch/pointer event handlers).
- Drawer paper transitions use `height 0.3s cubic-bezier(0.4, 0, 0.2, 1)`.

**Mobile adaptation:** Use `@gorhom/bottom-sheet` with `enablePanDownToClose`. The drag handle is a standard 4px rounded bar. Snap points replace the fixed height percentages.

### Grade Tint Colours

**`getGradeTintColor(grade, variant, isDark)` function:**

- Produces dynamic background colours based on climb difficulty grade.
- Used for:
  - Queue control bar background tint.
  - Climb card selected/active state.
  - Badge backgrounds.
  - Grade distribution bar colours (via `getGradeColor` / `getVividGradeColor`).
  - Hardest climb chip in session summary.

**Mobile adaptation:** Same colour function, applied via React Native `style` prop `backgroundColor`.

### Double-Tap Interactions

**`useDoubleTapFavorite` hook:**

- Instagram-style: double-tap only adds a like, never removes.
- Returns `handleDoubleTap`, `showHeart`, `dismissHeart`, `isFavorited`, `toggleFavorite`.
- If not authenticated, opens the auth modal with "Sign in to like climbs" prompt.
- Always shows the heart animation overlay on double-tap, even if already favourited.
- Uses ref (`isFavoritedRef`) to read current favourite state at call time without re-creating the callback.
- Callers wire `handleDoubleTap` to their own double-tap detection (e.g., `onDoubleTap` prop on `SwipeBoardCarousel`, `onCoverDoubleClick` on `ClimbCard`).

**Mobile adaptation:** Use `react-native-gesture-handler` `TapGestureHandler` with `numberOfTaps={2}`. Heart animation via `react-native-reanimated` scale + opacity spring.

### Confirm Popover

**`ConfirmPopover` component:**

- Wraps a trigger element (e.g., delete button).
- Shows a popover with title, description, and OK/Cancel buttons.
- OK button props (colour, variant) are customisable.
- Used for destructive actions like deleting an ascent from a session.

**Mobile adaptation:** Replace with an `Alert.alert()` confirmation dialog or a custom bottom sheet confirmation.
