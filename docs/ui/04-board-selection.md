## Board Selection & Discovery

### Board Search Drawer

**Web component:** `packages/web/app/components/board-search-drawer/board-search-drawer.tsx`

**Mobile status:** Full-screen modal or pushed screen

**Layout:** Full-height bottom sheet (`100dvh`), close button visible on mobile. Three vertical sections:

1. Search bar (top, fixed)
2. Map (middle, flex: 1)
3. Results carousel (bottom, fixed height)

**Search bar:**

- `TextField` size=small, full width
- Search icon start adornment, clear button end adornment when query is non-empty
- Below input: radius info text (e.g., "Within 20 km") and loading spinner (14px) when fetching with existing results
- Border bottom: `1px solid var(--neutral-200)`

**Map (BoardSearchMap):**

- **Technology:** Leaflet with OpenStreetMap tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)
- **Default view:** lat 20, lng 0, zoom 3 (world view) until geolocation resolves
- **Geolocation:** Requests permission on first open. If granted, animates to user location at zoom 11 (~20km radius). "My location" button (bottom-right, contained, small) re-centers.
- **Markers:** Custom `divIcon` circles. Normal: 16px. Selected: 22px. Colored via CSS class.
- **Interaction:** Tap marker -> selects board, scrolls carousel card into view. Pan/zoom -> debounced viewport change (250ms) triggers new search query.
- **`data-swipe-blocked`:** Map container blocks parent drawer's swipe-to-close

**Zoom-to-radius mapping:**
| Zoom | Radius |
|------|--------|
| 3 | ~300km |
| 11 | ~20km |
| 13 | FLY_TO_ZOOM for "My location" |

**Results carousel:**

- Horizontal scroll, `scrollSnapType: 'x proximity'`, hidden scrollbar
- Cards: 280px wide, `gap: 12px`, `padding: 16px` horizontal
- `BoardCard` component per result showing board name, type, location, angle
- Selected card: `outline: 2px solid var(--color-primary)`, border-radius `themeTokens.borderRadius.lg`
- Selected card shows trailing action: Follow button + "Open" button (`OpenInNewOutlined` icon)
- Infinite scroll: loads next page when within 300px of right edge
- Loading: `CircularProgress` (20px) at end of carousel during fetch
- Empty state: centered text "No boards found" or "No results for {query}"

**Data sources:**

- `useSearchBoardsMap({ query, latitude, longitude, zoom })` -- paginated board search
- `useGeolocation()` -- browser geolocation API
- `FOLLOW_BOARD` / `UNFOLLOW_BOARD` GraphQL mutations

**User actions:**

- Type in search field to filter by name
- Clear search text
- Pan/zoom map to change search area
- Tap "My location" button to re-center on user
- Tap map marker to select board and scroll carousel
- Tap carousel card to select board and center map
- Tap "Open" on selected card to navigate to board's climb list
- Tap Follow/Unfollow button on selected card
- Swipe down to close drawer

**States:**

- Loading initial: spinner centered in carousel area
- Loading next page: spinner at right edge of carousel
- Empty results: centered empty state text
- Geolocation denied: map stays at world view, "My location" retriggers permission prompt
- Board selected: highlighted marker + outlined card + action buttons visible

**Mobile adaptation notes:**

- Replace Leaflet with `react-native-maps` (Google Maps on Android, Apple Maps on iOS)
- Markers via `<Marker>` component
- Geolocation via `expo-location`
- Carousel via horizontal `FlatList` with `snapToInterval={280 + 12}` and `decelerationRate="fast"`
- Map swipe blocking not needed -- bottom sheet handles independently

### My Boards Drawer

**Web component:** `packages/web/app/components/my-boards-drawer/my-boards-drawer.tsx`

**Mobile status:** Bottom sheet modal

**Layout:** Full-height bottom sheet, `height: 100%`, `fullHeight`. Three views managed by internal navigation state:

#### List View (default)

- **Header:** Title "My Boards", extra buttons: Search icon (opens search view), Add icon (opens create board flow)
- **Content:** Vertical list of user's boards
  - Each item: button element with board icon (`DashboardOutlined`), board name + meta string ("Kilter . Location . 40deg"), chevron right
  - Meta format: `BoardType . LocationName . Angle`
- **Empty state:** `DashboardOutlined` (48px, neutral-300) + "No boards yet" text
- **Loading state:** `CircularProgress` (32px) centered
- **Error state:** `Alert` severity=error

#### Search View

- **Header:** Back arrow + "Find a board" title
- **Search input:** `TextField` size=small, full width, auto-focus, SearchOutlined start adornment
- **Results:** `BoardSearchResults` component rendering matching boards

#### Board Detail View

- **Header:** Back arrow + "Board Details" title
- **Content:** `BoardDetailContent` component showing board info, follow button, delete option

**Data sources:**

- `useMyBoards(open)` -- fetches user's boards when drawer opens
- `useWsAuthToken()` -- WebSocket auth token for authenticated queries

**User actions:**

- Tap board -> opens Board Detail View
- Tap Search icon -> opens Search View
- Tap Add icon -> triggers `onCreateBoard` callback
- Tap back arrow -> returns to previous view
- Search boards by name
- Tap search result -> opens Board Detail View

### Board Selector Drawer (Custom Board)

**Web component:** `packages/web/app/components/board-selector-drawer/board-selector-drawer.tsx`

**Mobile status:** Bottom sheet modal

**Layout:** Bottom sheet, `height: 85dvh`. Contains cascading select form + action buttons.

**Form fields (`BoardConfigSelects`):**

1. **Board type** select: Options from `SUPPORTED_BOARDS` array (kilter, tension, etc.). Capitalized display.
2. **Layout** select: Filtered by selected board. Auto-selects first on board change.
3. **Size** select: Filtered by board+layout. Hidden for MoonBoard. Auto-selects default via `getDefaultSizeForLayout()`.
4. **Hold sets** select: Multiple selection. Filtered by board+layout+size. Auto-selects all on size change.
5. **Angle** select: Options from `ANGLES[boardName]` array. Default 40.

All selects are `FormControl` with `InputLabel` and `MuiSelect`, size=small, full width.

**Action buttons (flex row, gap 8px):**

- "Create board" (`outlined`, large, full width) -- opens nested Create Board Form drawer
- "Quick session" (`contained`, large, full width) -- saves config to IndexedDB and navigates to climb list

Both disabled until all fields are filled (`isFormComplete`).

**Auto-cascade behavior:**

- Board change -> resets layout, size, sets, auto-selects first layout
- Layout change -> resets size, sets, auto-selects default size
- Size change -> resets sets, auto-selects all available sets

**Data sources:**

- `boardConfigs` prop containing `layouts`, `sizes`, `sets` lookup maps
- `saveBoardConfig()` -- persists to IndexedDB
- `constructClimbListWithSlugs()` -- builds URL from selected configuration

---
