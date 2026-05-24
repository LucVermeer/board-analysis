# Boardsesh Web App UI Specification for React Native Rewrite

## Purpose

This document is the single source of truth for agents building the React Native app. Every screen, interaction, and data flow from the web app is documented here so agents can validate their mobile implementations against the exact behavior of the production web application.

## How to Use

Look up any screen by name. Each section includes layout, user actions, data sources, states, and navigation. Follow the documented behavior exactly -- do not invent new patterns. When the web app uses a web-specific technology (CSS Grid, MUI components, browser APIs), the corresponding React Native adaptation is noted under **Mobile adaptation notes**.

## Web-to-Mobile Component Mapping

| Web Component | React Native Equivalent | Notes |
|---|---|---|
| MUI `Button` / `IconButton` | RN `Pressable` with theme styling | Use `hitSlop` for small targets. Match active/disabled opacity from theme tokens. |
| MUI `TextField` | RN `TextInput` | White background in dark mode (matches web's `darkTokens.semantic.inputSurface`). |
| MUI `Dialog` | `@gorhom/bottom-sheet` `BottomSheetModal` | All web dialogs are already bottom-sheet drawers; map 1:1. |
| MUI `Drawer` / `SwipeableDrawer` | `@gorhom/bottom-sheet` `BottomSheetModal` | Swipe-to-dismiss, drag handle, backdrop tap to close. |
| MUI `Snackbar` | Toast notification system | Use `react-native-toast-message` or equivalent. Auto-dismiss after 4000ms default. |
| MUI `Avatar` | Custom `Avatar` component with fallback initials | Circle with image or two-letter initials. |
| MUI `Chip` / `Badge` | Custom `Badge` component | Pill-shaped for chips, dot or count for badges. |
| CSS Grid / Flexbox | RN Flexbox (no CSS Grid in RN) | All grid layouts must be converted to nested flex containers. |
| `@tanstack/react-virtual` | `@shopify/flash-list` | Virtual list with `estimatedItemSize`. List mode uses 107px estimate. |
| Next.js App Router | Expo Router file-based routing | `packages/mobile/app/` directory mirrors web route structure. |
| IndexedDB | `expo-secure-store` (credentials) + `AsyncStorage` (preferences) | Secure store for tokens; AsyncStorage for view mode, last-used board, etc. |
| Web Bluetooth API | `react-native-ble-plx` | Direct BLE access on native. No Bluefy workaround needed. |
| CSS media queries | Platform-specific code + `Dimensions` API | Use `Platform.select()` and `useWindowDimensions()`. |
| SVG (`react-svg`) | `react-native-svg` | Board renderer, hold overlays, climb thumbnails. |
| Infinite scroll sentinel (`IntersectionObserver`) | `onEndReached` on FlashList/FlatList | Set `onEndReachedThreshold` to 0.5 (roughly 5 items before end). |
| MUI `Tabs` | Custom segmented control or `react-native-pager-view` | Swipeable tab views for login/register. |
| MUI `Select` / `MenuItem` | `@react-native-picker/picker` or custom bottom-sheet picker | Board config selects, angle selector. |
| MUI `Switch` | RN `Switch` | Draft toggle, heatmap toggle, filter switches. |
| MUI `Slider` | `@react-native-community/slider` | Grade range picker (if slider variant used). |
| MUI `Popover` | `@gorhom/bottom-sheet` or custom positioned view | Hold type picker anchored to tapped hold. |
| MUI `Accordion` / `CollapsibleSection` | Custom animated collapsible with `react-native-reanimated` | Search filters, climb detail sections. |
| `next/image` | RN `Image` with `expo-image` for caching | Use `expo-image` for optimized loading and caching. |
| Leaflet map | `react-native-maps` | Board search map with markers. |
| CSS `backdrop-filter: blur()` | `expo-blur` `BlurView` | Tab bar frosted glass effect. |
| `react-i18next` `useTranslation` | Mobile i18n provider at `packages/mobile/src/providers/i18n-provider.tsx` | Same catalog structure, different provider. |

---

## Navigation Architecture

### Bottom Tab Bar

**Web component:** `packages/web/app/components/bottom-tab-bar/bottom-tab-bar.tsx`

**Mobile status:** Map to Expo Router tab layout at `packages/mobile/app/(tabs)/`

**Layout:**
The bottom tab bar is fixed at the bottom of the screen. On mobile it spans edge-to-edge with safe area padding at the bottom. On desktop it constrains to `maxWidth: 480px` centered.

There are **5 tabs** (the web has a 6th "Create" tab but it is between Discover and You):

| Tab | Label | Icon | Value | Destination |
|---|---|---|---|---|
| Home | `bottomTabBar.home` | `HomeOutlined` (20px) | `home` | `/` |
| Climbs | `bottomTabBar.climb` | `FormatListBulletedOutlined` (20px) | `climbs` | Last-used board's `/list` URL, or opens Board Selector Drawer if no board context |
| Discover | `bottomTabBar.discover` | `LocalOfferOutlined` (20px) | `library` | `/playlists` or `/discover/` path |
| Feed | `bottomTabBar.feed` | `DynamicFeedOutlined` (20px) | `feed` | `/feed` |
| Create | `bottomTabBar.create` | `AddOutlined` (20px) | `create` | Last-used board's `/create` URL, or opens Board Selector Drawer if no board context |
| You | `bottomTabBar.you` | `PersonOutlined` (20px) | `you` | `/you` (auth-gated: opens auth modal if not authenticated) |

**Active/Inactive states:**
- Inactive: `color: var(--neutral-400)` (gray)
- Active: `color: themeTokens.colors.primary` (brand rose/red)
- No ripple effect: `WebkitTapHighlightColor: transparent`

**Background:**
- Light mode: `rgba(255, 255, 255, 0.3)` with `backdrop-filter: blur(5px)`
- Dark mode: `rgba(26, 26, 26, 0.7)` with `backdrop-filter: blur(20px)`
- Border radius: `themeTokens.borderRadius.xl` (16px) on all corners
- In native/Capacitor mode: 0px border radius, edge-to-edge

**Safe area handling:**
- Bottom padding: `var(--safe-area-inset-bottom)` via CSS env()
- On iOS Safari: extends below the wrapper with negative margin to cover the home indicator zone
- In native: safe area handled by platform

**Tab behavior details:**
- **Climbs tab**: If board context exists (from active session or current page), navigates directly to that board's list URL. If no context, asynchronously checks IndexedDB for last-used board (`getLastUsedBoard()`). If found, navigates there. If not found, opens `BoardSelectorDrawer` (Board Discovery Scroll with popular configs, user boards, and custom board option).
- **Create tab**: Same fallback logic as Climbs tab but navigates to the `/create` variant of the URL. Opens Board Selector Drawer with `isCreateClimbFlow=true` when no board context.
- **You tab**: If `sessionStatus !== 'loading'` and user is not authenticated, prevents navigation and opens auth modal with title `bottomTabBar.youSignInTitle` and description `bottomTabBar.youSignInDescription`. On auth success, navigates to `/you`.

**Mobile adaptation notes:**
- Map to Expo Router `(tabs)` layout with `<Tabs>` component
- Use `expo-blur` `BlurView` for frosted glass background
- Safe area handled by `react-native-safe-area-context`
- Tab icons from `@expo/vector-icons` MaterialIcons set
- Active session context from shared queue provider

### Header Patterns

**Web component:** `packages/web/app/components/global-header/global-header.tsx`

The global header is `position: fixed` at the top with `z-index: 10`. It has different configurations per route:

#### Search Header (default on board list pages)

**Layout:** `height: var(--global-header-height)`, `padding: 0 16px`, `gap: 12px`, flex row.
- **Left:** User avatar (UserDrawer component) -- tappable, opens profile/settings drawer
- **Center:** Search `TextField` -- takes `flex: 1`. On list pages: editable with live `nameFilter` binding. On non-list pages: read-only, tapping opens `UnifiedSearchDrawer`.
  - Start adornment: `SearchOutlined` (18px)
  - End adornment (when name filter active): Clear button `ClearOutlined` (16px)
  - Input font size: 14px, padding: `6px 0`
  - Placeholder: `header.searchClimbsPlaceholder` on list pages, `header.searchPlaceholder` elsewhere
- **Right:** Filter button (`FilterListOutlined`) on list pages only. Has active indicator dot (8px circle, `var(--color-primary)`, absolute positioned top-right). Notification bell (`NotificationsOutlined`) with unread count badge (red, max 99).

**Background:**
- Light: `linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.6))` with `blur(12px)`, bottom border `rgba(0,0,0,0.06)`
- Dark: `linear-gradient(to bottom, rgba(26,26,26,0.85), rgba(26,26,26,0.6))` with `blur(20px)`, bottom border `rgba(255,255,255,0.08)`
- Dark mode search input: white background, black text (intentional per design guidelines)

#### Profile/You Header (centered title pattern)

**Layout:** 3-column CSS grid: `minmax(48px, 1fr) auto minmax(48px, 1fr)`
- **Left:** UserDrawer avatar + Settings gear icon (`SettingsOutlined`)
- **Center:** Title text (`Typography h6`, max-width `min(60vw, 320px)`, centered, ellipsis overflow). Title is "You" on `/you`.
- **Right:** Stats filter button (`TuneOutlined`, with active dot indicator), Share button (`IosShareOutlined`), Notification bell

#### Profile View Header (other user's profile)

- **Left:** Back button (chevron left)
- **Center:** "Profile" title (or child page title: "Statistics", "Sessions", "Created Climbs")
- **Right:** Stats filter button (when active), Share button (on root profile page)

#### Home Page Header (transparent)

- Transparent background, no border, `pointer-events: none` on container, `pointer-events: auto` on children
- Only renders the UserDrawer avatar

#### Create Page Header

- Hidden entirely (`return null` when `isBoardCreatePath(pathname)`)

**Mobile adaptation notes:**
- Use `react-native-safe-area-context` for `paddingTop`
- `BlurView` for frosted glass effect
- Navigation header can be configured per-screen in Expo Router stack options
- Search bar: custom `TextInput` component in header

### Drawer/Sheet System

**Web component:** `packages/web/app/components/swipeable-drawer/swipeable-drawer.tsx`

All modals in the app use `SwipeableDrawer` (wrapping MUI's `MuiSwipeableDrawer`). Properties:

**Placement:** `bottom` (most common), `top` (search drawer), `left`, `right`

**Drag handle:**
- Horizontal (top/bottom): 36px wide, 4px tall, `border-radius: 2px`, color `var(--neutral-300, #d9d9d9)`, 12px padding zone
- Vertical (left/right): 4px wide, 36px tall, absolute positioned
- Mobile: drag handle visible. Desktop (768px+): drag handle hidden, close button shown instead.
- Close button: `CloseOutlined` icon, absolute positioned (top: 8px, side: 8px depending on placement), `backgroundColor: 'action.selected'`

**Swipe-to-close:**
- Custom momentum animation: calculates remaining distance, uses `cubic-bezier(0.0, 0, 0.2, 1)` easing
- Duration: proportional to remaining distance, range 120ms--300ms, base speed: full distance in 300ms
- Blocks swipe when touch originates inside `[data-swipe-blocked]` zones (e.g., map, zoomed board)

**Nested drawer stacking:** Drawers can nest via `disablePortal`. Parent drawer's swipe is blocked when touch starts inside a child drawer's Paper element (detected via `[data-swipeable-drawer]` data attribute).

**Backdrop:** Semi-transparent overlay. Click to close (unless `disableBackdropClick`). Custom mask color configurable via `styles.mask`.

**Transition callbacks:** `onTransitionEnd(open: boolean)` fires after slide animation completes. Used for unmount-after-close pattern to avoid keeping heavy drawer subtrees in the React tree.

**Common heights:**
- Default: auto (content-sized)
- Full height: `100dvh` or `100%` (board search, my boards)
- 85% height: `85dvh` (board selector)
- 80% height: `80vh` (unified search non-climb mode)
- 70% max: `maxHeight: 70vh` (playlist selector)
- 60%: `60%` (climb actions)

**Mobile adaptation notes:**
- Map directly to `@gorhom/bottom-sheet` `BottomSheetModal`
- `snapPoints` replaces fixed heights
- `handleIndicatorStyle` for drag handle styling
- `backdropComponent` for backdrop
- `enablePanDownToClose` for swipe dismiss
- Nested stacking via multiple `BottomSheetModalProvider` or sequential presentation

### Deep Linking

**URL structure:** `/b/[board_slug]/[angle]/...` (new slug-based routes) and legacy `/{board_name}/{layout_id}/{size_id}/{set_ids}/{angle}/...`

Maps to Expo Router stack navigation:
```
(tabs)/
  index.tsx              -> /
  feed.tsx               -> /feed
  you/
    index.tsx            -> /you
    ...
(board)/
  [board_slug]/
    [angle]/
      list.tsx           -> /b/{slug}/{angle}/list
      create.tsx         -> /b/{slug}/{angle}/create
      view/[uuid].tsx    -> /b/{slug}/{angle}/view/{uuid}
auth/
  login.tsx              -> /auth/login
  ...
```

### Auth Gating

- `/you/*` routes require authentication
- On web: server-side redirect to `/` if not authenticated
- Tab bar intercepts: You tab shows auth modal before navigation if `sessionStatus !== 'loading'` and not authenticated
- Create tab: opens auth modal when saving if not authenticated (form is accessible without auth)
- Queue actions (add to queue, create session): require auth via `openAuthModal`

---

## Home / Landing

### Home Page

**Web route:** `/`

**Mobile status:** Tab screen `(tabs)/index.tsx`

**Layout:** Full-height scrollable page. No global header (transparent, avatar-only). Bottom tab bar visible.

**Data sources:**
- `getAllBoardConfigs()` -- server-fetched board configuration data (layouts, sizes, sets per board type)
- `getPopularBoardConfigs()` -- server-fetched popular board configurations
- `getRecentBetaLinks()` -- server-fetched recent beta video links
- `useSession()` -- NextAuth session for auth state

**Sections (top to bottom):**

#### 1. Hero Section
- **Logo:** Boardsesh logo component
- **Title:** "Get on the board!" (i18n key: `marketing:home.hero.title`)
- **Subtitle:** About tracking sends and managing boards
- **CTA Button:**
  - If active session exists: "Continue climbing" -- navigates to active session's board
  - If no active session: "Start climbing" -- opens Start Sesh Drawer (session creation flow)
  - Button variant: `contained`, icon: `PlayArrowRounded`

#### 2. Board Discovery Section
- **Component:** `BoardDiscoveryScroll` -- horizontal scrolling cards
- **Cards (in order):**
  1. "Find nearby" card -- opens Board Search Drawer (map-based search)
  2. "My boards" card (if authenticated) -- opens My Boards Drawer
  3. Popular configs (Kilter Original 12x12 40deg, Tension Original 8x10 40deg, MoonBoard defaults, etc.) -- each card navigates to that board's climb list
  4. "Custom board" card -- opens Board Selector Drawer (cascading select form)
- **Card appearance:** Horizontal scroll, snap-to-card, hidden scrollbar. Each card ~280px wide. Tap a board card to navigate to its climb list URL.

#### 3. Recent Beta Videos Section
- **Component:** `HomeRecentBetaSection`
- **Layout:** Horizontal carousel of community beta videos
- **Data:** `initialRecentBeta` from `getRecentBetaLinks()` -- Instagram/TikTok embed URLs with thumbnails
- **Card:** Video thumbnail, climb name, board type badge

#### 4. Onboarding Card Stack
- **Cards** with categorized accent colors (action/rose, social/purple, help/slate):
  - **Install app** (platform-dependent): iOS App Store link, Android Play Store link, or hidden if already in native app. Detected via `isNativeApp()` / UA sniffing for Capacitor WebView.
  - **Take the tour** (accent: action) -- starts onboarding tour
  - **Aurora migration** (accent: action) -- navigates to `/aurora-migration` for importing data from official Aurora Climbing app
  - **Build a playlist** (accent: action) -- navigates to playlist creation
  - **Connect board** (accent: help) -- navigates to Bluetooth connection flow
  - **Find your crew** (accent: social) -- opens unified search drawer filtered to users
  - **Join Discord** (accent: social) -- opens external Discord invite link
- **Card component (`OnboardingCard`):** 
  - Layout: flex row, 44x44px icon chip with accent-tinted background, title (semibold) + description (body2, neutral-500)
  - Card variant: outlined, border `1px solid var(--neutral-200)`, border-radius `themeTokens.borderRadius.lg` (12px)
  - Hover: border darkens to neutral-300, shadow `themeTokens.shadows.sm`

#### 5. Feed Callout (authenticated only)
- "Your friends are climbing. See the feed" with CTA button navigating to `/feed`

**Dynamic drawers (mounted on demand):**
- `StartSeshDrawer` -- session creation (lazy loaded via `dynamic()`)
- `UnifiedSearchDrawer` -- multi-category search (lazy loaded)
- `BoardSelectorDrawer` -- custom board config (lazy loaded)

**States:**
- Loading: Skeleton placeholders for install card and board discovery
- Authenticated vs anonymous: affects "My boards" card visibility, feed callout, install card
- Active session: changes hero CTA from "Start climbing" to "Continue climbing"

**Navigation:**
- Hero CTA -> Start Sesh Drawer or active session's board page
- Board cards -> `/b/{slug}/{angle}/list`
- Beta videos -> video playback or climb detail
- Onboarding cards -> respective destinations
- Feed callout -> `/feed`

**Mobile adaptation notes:**
- Use `ScrollView` with `horizontal` for carousels
- `expo-image` for board thumbnails and video thumbnails
- Platform detection is native -- no Capacitor UA sniffing needed
- App Store / Play Store deep links via `Linking.openURL()`
- Discord link via `Linking.openURL()`

---

## Auth

### Login Page

**Web route:** `/auth/login`

**Mobile status:** Auth flow screen, not in tab navigator

**Layout:** Full-screen, `minHeight: 100vh`, `background: var(--semantic-background)`

**Header bar:** Fixed 64px height. Contains: BackButton (left), Logo (small, no text), "Boardsesh" title (h4).

**Main content:** Centered card, `maxWidth: 400px`, `paddingTop: 48px`

**Card contents:**
1. **Logo** (centered, size md)
2. **Subtitle** (body2, text.secondary): `login.subtitle`
3. **Tab selector** (MUI `Tabs`, centered):
   - "Sign In" tab (`login.tabs.signIn`, value `login`)
   - "Create Account" tab (`login.tabs.signUp`, value `register`)

4. **Sign In tab:**
   - Email field: `TextField` with `MailOutlined` start adornment, placeholder `login.placeholders.email`, validation `login.validation.emailRequired` / `login.validation.emailInvalid`
   - Password field: `TextField` type=password with `LockOutlined` start adornment, placeholder `login.placeholders.password`
   - Submit button: `Button` variant=contained, size=large, full width. Shows `CircularProgress` (16px) when loading. Label: `login.submit.signIn`
   - Form validates on submit. Errors shown via `helperText` on each field.

5. **Create Account tab:**
   - Name field (optional): `TextField` with `PersonOutlined` start adornment, placeholder `login.placeholders.name`
   - Email field: same as login
   - Password field: placeholder `login.placeholders.passwordWithMin` (mentions 8 char minimum)
   - Confirm password field: placeholder `login.placeholders.confirmPassword`
   - Submit button: label `login.submit.signUp`
   - Registration calls `/api/auth/register` POST
   - If `requiresVerification` in response: shows info toast, switches to login tab, pre-fills email
   - If no verification required: auto-signs in via `signIn('credentials', ...)` and redirects

6. **Divider** with text "or" (`login.divider`)

7. **Social login buttons** (`SocialLoginButtons` component):
   - Fetches available providers from `/api/auth/providers-config`
   - Google button: white background, Google color icon, "Continue with Google"
   - Apple button: black background, Apple icon, "Continue with Apple"
   - Facebook button: #1877F2 background, Facebook icon, "Continue with Facebook"
   - In native Capacitor app: uses `buildNativeOAuthSignInUrl()` for in-app browser OAuth
   - Loading state: Skeleton placeholders while providers config loads

**User actions:**
- Switch between Sign In / Create Account tabs
- Submit login form (Enter key or button tap)
- Submit registration form
- Tap social login button
- Tap back button

**States:**
- Loading: session status `loading` -- renders nothing
- Authenticated: session status `authenticated` -- redirects to `callbackUrl` (default `/`)
- Error from URL param `?error=CredentialsSignin` -- shows "Invalid credentials" toast
- Error from URL param `?error=<other>` -- shows generic "Authentication failed" toast
- Verified from URL param `?verified=true` -- shows "Email verified" success toast
- Login loading: submit button disabled with spinner
- Register loading: submit button disabled with spinner
- Field validation errors: red border + helper text on individual fields

**Data sources:**
- NextAuth `signIn()` for credential login
- `/api/auth/register` POST for registration
- `/api/auth/providers-config` GET for available OAuth providers
- `callbackUrl` query parameter for post-auth redirect

**Navigation:**
- Back button -> previous page
- Successful login -> `callbackUrl` or `/`
- Social login -> OAuth flow -> callback -> `callbackUrl`

**Mobile adaptation notes:**
- Replace MUI `Tabs` with segmented control or custom tab component
- Social login uses `expo-auth-session` or `expo-web-browser` for OAuth
- Apple Sign-In via `expo-apple-authentication`
- Google Sign-In via `@react-native-google-signin/google-signin`
- `KeyboardAvoidingView` for form fields
- `SecureStore` for token persistence

### Verify Request Page

**Web route:** `/auth/verify-request`

**Mobile status:** Auth flow screen

**Layout:** Same shell as login page (header bar + centered card)

**Card contents:**
- If no error: Mail icon (48px, primary color), "Check your email" title (h3), description text
- If error (from `?error=` param, codes: `EmailNotVerified`, `InvalidToken`, `TokenExpired`, `TooManyAttempts`): Cancel icon (48px, error color), Alert with error message
- Email input field with `MailOutlined` adornment for resend
- "Resend verification email" button (contained, large, full width, shows spinner when loading)
- "Back to login" text button linking to `/auth/login`

**Data:** POST to `/api/auth/resend-verification` with `{ email }`

### Error Page

**Web route:** `/auth/error`

**Mobile status:** Auth flow screen

**Layout:** Same shell as login page

**Card contents:**
- Cancel icon (48px, error color)
- "Authentication Error" title (h3)
- Alert (severity=error) with localized message based on `?error=` param
- Known error codes: `Configuration`, `AccessDenied`, `Verification`, `OAuthSignin`, `OAuthCallback`, `OAuthCreateAccount`, `EmailCreateAccount`, `Callback`, `OAuthAccountNotLinked`, `SessionRequired`
- "Back to login" button (contained, large, full width) linking to `/auth/login`

### Native Start Page

**Web route:** `/auth/native-start`

**Mobile status:** Not needed in React Native (OAuth handled natively)

This page is a web-only entry point for mobile OAuth flows. It auto-submits a hidden form to the NextAuth provider endpoint. Shows a `CircularProgress` spinner and "Signing in..." text. Only allows providers: `google`, `apple`, `facebook`.

---

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

## Climb List

### Board Page Climb List

**Web component:** `packages/web/app/components/board-page/climbs-list.tsx`

**Web route:** `/b/{board_slug}/{angle}/list` or `/{board_name}/{layout_id}/{size_id}/{set_ids}/{angle}/list`

**Mobile status:** Stack screen within board tab

**Layout:** Vertical scrollable list. Header row with search pills + view toggle + angle selector. Main content area with climbs. Bottom tab bar with spacer.

**Header row:**
- **Left (flex: 1, overflow hidden):** Search summary pills (horizontal scroll, `headerInline` prop) -- chips showing active filter descriptions. Each chip is removable.
- **Right (flex-shrink: 0):** 
  - View mode toggle: two `IconButton`s side by side (gap 2px)
    - List icon (`FormatListBulletedOutlined`) -- opacity 1 when active, 0.4 when inactive
    - Grid icon (`AppsOutlined`) -- opacity 1 when active, 0.4 when inactive
    - ID attributes for onboarding: `onboarding-view-mode-list`, `onboarding-view-mode-grid`
  - Angle selector component (right of view toggle)
- Min height: 40px, padding: `8px 12px`

**View modes:**

#### List Mode (default, persisted to IndexedDB as `climbListViewMode`)
- **Virtualized:** Uses `@tanstack/react-virtual` `useWindowVirtualizer`
  - `estimateSize: () => 107` (107px per item)
  - `overscan: 10` (10 items rendered above/below viewport)
  - `initialRect: { width: 375, height: 812 }` (for SSR)
  - Absolute positioned items with `transform: translateY(${start}px)`
  - `contain: 'layout style paint'` for rendering optimization
- **Infinite scroll:** Triggered when last virtual item index >= `visibleClimbs.length - 5`
- **Item component:** `ClimbListItem` (see below)
- **Swipe hint:** `SwipeHintOrchestrator` renders after list items

#### Grid Mode
- **Layout:** Flexbox wrap, `gap: themeTokens.spacing[4]` (16px)
- **Item width:** `xs: 100%`, `lg: calc(50% - 8px)` (two columns on large screens)
- **Item component:** `ClimbCard` (see below)
- **Infinite scroll:** Intersection Observer sentinel at bottom of list
- **Not virtualized** (all visible items rendered)

**Loading states:**
- Initial load: 10 skeleton items matching the active view mode
- Load more: additional skeletons appended below existing items
- End of results: centered text "No more climbs" (when `!hasMore && climbs.length > 0`)

**Batched rendering:** When search results are replaced (not appended), only the first 6 items render synchronously. The rest render on the next animation frame. The window scrolls to top with `behavior: 'instant'`.

**Data sources:**
- `searchClimbs` GraphQL query with pagination (`page`, `pageSize`)
- `useUISearchParams()` for filter state (synced to URL query params)
- `useInfiniteScroll()` hook for grid mode sentinel
- `getPreference('climbListViewMode')` / `setPreference()` for view mode persistence

### Climb List Item (List Mode)

**Web component:** `packages/web/app/components/climb-card/climb-list-item.tsx`

**Layout:** Horizontal flex row, padding `8px 8px`, gap `12px`, border-bottom `1px solid var(--border-subtle)`, cursor pointer.

- **Left (64px width, flex-shrink 0):** Thumbnail with ascent status badge
  - `ClimbThumbnail` -- SVG-rendered board with highlighted holds
  - `HeartAnimationOverlay` -- heart animation on double-tap favorite (size 32px)
  - `AscentStatus` badge -- positioned absolute on thumbnail corner. Shows checkmark (sent), X (attempted), or nothing.
  - Double-tap on thumbnail: toggles favorite via `useDoubleTapFavorite`

- **Center (flex: 1, min-width 0):** `ClimbTitle` component
  - Grade (colored, right-positioned via `gradePosition: 'right'`)
  - Climb name (truncated with ellipsis, font size `themeTokens.typography.fontSize.xl`)
  - Setter info shown
  - Favorite star indicator
  - "No match" indicator if applicable

- **Right (flex-shrink 0):** Menu button (`MoreHorizOutlined`, neutral-400 color, disableRipple)

**Swipe gestures (via `useSwipeActions` hook):**

- **Swipe left (reveals right action):**
  - Default: Add to queue. Green background (`themeTokens.colors.success`). Shows `AddOutlined` icon, crossfades to `CheckOutlined` on confirmation.
  - Action width: 100px (default) or 120px (override)
  - Threshold: 60px to trigger
  - Override: can be replaced with tick action (in queue drawer)

- **Swipe right (reveals left action):**
  - Short swipe (60px threshold, 120px reveal): Primary color background. Shows `LocalOfferOutlined` icon. Opens playlist selector drawer.
  - Long swipe (150px threshold, 180px reveal max): Neutral-600 background. Shows `MoreHorizOutlined` icon. Opens full actions drawer.
  - Transition between short/long: opacity crossfade starts at 115px

- **Swipe animation:** Direct DOM manipulation (zero React re-renders during gesture). Opacity controlled via refs to inner layer elements.

**Selected state:** Background color changes to grade-tinted color (`getGradeTintColor(difficulty, 'light', isDark)`) or `var(--semantic-selected)` fallback.

**Unsupported/bigger-board state:** `opacity: 0.5`, `filter: 'grayscale(80%)'`. Tap is intercepted, shows warning snackbar.

**Drawers (per-item, rendered only when no parent drawer callbacks):**
- Actions drawer: `ClimbActionsDrawer` at 60% height with drag-to-resize
- Playlist selector drawer: `SwipeableDrawer` with `PlaylistSelectionContent`, max-height 70vh
- Queue drawer: `QueueDrawer` for viewing current queue

**Mobile adaptation notes:**
- Use `react-native-gesture-handler` `Swipeable` for swipe actions
- Or implement with `PanGestureHandler` + `react-native-reanimated` for custom gesture physics
- `FlashList` replaces virtualized list with `estimatedItemSize={107}`
- Thumbnail: pre-rendered image or `react-native-svg` inline
- Haptic feedback on swipe threshold crossing via `expo-haptics`

### Climb Card (Grid Mode)

**Web component:** `packages/web/app/components/climb-card/climb-card.tsx`

**Layout:** MUI `Card` with header, content, and actions sections.

- **Header (`CardHeader`):** `ClimbTitle` component (horizontal layout, shows setter info). Padding top 8px, bottom 10px.
- **Content (`CardContent`):** Board thumbnail cover (`ClimbCardCover`). Padding 10px. Background tints to grade color when selected. Heart animation overlay on double-tap.
- **Actions (`CardActions`):** Row of action icons (justify: space-around), top border `1px solid var(--neutral-200)`. Actions include: open/view, add to queue, favorite, share, etc. Rendered via `ClimbActions` component in `viewMode="icon"`.

**Unsupported state:** Wrapper div: `opacity: 0.5`, `filter: 'grayscale(80%)'`.

**Selected state:** Content background: grade tint color or `var(--semantic-selected-light)`.

**Mobile adaptation notes:**
- Custom card component with `react-native-reanimated` for press animations
- Grid layout via `FlashList` with `numColumns={1}` (phone) or `numColumns={2}` (tablet)

### Search Drawer (Filters)

**Web component:** `packages/web/app/components/search-drawer/unified-search-drawer.tsx` and `accordion-search-form.tsx`

**Layout:** Top-anchored `SwipeableDrawer`. Full height in climb mode, 80vh otherwise. Category pills at top.

**Category pills:** Horizontal chip row: Climbs (only when boardDetails available), Boards, Gyms, Users, Playlists. Active chip: filled + primary color. Inactive: outlined.

**Climb search form (`AccordionSearchForm`):** Collapsible accordion sections:

1. **Climb section:**
   - Name input (`SearchClimbNameInput`)
   - Grade range picker (`GradeRangePicker`) -- chip-based grade selection
   - Tall/Wide climbs filter (Kilter Homewall only) -- switches
   - Setter name select (`SetterNameSelect`) -- autocomplete

2. **Quality section:**
   - Min rating picker (star rating)
   - Min ascents bucket picker (filters by number of logged ascents)

3. **Status section:**
   - Radio group: Any / Drafts / Established / Projects
   - "My sends only" filter (auth-gated)

4. **Holds section:**
   - Hold filter overlay on board renderer
   - Tap hold to set include/exclude filter per hold position
   - Hold type picker (include/exclude toggle + STARTING/HAND/FINISH/FOOT swatches)

5. **Zone section:**
   - Climb zone visualization on board

6. **Sort section:**
   - Sort select: Relevance, Date, Difficulty ascending, Difficulty descending

**Search pills (above climb list):**
- Active filters shown as removable chips in horizontal scroll
- "Clear all" button when multiple filters active
- Each pill shows filter summary (e.g., "V3--V7", "4+ stars", setter name)

**Data sources:**
- `useUISearchParams()` -- URL-synced search parameters
- `getGradesForBoard()` -- grade list for current board
- `useBoardProvider()` -- auth state for conditional filters

---

## Climb Detail / View

### Climb Detail Shell

**Web component:** `packages/web/app/components/climb-detail/climb-detail-shell.client.tsx`

**Web route:** `/b/{board_slug}/{angle}/view/{uuid}` (info mode) or within play drawer (play mode)

**Mobile status:** Stack screen pushed from climb list

**Layout:**
- **Play mode:** Single-column scroll layout. Above-fold (board + header) renders first. Below-fold (collapsible sections) deferred via `startTransition` to avoid blocking initial paint.
- **Info mode:** Two-column on desktop (breakpoint 1024px), single-column on mobile. Left: board + sections. Right: sidebar with sections (desktop only).

### Climb Detail Header

**Web component:** `packages/web/app/components/climb-detail/climb-detail-header.tsx`

**Layout:** Flex row, padding `12px 16px`, gap 12px, min-height 56px.

- **Left (flex-shrink 0, min-width 48px):** Grade display
  - Formatted grade (bold, `fontSize: 2xl`, colored by grade)
  - Or raw difficulty string if grade format not loaded
  - Or "Project" italic text if no difficulty
  - Skeleton (48px wide) while grade format is loading

- **Center (flex: 1, centered):**
  - Climb name (`fontSize: lg`, bold) with marquee text animation for overflow
  - Climb icons: benchmark diamond, no-match indicator
  - Details row: quality rating + star, ascensionist count ("X sends"), setter username. Joined by " . " separator.

- **Right (flex-shrink 0, min-width 48px):** Empty spacer for visual centering of name

**Data sources:**
- `climb` object with `difficulty`, `name`, `quality_average`, `ascensionist_count`, `setter_username`, `benchmark_difficulty`, `is_no_match`
- Optional `communityGrade` override from `climb_community_status` table
- `useGradeFormat()` for board-specific grade formatting and coloring

### Collapsible Detail Sections

**Web component:** `packages/web/app/components/climb-detail/build-climb-detail-sections.tsx`

Sections are rendered via `CollapsibleSection` component. Each section has a label, title, summary, expand/collapse state, and lazy-loaded content.

**Sections (in order):**

1. **Beta** (`key: 'beta'`)
   - Label: Video camera icon + "Beta"
   - Default expanded, `keepExpanded: true`
   - Content: `BoardseshBetaList` showing video links (TikTok/Instagram embeds), or `BoardseshBetaAddPanel` for adding new beta
   - Action button: `BoardseshBetaAddButton` toggle
   - Summary: "{N} videos" or "No videos yet"
   - Data: `GET_BETA_LINKS` GraphQL query, `betaLinks` response mapped via `mapBetaLinksResponse()`

2. **Your Logbook** (`key: 'logbook'`)
   - Content: `LogbookSection` -- user's ascent history for this climb
   - Summary: "{N} attempts, {M} sends" or "No ascents"

3. **Crew Logbook** (`key: 'crew-logbook'`)
   - Content: `CrewLogbookView` -- followed users' ascent data
   - Summary: "See your crew's sends"

4. **Community** (`key: 'community'`)
   - Content: `ClimbSocialSection` -- votes, comments, grade proposals
   - Summary: "Votes, Comments, Proposals"
   - Default active if `?proposalUuid=` query param is present

5. **Analytics** (`key: 'analytics'`)
   - Content: `ClimbAnalytics` -- ascent/quality trend charts
   - Summary: "Ascents, Quality, Trends"

6. **Similar Climbs** (`key: 'similar-climbs'`)
   - Content: `SimilarClimbsList` -- climbs with similar hold patterns
   - `keepExpanded: true`
   - Threshold: 0.5 similarity, limit 10 results
   - Summary: i18n `detail.sections.similarClimbsSummary`
   - Empty message: `similarClimbs.emptyOnLayout`

All sections are `lazy: true` (content mounts only when expanded).

**Data sources:**
- `betaLinks` query: `GET_BETA_LINKS` (GraphQL HTTP, staleTime 5min)
- `useLogbookSummary(climbUuid)` for logbook section summary
- `searchParams.get('proposalUuid')` for highlighting a specific proposal
- `climbUuid`, `boardType`, `angle`, `layoutId` passed to each section

**Mobile adaptation notes:**
- Collapsible sections: `react-native-reanimated` `useAnimatedStyle` for height animation
- Beta videos: `react-native-webview` for TikTok/Instagram embeds, or native video player
- Charts: `react-native-chart-kit` or `victory-native`

---

## Create Climb

### Create Climb Form

**Web component:** `packages/web/app/components/create-climb/create-climb-form.tsx`

**Web route:** `/b/{board_slug}/{angle}/create` or `/{board_name}/{layout_id}/{size_id}/{set_ids}/{angle}/create`

**Mobile status:** Stack screen within board flow. Header hidden on web.

**Layout:** Full-screen. Board renderer (interactive, takes most of the screen). Floating action bar at bottom. Settings drawer as bottom sheet overlay.

**Board renderer:**
- `ZoomableBoard` wrapping `BoardRenderer` (Aurora) or `MoonBoardRenderer` (MoonBoard)
- **Hold selection:** Tap any hold on the board to open hold type picker popover. The `useHoldTypePicker` hook tracks which hold was tapped and anchors the popover.
- **Hold states cycle (via HoldTypePicker popover):**
  - OFF (cleared/unset) -- transparent
  - STARTING (green) -- max 2 allowed
  - HAND (blue) -- unlimited
  - FINISH (pink) -- max 2 allowed
  - FOOT (orange) -- not available on MoonBoard
  - Clear (X icon) -- removes hold
- **Hold indicator:** Colored circle rendered on each selected hold, matching the hold state color from `HOLD_STATE_MAP[boardName]`
- **Heatmap overlay:** `CreateClimbHeatmapOverlay` component. Shows hold usage frequency across all climbs as a heat map. Toggle via fire icon button. Opacity 0.7.

**Hold Type Picker (Popover):**
- **Web component:** `packages/web/app/components/create-climb/hold-type-picker.tsx`
- Anchored to tapped hold element, opens above (`anchorOrigin: top center`, `transformOrigin: bottom center`)
- **Setter mode:** Horizontal row of color swatches (25px circles with 2px border). Each shows hold state color and label below (11px caption). "Clear" swatch has X icon.
- States disabled when at max count (STARTING at 2, FINISH at 2) and current hold is not already that state.
- **Board-specific options:**
  - Kilter/Tension/etc: STARTING, HAND, FINISH, FOOT
  - MoonBoard: STARTING, HAND, FINISH (no FOOT)

**Bottom action bar (floating over board):**
- **Left section:** Draft count badge + Drafts button (opens DraftsDrawer)
- **Center section:** Name input, description input (when settings open)
- **Right section:** 
  - Heatmap toggle (fire icon, Aurora only)
  - Settings gear (opens settings drawer)
  - Clear/delete button (resets all holds)
  - Save button (context-dependent icon):
    - Not authenticated: `LoginOutlined` (opens auth modal)
    - Edit locked (published >24h ago): `LockOutlined` (disabled)
    - Just saved: `CheckCircleOutlined` (green, no click handler, auto-resets after 3s)
    - Saving: `CircularProgress`
    - Ready to save: `SaveOutlined` or `CloudUploadOutlined`
  - "Set Active" button (`PlayCircleOutlineOutlined`) -- pushes WIP climb to party queue

**Form fields (in settings drawer):**
- Name input (`TextField`): Required for publish. When empty and save is tapped, settings drawer auto-opens.
- Description input (multiline `TextField`)
- Draft toggle (`Switch`): When ON, climb is saved as draft (not publicly visible). Default ON.
- MoonBoard-specific: Grade select, Benchmark toggle, Angle select

**Autosave:** Form state (holds, name, description, isDraft) is debounced (500ms) and persisted to IndexedDB via `saveAutosave()`. Restored on mount if not forking. Cleared on successful save or manual clear.

**Save flow:**
1. Validates: name required for publish; at least 1 hold for Aurora (isValid); START + FINISH for MoonBoard publish
2. If not authenticated: opens auth modal with pending form values
3. **First save:** Creates new climb via `saveClimb()` (Aurora) or `SAVE_MOONBOARD_CLIMB_MUTATION` (MoonBoard)
4. **Subsequent saves:** Updates existing climb via `updateClimb()` within 24h edit window (published) or indefinitely (drafts)
5. On success: `markJustSaved()` -- 3s confirmation state, clears autosave, syncs to queue via `syncSavedClimbToQueue()`
6. On duplicate error (`CLIMB_IS_DUPLICATE`): shows inline Alert + opens SimilarClimbsList drawer showing the matching climb

**Bluetooth preview:** When BLE is connected (Aurora boards only), `sendFramesToBoard(frames)` fires on every `litUpHoldsMap` change, sending current hold pattern to the physical board in real-time.

**Drafts drawer:**
- Lists user's draft climbs for current board configuration
- Each draft can be loaded back into the form (`handleLoadDraft`) or deleted
- Count shown as badge on drafts button

**MoonBoard OCR import:**
- Hidden file input (`<input type="file">`) for screenshot upload
- Processes via `parseScreenshot()` from `@boardsesh/moonboard-ocr/browser`
- Extracts holds, name, grade, setter from MoonBoard app screenshots
- Warning on angle mismatch

**Fork flow:** When `forkFrames`/`forkName` props are provided (from "Fork" action on existing climb):
- Holds pre-populated from fork source
- Name set to "{original name} fork"
- In edit mode: name preserved as-is

**Data sources:**
- `saveClimb()` / `updateClimb()` from `useBoardProvider()` (Aurora)
- `SAVE_MOONBOARD_CLIMB_MUTATION` GraphQL mutation (MoonBoard)
- `CHECK_MOONBOARD_CLIMB_DUPLICATES_QUERY` for MoonBoard duplicate detection
- `SEARCH_CLIMBS_COUNT` for drafts count badge
- `useCreateClimb()` hook managing hold state, frame string generation
- `useMoonBoardCreateClimb()` hook for MoonBoard-specific hold management
- `useBoardBluetooth()` for BLE connection and frame sending

**User actions:**
- Tap hold on board -> opens hold type picker
- Select hold type from picker -> updates hold state and color
- Pinch/zoom board (ZoomableBoard)
- Toggle heatmap overlay
- Enter climb name and description
- Toggle draft status
- Save/publish climb
- Clear all holds and form
- Open drafts drawer and load a draft
- Set climb as active in party queue
- MoonBoard: import from screenshot, select grade, toggle benchmark, change angle

**States:**
- Empty (no holds selected): save disabled
- Valid (holds placed): save enabled if name provided
- Saving: spinner on save button
- Just saved: green checkmark for 3s, then reverts
- Edit locked: lock icon (published climb older than 24h)
- Duplicate detected: inline error Alert with "View matching climb" option
- OCR processing: loading state during screenshot analysis
- MoonBoard duplicate checking: loading indicator during server-side check
- Autosave active: form state being debounced and persisted

**Validation:**
- Aurora: must have at least 1 hold (`isValid = totalHolds > 0`)
- MoonBoard publish: must have STARTING and FINISH holds
- MoonBoard draft: no hold requirements
- Name required for all saves (auto-opens settings drawer if missing)

**Navigation:**
- Back button (from header on mobile) -> returns to climb list
- Bulk import link (MoonBoard) -> navigates to `/import` page

**Mobile adaptation notes:**
- `ZoomableBoard` maps to `react-native-gesture-handler` pinch/pan gestures + `react-native-reanimated` transforms
- Hold type picker: bottom sheet instead of popover (finger occlusion on small screens)
- File input for OCR: `expo-image-picker` or `expo-document-picker`
- BLE via `react-native-ble-plx` -- direct connection, no browser API
- Autosave to AsyncStorage instead of IndexedDB
- Keyboard handling: `KeyboardAvoidingView` for name/description inputs when settings drawer is open
## Play View

The Play View is the primary interactive screen for viewing, navigating, and interacting with climbs. It is the most complex single screen in the app, combining board rendering, gesture navigation, tick logging, session management, queue control, and below-fold detail sections into a single cohesive experience.

---

### Play View Drawer

#### Entry Points

Users open the play view through four paths:

1. **Tap a climb row or card in the climb list.** The list dispatches a `boardsesh:open-play-drawer` custom window event (`PLAY_DRAWER_EVENT`). In party sessions, the event payload includes the tapped `Climb` object so the drawer can preview it without mutating the wall climb. In solo mode, callers pre-mutate state via `setCurrentClimb`.
2. **Tap the climb thumbnail in the queue control bar.** The control bar sets `activeDrawer` to `'play'` directly.
3. **Tap a climb in the queue list.** Sets the climb as current (broadcasts in party mode) and opens the play drawer.
4. **Direct URL navigation** to `/b/[board_slug]/[angle]/view/[climb_uuid]` or the legacy `/[board_name]/[layout_id]/[size_id]/[set_ids]/[angle]/view/[climb_uuid]` route. The drawer opens on mount with `initialOpenWithoutAnimation=true` so it is visible immediately on the SSR paint with no slide-in transition.

#### State Machine

The drawer manages a composite state with these primary variables:

| State Variable | Type | Description |
|---|---|---|
| `activeDrawer` | `'none' \| 'play' \| 'queue' \| 'tick'` | Which top-level view the queue control bar is showing. The play view is open when this equals `'play'`. |
| `isQueueOpen` | `boolean` | Nested queue drawer is visible (stacked over play view). |
| `isActionsOpen` | `boolean` | Climb actions drawer is visible (stacked over play view). |
| `isPlaylistSelectorOpen` | `boolean` | Playlist selection drawer is visible (stacked over play view). |
| `isTickBarActive` | `boolean` | The tick bar is expanded, overlaying the board area. |
| `isBoardZoomed` | `boolean` | The board is pinch-zoomed in. Disables horizontal swipe navigation and locks vertical scroll. |
| `drawerDisplayedItem` | `ClimbQueueItem \| null` | In party sessions, the climb the drawer is locally previewing. When null, the drawer shows the wall climb (`currentClimbQueueItem`). |
| `pendingClimbUuid` | `string \| null` | Set when the user presses the lightbulb to take control in party mode. Cleared when the wall-confirm event arrives or the 2-second timeout fires. Drives the lightbulb pulse animation. |
| `lightDrawerOpen` | `boolean` | The light-control drawer (disco, glyphs, palette, BLE disconnect) is open. Mounted lazily on first open via `hasOpenedLightDrawer`. |
| `showLightbulbCoachmark` | `boolean` | First-run coachmark pulse on the lightbulb. Read from IndexedDB key `swipeHint:lightbulbSeen`. |
| `drawerOpen` | `boolean` | Internal CSS-level open state, separated from `isOpen` to allow animation timing. |
| `sectionsEverEnabled` | `boolean` | Flips to true after the drawer's open transition completes. Gates below-fold section mounting. |

**State transitions:**

- **play -> queue**: Tap queue button in action bar. Sets `isQueueOpen=true`, `isActionsOpen=false`, `isPlaylistSelectorOpen=false`. The `queueMounted` flag is set to true so the QueueDrawer component mounts.
- **play -> tick**: Tap the tick FAB. Sets `isTickBarActive=true`, `isActionsOpen=false`.
- **queue -> play**: Close the nested queue drawer (swipe down, tap backdrop, or tap a climb). Sets `isQueueOpen=false`. On transition end, `queueMounted` is set to false to unmount the drawer.
- **tick -> play**: Tap the tick bar close button, tap the backdrop overlay, or swipe down on the tick bar. Sets `isTickBarActive=false`.
- **play -> actions**: Tap the "more" (ellipsis) button in the action bar. Sets `isActionsOpen=true`.
- **actions -> playlist**: Tap "Add to playlist" in the actions drawer. Sets `isActionsOpen=false`, `isPlaylistSelectorOpen=true`.
- **close**: Tap the close button (top-right X), swipe down on the drawer, or press browser back. The `handleClose` callback is gated: it does nothing if `isActionsOpen`, `isQueueOpen`, or `isPlaylistSelectorOpen` is true (nested drawers must close first). Browser back (`popstate`) bypasses this gate and closes unconditionally.

**Tick bar auto-close:** The tick bar resets (`isTickBarActive=false`) whenever `currentClimb.uuid` changes, preventing it from staying open for the wrong climb.

#### Overall Layout (Top to Bottom)

The drawer uses a `SwipeableDrawer` component with `placement="bottom"`, `height="100%"`, and `fullHeight`. The internal layout, from top to bottom:

1. **Drag handle** (top-center). Rendered by `SwipeableDrawer` via `showDragHandle`. A short horizontal pill that the user can grab to swipe the drawer down to close.

2. **Driver indicator dot** (top-left, `position: absolute`, `top: 10px`, `left: 12px`, `z-index: 2`). Only renders in a party session when another user is driving (i.e., `isPersistentSessionActive && driverUser && !isDriver`). Shows the driver's `TickBadgeAvatar` at 18px size. `pointerEvents: none` so it does not interfere with touch targets.

3. **Close button** (top-right, `position: absolute`, `top: 8px`, `right: 8px`, `z-index: 2`). An `IconButton` with `CloseOutlined` icon. Background: `action.selected`, hover: `action.focus`.

4. **Drawer content area** (`div.drawerContent`). A flex column that fills the drawer. Touch events on this div drive the pull-to-close gesture (`usePullToClose` hook with `deadZone: 60`, `closeThreshold: 70`). Contains `PlayDrawerContent` which renders `ClimbDetailShellClient` in `mode="play"`.

   The shell splits into:

   **Above-fold** (fills 100% height, flex column, `flex-shrink: 0`):

   a. **Climb header** (`ClimbDetailHeader`). Horizontal layout: grade (left, min-width 48px) | name + details (center, flex: 1) | spacer (right, min-width 48px for balance). The grade renders in a color derived from difficulty. The name uses `MarqueeText` for long names. Below the name: quality rating + send count + setter username, joined by `" · "` (middle dot). Min-height 56px. Padding: 12px horizontal, 12px vertical.

   b. **Board section wrapper** (`div.boardSectionWrapper`). `position: relative`, flex: 1, contains the board carousel, tick FAB, tick bar overlay, and tick bar. The board renders top-aligned (`justify-content: flex-start`) so the tick bar can float over the bottom without covering the climb.

   c. **Mini session bar** (`MiniSessionBar`). Only renders in party mode. Sits between the board and the action bar.

   d. **Action bar** (`PlayViewActionBar`). Horizontal row of icon buttons, `justify-content: space-around`. Only renders when `isOpen` is true.

   **Below-fold** (deferred render, scrollable): Sections mount after the drawer open transition completes (`sectionsEverEnabled`), using `startTransition` to avoid blocking the above-fold paint. The scroll container has `overflow-y: auto`, `-webkit-overflow-scrolling: touch`, `overscroll-behavior-y: contain`.

5. **Nested drawers** (portal-less, stacked on top):
   - **Climb actions drawer** (`SwipeableDrawer`, height 60%, drag-to-resize)
   - **Playlist selector drawer** (`SwipeableDrawer`, height auto, max-height 70vh)
   - **Queue drawer** (`QueueDrawer`, height 60%)
   - **Light control drawer** (`LightControlDrawer`, lazily mounted)

#### URL Synchronization

The `useDrawerUrlSync` hook keeps the browser address bar in sync:

- When the drawer opens from a list page, `history.pushState` navigates to `/view/{climb_uuid}`.
- On climb changes (prev/next/swipe), `history.replaceState` updates the URL to the new climb.
- On close, `history.replaceState` returns to the list URL.
- Browser back (`popstate`) closes the drawer when the URL leaves `/view/`.
- Direct hits to `/view/{uuid}` are detected via `sourceRef='direct'` and skip the push (the URL is already correct).

#### Wake Lock

The `useWakeLock` hook is activated when the drawer is open (`useWakeLock(isOpen)`), preventing the screen from dimming while the user is viewing a climb.

#### Pre-warming

When a climb is displayed, the drawer pre-warms the board render by calling `renderBoard()` from the worker manager with the current climb's `frames`, `mirrored` state, and `boardDetails`. This ensures the off-screen canvas/WASM render is ready before the user scrolls or interacts.

---

### Board Carousel (SwipeBoardCarousel)

The `SwipeBoardCarousel` component renders the current climb's board with horizontal swipe navigation between climbs in the queue or suggestions feed.

#### Rendering Pipeline

Two rendering backends are supported, chosen at runtime by `useCanvasRendererReady()`:

1. **BoardCanvasRenderer** (preferred). Uses a Web Worker + WASM pipeline. The worker composites background images + hold overlay off the main thread, returning an `ImageBitmap` drawn onto a `<canvas>` element. Falls back to `BoardImageLayers` if the worker render fails.

2. **BoardImageLayers** (fallback). Uses CSS Grid stacking (`gridArea: 1/1`) with `<img>` elements for board background layers and an SVG overlay for holds. Avoids `position: absolute` due to iOS 18.x WebKit bugs with absolutely positioned images in aspect-ratio containers.

Both render with `contain` mode (`object-fit: contain`) when used in the carousel, filling 100% width and 100% height of the container.

#### Board Rendering (BoardRenderer)

For Aurora boards (Kilter, Tension, Decoy, Touchstone, Grasshopper, Soill):

- SVG-based rendering with `viewBox="0 0 {boardWidth} {boardHeight}"` and `preserveAspectRatio="xMidYMid meet"`.
- Background images rendered as `<image>` elements inside the SVG, one per entry in `boardDetails.images_to_holds`. Each image fills the full `boardWidth x boardHeight`.
- Two sizing modes controlled by the `fillHeight` prop:
  - **Fill-height mode** (`fillHeight=true`): SVG has `height: 100%`, `width: 100%`. Used in the play view carousel where the container controls sizing.
  - **Auto-height mode** (`fillHeight=false`): SVG has `height: auto`, `maxHeight` defaults to `55vh` (or `10vh` for thumbnails). Used in standalone board views.

For MoonBoard:

- Grid-based rendering via `MoonBoardRenderer`, using the board's `layoutFolder` and `holdSetImages` array. The grid is 11 columns by 18 rows.

#### Lit-Up Holds (BoardLitupHolds)

Holds are rendered as SVG `<circle>` elements overlaid on the board:

- **Hold data**: Each hold has `id`, `cx`, `cy`, `r` (center coordinates and radius), and `mirroredHoldId`.
- **Colors by state** (per board, defined in `HOLD_STATE_MAP`):
  - Kilter: STARTING = `#00FF00` (green), HAND = `#00FFFF` (cyan), FINISH = `#FF00FF` (magenta), FOOT = `#FFAA00` (orange)
  - Tension: STARTING = `#00FF00` (green, display: `#00DD00`), HAND = `#0000FF` (blue, display: `#4444FF`), FINISH = `#FF0000` (red), FOOT = `#FF00FF` (magenta)
  - MoonBoard: STARTING = `#00FF00` (green), HAND = `#0000FF` (blue), FINISH = `#FF0000` (red)
- **Stroke width**: 6px normal, 8px for thumbnails.
- **Fill opacity**: 0 for normal rendering (stroke-only circles), 0.3 for thumbnails (semi-transparent fill for visibility at small sizes).
- **Transparency optimization**: In thumbnail mode or when no `onHoldClick` handler is provided, only lit-up holds are rendered (typically 5-15 holds vs. hundreds total). This is a significant performance optimization.
- **Mirroring**: When `mirrored=true` and a hold has a `mirroredHoldId`, the hold is rendered at the mirrored hold's position (`cx`, `cy`, `r`). The mirrored hold is looked up from `holdsData` by ID.

#### Swipe Navigation

Implemented by the `useCardSwipeNavigation` hook (wraps `react-swipeable`):

- **Gesture detection**: Touch-only (`trackMouse: false`). Uses `useSwipeDirection` to distinguish horizontal from vertical swipes early in the gesture, so vertical scrolling is not blocked.
- **Swipe threshold**: 80px horizontal displacement required to trigger navigation.
- **Disabled when**: Board is zoomed (`isZoomed=true`), or the hook's `enabled` prop is false.

**Animation timing constants:**

| Constant | Value | Description |
|---|---|---|
| `EXIT_DURATION` | 300ms | Slide-off animation (card exits screen) |
| `SNAP_BACK_DURATION` | 200ms | Snap-back when swipe doesn't meet threshold |
| `CLIP_EXIT_DURATION` | 100ms | Delay before triggering navigation in `delayNavigation` mode |
| `ENTER_ANIMATION_DURATION` | 170ms | Enter crossfade/transition for the new climb |

**Peek animation:**

During a swipe, the next or previous climb's board slides in from the edge:
- Next climb: `translateX(max(0px, calc(100% + {swipeOffset}px)))` (slides in from right)
- Previous climb: `translateX(min(0px, calc(-100% + {swipeOffset}px)))` (slides in from left)
- The peek container is `position: absolute`, `inset: 0`, with `overflow: clip`.

**Delayed navigation** (`delayNavigation=true`, used in the play view):
When the swipe exceeds threshold, the current card animates off-screen. After `CLIP_EXIT_DURATION` (100ms), the navigation callback fires, the new climb data replaces the old, and an enter direction is set (`from-left` or `from-right`) for a brief crossfade effect that auto-clears after `ENTER_ANIMATION_DURATION` (170ms).

**Scroll prevention:**
A native non-passive `touchmove` listener is attached to the carousel element. When `isHorizontalSwipeRef.current === true`, the listener calls `e.preventDefault()` to block vertical scroll. This is necessary because React 18's passive touch listeners and `touch-action: pan-y` would otherwise allow the compositor to scroll vertically during a horizontal swipe.

**Party session navigation behavior:**

- **Driver / solo**: Swipe calls `setCurrentClimbQueueItem(item)`, which broadcasts the climb change to the wall and all participants. The BLE AutoSender picks up the change and sends it to the physical board.
- **Non-driver**: Swipe only updates `drawerDisplayedItem` (local preview). The wall climb is unchanged. A coachmark pulse on the lightbulb fires on the first non-driver swipe (IndexedDB key `swipeHint:partyPreviewSeen`), explaining that the lightbulb is the path to send the climb to the wall.
- **Non-driver, suggestions only**: Non-drivers navigate through the suggested climbs feed only (`suggestionsOnly: true`), skipping the shared queue which represents the driver's committed sequence.

**Drift state:**

When a non-driver has swiped to a different climb than the wall climb:
- `isDriftedFromWall` is true.
- Swiping left (previous) snaps back to the wall climb by clearing `drawerDisplayedItem`.
- The mini session bar shows a "return to wall climb" button.

#### Zoom and Pan (ZoomableBoard)

Implemented by the `useZoomPan` hook (wraps `@use-gesture/react`):

- **Pinch to zoom**: Two-finger pinch gesture. Scale range: 1.0 (min) to 4.0 (max). Zoom threshold: scale > 1.02 is considered "zoomed."
- **Pan when zoomed**: Single-finger drag to move around the board when zoomed in. Translation is clamped to prevent panning past the board edges.
- **Pinch origin tracking**: Zoom targets the pinch origin point, not the center. The hook tracks the pinch origin relative to the container center and adjusts translation accordingly.
- **Reset zoom**: Triggered by the floating reset button or when the climb changes (via `resetKey` prop, set to `currentClimb.frames`). Animates back to scale 1 with a 250ms ease-out transition.
- **Touch action**: `pan-y` when not zoomed (allows native vertical scroll), `none` when zoomed (all touch is captured for pan/pinch). The `data-swipe-blocked` attribute is set when zoomed, signaling parent components to disable their swipe handling.
- **Ctrl+wheel**: Desktop trackpad pinch or ctrl+scroll triggers zoom toward cursor position.

**Floating reset button:**

- Positioned `bottom: 62px`, centered horizontally (`left: 50%`, `transform: translateX(-50%)`).
- Pill-shaped (border-radius 18px), dark overlay background with backdrop blur.
- Contains a `CropFreeOutlined` icon and "Reset" text.
- Opacity transitions from 0 (hidden) to 1 (visible) when zoomed.
- `tabIndex: 0` when visible, `-1` when hidden.

**Zoom hint pill:**

- Centered overlay on the board, shows "Pinch to zoom" with a `ZoomInOutlined` icon.
- Auto-dismisses after 4000ms via CSS `@keyframes zoomHintFade` animation.
- Only shown once per user (IndexedDB key `playview:zoomHintSeen`).
- Only shown when the board is not zoomed and the drawer is open.
- Tapping the overlay dismisses it immediately and persists the seen flag.

#### Double-Tap Favorite

Implemented by `useDoubleTapFavorite` hook + `useDoubleTap` hook:

- **Double-tap detection**: 300ms threshold between taps (`DOUBLE_TAP_THRESHOLD`). Uses native `touchend` listeners (non-passive) to prevent iOS Safari's double-tap-to-zoom. Multi-touch gestures (pinch) are excluded: if any `touchstart` has > 1 touch, the subsequent `touchend` is ignored.
- **Instagram behavior**: Double-tap only adds a favorite, never removes. If already favorited, the heart animation still plays but `toggleFavorite` is not called.
- **Heart animation overlay**: A white `Favorite` (heart) icon, 80px, centered on the board with `position: absolute`, `inset: 0`, `pointer-events: none`, `z-index: 10`. Plays a `heartBurst` keyframe animation (1200ms ease-out): scales from 0 to 1.3, bounces to 0.95, settles at 1.0, then fades to opacity 0. Has a drop-shadow filter.
- **Authentication gate**: If the user is not authenticated, the double-tap opens the auth modal instead of favoriting.
- **Desktop**: The `onDoubleClick` handler fires on desktop; once any touch event is detected, `onDoubleClick` is permanently disabled to prevent double-firing from synthesized click events.

---

### Action Bar (PlayViewActionBar)

A horizontal row of icon buttons displayed below the board and mini session bar. CSS: `display: flex`, `justify-content: space-around`, `padding: 8px 16px 12px`, `border-top: 1px solid var(--neutral-100)`.

Buttons from left to right:

1. **Previous button** (`SkipPreviousOutlined`). Navigates to the previous climb. Disabled when `canSwipePrevious` is false (no previous climb in queue/suggestions). In drift state, tapping previous snaps back to the wall climb. Calls `navigate('previous', 'playViewDrawer')`.

2. **Mirror button** (`SyncOutlined`). Only rendered when `boardDetails.supportsMirroring` is true. Toggles the `mirrored` flag on the current climb. When active (`isMirrored=true`): purple background (`themeTokens.colors.purple`), white icon, purple border. When inactive: default styling. Calls `mirrorClimb()`.

3. **Favorite button** (`Favorite` filled / `FavoriteBorderOutlined` outlined). Toggles favorite status. When favorited: filled heart icon with `themeTokens.colors.error` (red). When not favorited: outlined heart. Calls `toggleFavorite()`.

4. **Lightbulb button** (`Lightbulb` filled / `LightbulbOutlined`). The primary wall-control gesture. Visual states:

   - **Active** (`lightbulbActive=true`): Filled `Lightbulb` icon in `themeTokens.colors.warning` (amber), with a CSS glow animation (`connectedGlow`, 1.5s ease-in-out infinite alternate, filter drop-shadow oscillating between 2px and 6px).
   - **Inactive**: Outlined `LightbulbOutlined` icon, default color.
   - **Pending** (`lightbulbPending=true`): Box-shadow pulse animation (`lightbulbPulse`, 1100ms ease-in-out infinite). Amber box-shadow expands to 6px and fades.
   - **Coachmark** (`lightbulbCoachmark=true`): Same pulse animation but single iteration (900ms). A MUI `Tooltip` with `placement="top"` and `arrow` shows coachmark text. The tooltip auto-dismisses on animation end via `onAnimationEnd`.

   Tap behavior varies by context:

   - **Solo, disconnected**: Opens the Bluetooth device picker (`bluetoothConnect()`).
   - **Solo, connected**: Sends the displayed climb to the board via `takeControl(currentClimb)`. Clears any drawer-local preview.
   - **Party, non-driver**: Takes wall control via `takeControl(currentClimb)`. Arms the 2-second wall-confirm watcher (`armWallConfirmWatcher`). Sets `pendingClimbUuid`. Clears drawer-local preview.
   - **Party, driver**: Releases wall control via `releaseControl()`. Cancels any in-flight watcher. Clears pending state. Sets `pendingReleaseReasonRef='manual'` to suppress the yank analytics event.

   Long-press (via `useLongPress` hook): Opens the `LightControlDrawer` (disco light shows, glyph animations, LED color palette customization, manual BLE disconnect). The `consumeLongPress()` method in the click handler swallows the synthesized click that follows a long-press, preventing both actions from firing.

5. **Angle selector** (`AngleSelector`). A pill-shaped button showing the current angle (e.g., "40°"). Tapping opens a right-side drawer with a grid of all available angles for the board. Each angle card shows the degree, and when a climb is active, shows that climb's stats at each angle (grade, quality, send count). Selecting an angle navigates to the new angle URL and broadcasts in party mode.

6. **More actions button** (`MoreHorizOutlined`). Opens the climb actions drawer (nested `SwipeableDrawer` at 60% height). The actions drawer contains: share, open in Aurora app, add to playlist, add to queue, copy link, report.

7. **Queue button** (`FormatListBulletedOutlined`) wrapped in `MuiBadge`. Badge shows `remainingQueueCount` (number of climbs from current position to end of queue, max 99). Badge background: `themeTokens.colors.primary`, white text. Opens the nested queue drawer.

8. **Next button** (`SkipNextOutlined`). Navigates to the next climb. Disabled when `canSwipeNext` is false. Calls `navigate('next', 'playViewDrawer')`.

---

### Tick FAB and Tick Bar (PlayViewTickBar)

#### Tick FAB (Floating Action Button)

Positioned absolutely at `bottom: 12px`, `right: 16px`, `z-index: 10` within the board section wrapper.

- **Appearance**: 40px circle, gradient background (`linear-gradient(135deg, var(--color-success) 0%, var(--color-success-dark) 100%)`). White checkmark icon (`CheckOutlined`, 20px). Box shadow: `0 4px 12px rgba(0, 0, 0, 0.3)`.
- **Success state** (`hasSuccessfulAscent`): Same green gradient (the class exists for potential future differentiation).
- **Ascent count badge**: When `ascentCount > 0`, a badge appears at `top: -3px`, `right: -3px`. Min-width 16px, height 16px, border-radius 8px, primary-colored background, white text, 10px font, weight 600.
- **Hiding animation**: When the tick bar is active, the FAB scales to 0.5 and fades to opacity 0 (`transform: scale(0.5); opacity: 0; pointer-events: none`). Transition: 200ms ease.
- **Hover/active**: Scale 1.05 on hover (with enhanced shadow), scale 0.95 on press.
- **Action**: Tapping the FAB sets `isTickBarActive=true` and closes the actions drawer if open.

#### Tick Bar Backdrop

A full-area overlay (`position: absolute`, `inset: 0`, `z-index: 9`) that darkens the board when the tick bar is active. Background: `var(--overlay-light)`. Transitions opacity from 0 to 1 over 200ms. `pointer-events: none` when inactive, `auto` when active. Tapping the backdrop closes the tick bar.

#### Tick Bar (Expanded)

Positioned absolutely at the bottom of the board section wrapper (`bottom: 0`, `left: 0`, `right: 0`, `z-index: 10`). Slides up from below via `transform: translateY(100%)` -> `translateY(0)` with 200ms ease-out transition.

**Container styling:**
- Inner container has rounded top corners (`border-radius: 12px 12px 0 0`), shadow (`0 -4px 12px rgba(0, 0, 0, 0.15)`), `touch-action: pan-x`.
- Background: In dark mode, `var(--semantic-surfaceElevated)`. In light mode, `var(--semantic-surface)`.
- Grade tint overlay: A semi-transparent grade-colored overlay applied as `background-image: linear-gradient({gradeTintColor}, {gradeTintColor})`. The tint color is computed from `currentClimb.difficulty` via `getGradeTintColor()`.

**Toolbar row** (top of tick bar, flex `justify-content: space-between`):
- **Expand/collapse toggle** (left): Down arrow when expanded, up arrow when collapsed. 16px icon, 0.7 opacity. Label text ("expand" / "collapse"), 12px font, weight 600. The expanded state is persisted to IndexedDB key `tickBarExpanded`.
- **Close button** (right): Small `IconButton` with `CloseOutlined` (16px). Background: `action.selected`.

**QuickTickBar component:**

The tick bar delegates to `QuickTickBar`, which manages tick target state, grade/quality/tries pickers, and save logic.

**Compact mode** (default, `expanded=false`):
- **Picker panel**: Slides up when a control is tapped, showing one picker at a time (stars, grade, or tries). 200ms height transition.
- **Controls row**: Two sections:
  - Left: Comment input field (flex: 1) + grade button. The comment is a `TextField` with `ChatBubbleOutlineOutlined` start adornment, placeholder text, multiline (1 row collapsed, 4 rows when focused), max 2000 chars.
  - Right: Star picker button + tries counter button.
- **Grade button** (`TickGradeButton`): Shows the selected grade or the consensus grade. Tapping expands the inline grade picker (horizontal scrollable list of grade chips).

**Expanded mode** (`expanded=true`):
- All pickers visible simultaneously in labeled rows:
  - Grade row: Label + horizontal scrollable grade picker (`InlineGradePicker`).
  - Tries row: Label + tries counter (`InlineTriesPicker`).
  - Stars row: Label + star rating picker (`InlineStarPicker`).
  - Comment row: Chat icon + multiline `TextField` (2-4 rows).

**Ascent type logic:**
- **Flash**: First attempt on a climb with no prior logbook history (`!hasPriorHistory && attemptCount === 1`).
- **Send**: Any other successful ascent (has prior history, or attempt count > 1).
- The `isFlash` state is reported to the parent via `onIsFlashChange` so the tick buttons can update their appearance.

**Action buttons** (bottom of tick bar, flex row, `justify-content: flex-end`, `gap: 8px`):
- **Attempt button** (left): `IconButton` with `PersonFallingIcon` (custom SVG icon). Background: `themeTokens.colors.errorMuted`, icon color: `themeTokens.colors.error`. Label: "Attempt". Calls `quickTickBarRef.current.saveAttempt()`.
- **Tick button** (right): `IconButton` with `TickIcon` (checkmark or flash icon). Background transitions between `themeTokens.colors.amber` (flash, with dark text `neutral[900]`) and `themeTokens.colors.success` (send, with white text). 150ms ease transition on background-color and color. Label: "Flash" or "Tick" depending on `isFlash`. Calls `quickTickBarRef.current.save()`.

**Draft restoration:** On mount, the tick bar checks for a saved draft in IndexedDB (via `loadTickDraft(climbUuid, angle)`). If found, it restores quality, difficulty, attempt count, and comment. Drafts are saved when a save attempt fails, so users don't lose their progress.

**Reset on climb change:** When `currentClimb` changes, the tick bar resets comment, focus state, flash detection, and expansion state.

---

### Mini Session Bar

Only renders when `isPersistentSessionActive` is true and `currentClimbQueueItem` is not null. Sits between the board renderer and the action bar.

**Styling:** `display: flex`, `align-items: center`, `gap: 8px`, `px: 16px`, `py: 6px`, `border-top: 1px solid var(--neutral-200)`. Background: `color-mix(in srgb, {warning} 5%, transparent)` -- a warm whisper tint, 5% of the theme warning color. Min-height: 36px.

The bar morphs between three states:

#### Driver State

- **Left**: Filled `Lightbulb` icon (16px, amber/warning color) + "DRIVING" text (11px, weight 600, letter-spacing 0.5, amber/warning color).
- **Right**: Audience `AvatarGroup` (described below).

#### Non-Driver, On Wall (not drifted)

- **Left**: Driver's `MuiAvatar` (20px) + "ON WALL · {driver username}" text (11px, weight 600, letter-spacing 0.5, `text.secondary` color). If no driver user is found, shows "ON WALL" alone.
- **Right**: Audience `AvatarGroup`.

#### Non-Driver, Drifted (previewing a different climb)

- **Full-width button**: `MuiButton` with `variant="text"`, `startIcon={ArrowBackOutlined}`. Contains the driver's avatar (20px) and text "{driver username} · {wall climb name}" (truncated with ellipsis). Tapping calls `onReturnToWallClimb`, which clears `drawerDisplayedItem` to snap back to the wall climb.
- The button's typography matches the on-wall state (11px, weight 600, letter-spacing 0.5, `text.secondary`).

#### Audience AvatarGroup

- Positioned at `ml: auto` (right-aligned).
- Shows up to 3 avatars (`max={3}`) of other session participants, excluding the local user.
- Avatar size: 22px, font-size 10px, transparent 2px border.
- Each avatar uses `TickBadgeAvatar`, which overlays a small tick badge if the user has ticked the currently displayed climb. The driver's avatar gets a driver indicator.
- The driver is floated to position 0 in the audience list.
- `aria-label` reports audience count.

**Tick badge context:** The tick badges reflect "who has done THIS climb" -- the climb the drawer is currently displaying (`drawerDisplayedItem ?? currentClimbQueueItem`), not necessarily the wall climb. This means non-driver preview shows accurate tick status for the previewed climb.

---

### Below-Fold Sections

Sections are deferred: they mount only after the drawer's open transition completes. The parent `ClimbDetailShellClient` in `mode="play"` uses `startTransition(() => setShowSections(true))` to deprioritize section mounting relative to the above-fold board + header rendering.

When the active climb changes (e.g., tapping a card in Similar Climbs), the scroll container is reset to the top via `scrollTo({ top: 0, behavior: 'smooth' })`.

Sections are rendered as `CollapsibleSection` components -- accordion-style panels that can be expanded/collapsed independently. Each section has a key, label, title, summary, and lazy-loaded content.

The sections, in order:

#### 1. Beta Videos

- **Key**: `beta`
- **Label/Title**: Camera icon + "Beta" text.
- **Default behavior**: `keepExpanded: true` (stays open alongside other sections). `defaultActive: true` (initially expanded, unless a proposal UUID is in the URL).
- **Content**: `BoardseshBetaList` showing deduped video embeds. If no videos: empty state. An "Add" button (`BoardseshBetaAddButton`) toggles to `BoardseshBetaAddPanel` for submitting TikTok/Instagram video links.
- **Summary**: "{N} video(s)" or "No videos yet".
- **Data**: Fetched via GraphQL `GET_BETA_LINKS` query, deduplicated by URL. Stale time: 5 minutes.

#### 2. Your Logbook

- **Key**: `logbook`
- **Label/Title**: "Your Logbook"
- **Content**: `LogbookSection` showing the user's ascent history for this climb. Displays attempts, sends, grades, quality ratings, and comments.
- **Summary**: "{N} attempt(s), {M} send(s)" or "No ascents".

#### 3. Crew Logbook

- **Key**: `crew-logbook`
- **Label/Title**: "Crew Logbook"
- **Content**: `CrewLogbookView` showing sends and attempts by users the current user follows.
- **Summary**: "See your crew's sends".

#### 4. Community

- **Key**: `community`
- **Label/Title**: "Community"
- **Content**: `ClimbSocialSection` with votes (upvote/downvote the climb), comments (threaded, with author avatar/name/timestamp, reply support, voting), and grade proposals (community grade suggestions). If a `proposalUuid` is in the URL search params, this section starts expanded and the proposal is highlighted.
- **Summary**: "Votes, Comments, Proposals".

#### 5. Analytics

- **Key**: `analytics`
- **Label/Title**: "Analytics"
- **Content**: `ClimbAnalytics` showing ascent trends, quality trends, and other statistical data for the climb.
- **Summary**: "Ascents, Quality, Trends".

#### 6. Similar Climbs

- **Key**: `similar-climbs`
- **Label/Title**: Localized "Similar Climbs" text.
- **Default behavior**: `keepExpanded: true` (stays open alongside other sections).
- **Content**: `SimilarClimbsList` -- a horizontal scrollable carousel of similar climbs.

**Similar Climbs details:**

- Fetched via GraphQL `SIMILAR_CLIMBS_QUERY` with Jaccard similarity threshold of 0.5, limit 10.
- Stale time: 5 minutes.
- Climbs are partitioned: compatible climbs (matching the viewer's `size_id`) come first, incompatible climbs are shown after with a dimmed appearance (`opacity` reduced via CSS `.dimmed` class).
- Each card shows:
  - Board thumbnail (canvas or image layers rendering, thumbnail mode)
  - Name (truncated, with title attribute for hover)
  - Formatted grade with color
  - Byline: setter username, quality rating, send count, joined by " · "
  - Ellipsis (`MoreVertOutlined`) button for actions (opens a single shared actions drawer)
- **Tap behavior**: When the queue is available and the climb is compatible, tapping calls `setCurrentClimb(climbStub)`, which activates the climb in the play drawer. When the queue is unavailable, falls back to a `LocaleLink` navigating to the climb's view page.
- **Empty state**: Localized message or "No similar climbs found on this layout".

---

### Nested Queue Drawer

#### Opening

Tapping the queue button in the action bar sets `isQueueOpen=true` and mounts the `QueueDrawer` component. The queue drawer can also be opened/closed programmatically by onboarding tour events (`TOUR_OPEN_PLAY_QUEUE_EVENT`, `TOUR_CLOSE_PLAY_QUEUE_EVENT`).

#### Layout

A `SwipeableDrawer` with `placement="bottom"`, `height="60%"`, `disablePortal` (stacks within the play view drawer), `swipeEnabled=false`, `showDragHandle=false`. Custom drag-to-resize is implemented via `useDrawerDragResize` hook.

**Custom drag header** (`div.queueDragHeader`, `touch-action: none`, `user-select: none`):
- Drag handle bar (horizontal pill, matching the standard drawer drag handle style).
- Title bar: "Queue" title (h6, semibold) on the left. Right side shows:
  - **Normal mode**: History toggle button (`HistoryOutlined`, bordered when active) + Edit button (`EditOutlined`).
  - **Edit mode**: "Clear" button (`DeleteOutlined` + text, clears entire queue) + Close edit button (`CloseOutlined`).

**Queue body** (`div.queueBodyLayout`, flex column):
- Scroll container (`div.queueScrollContainer`): `overflow-y: auto`, `-webkit-overflow-scrolling: touch`, `overscroll-behavior-y: contain`, `touch-action: pan-y`. Has pull-to-close gesture via `usePullToClose` hook.
- `QueueList` component renders the queue in three regions:
  - **History** (collapsible via history toggle, shown by default): Past climbs that have been played. Capped at 5 items with a "Show full history" toggle.
  - **Current** (highlighted): The currently active climb.
  - **Up next**: Future climbs in the queue + suggestions.
- **Bulk remove bar** (bottom, `flex-shrink: 0`): Appears when in edit mode with items selected. Full-width "Remove {N} items" button with `variant="contained"`, `color="error"`.

**On transition end (open):** After the open transition completes, the queue list scrolls to the current climb (`queueListRef.current.scrollToCurrentClimb()`) with a 100ms delay.

**On close:** Resets edit mode, selected items, and history visibility to default. Propagates to parent via `onTransitionEnd(false)`, which sets `queueMounted=false` after the close transition to unmount the component.

#### Interactions

- **Tap climb**: Sets the tapped climb as current, broadcasts to wall in party mode, closes the queue drawer via `PLAY_DRAWER_EVENT`.
- **Swipe on item** (handled by `QueueList` component): Left swipe reveals delete/edit/playlist actions, right swipe reveals favorite toggle.
- **Drag-and-drop reorder**: Items can be reordered by dragging (handled by `QueueList`).
- **Close**: Swipe down on the scroll container (pull-to-close), drag the header down past threshold, or tap outside (handled by drawer backdrop).

---

### Mobile Adaptation Notes

When implementing the Play View in React Native, the following adaptations are required:

#### Bottom Sheet

Replace the web `SwipeableDrawer` with a React Native bottom sheet library (e.g., `@gorhom/bottom-sheet` or `react-native-bottom-sheet`). The play view should open as a full-height bottom sheet.

- The `initialOpenWithoutAnimation` prop maps to the bottom sheet's `animateOnMount: false`.
- Nested drawers (queue, actions, playlist, light control) should use stacked bottom sheets or modal presentations.
- The pull-to-close gesture is handled natively by the bottom sheet library.

#### Board Carousel

- Use `react-native-gesture-handler` for swipe detection (replacing `react-swipeable`).
- Use `react-native-reanimated` for swipe animations (replacing CSS transitions).
- The peek animation (next/previous climb sliding in from edge) maps to an animated `translateX` on sibling views.
- The scroll-prevention logic (non-passive `touchmove` listener) is not needed; gesture handler's `simultaneousHandlers` and `waitFor` manage conflict between horizontal swipe and vertical scroll.

#### Zoom and Pan

- Replace `@use-gesture/react` with `react-native-gesture-handler`'s `PinchGestureHandler` and `PanGestureHandler`.
- Use `react-native-reanimated` shared values for scale and translation (replacing DOM `style.transform` manipulation).
- The floating reset button renders as an `Animated.View` with opacity transition.
- `touch-action` CSS is not applicable; gesture handler conflict resolution handles this natively.

#### Board Rendering

- The SVG board renderer should use `react-native-svg` (`<Svg>`, `<Image>`, `<Circle>` components).
- The canvas renderer path should use a `<Canvas>` from `@shopify/react-native-skia` or fall back to SVG.
- `preserveAspectRatio="xMidYMid meet"` maps directly to `react-native-svg`'s `preserveAspectRatio` prop.
- Background images use `<SvgImage>` with `href` pointing to CDN URLs.

#### Action Bar

- Reposition for thumb ergonomics. Consider a floating action bar at the bottom of the screen, or use the safe area inset to ensure buttons are reachable.
- The lightbulb long-press gesture uses `Pressable`'s `onLongPress` prop (500ms default, adjustable via `delayLongPress`).
- The angle selector drawer should use a right-side modal or bottom sheet.

#### Tick Bar

- Use `KeyboardAvoidingView` or the keyboard-aware bottom sheet variant to handle the comment field's keyboard appearance.
- The grade picker horizontal scroll maps to a `FlatList` with `horizontal={true}`.
- The "expand/collapse" toggle behavior translates directly.
- Haptic feedback (`expo-haptics`) on tick and attempt button presses.

#### Similar Climbs

- Replace the CSS horizontal scroller with a `FlatList` component with `horizontal={true}`, `showsHorizontalScrollIndicator={false}`.
- Each card is a `Pressable` with the board thumbnail rendered via the native SVG/canvas renderer in thumbnail mode.

#### Comments and Below-Fold Sections

- The collapsible sections map to an accordion component or `Animated.View` height transitions.
- Comment threading uses a `FlatList` (or `SectionList` for grouped threads) with reply indentation.
- The `startTransition` deferral pattern maps to `InteractionManager.runAfterInteractions()` for deferred section mounting.

#### URL Synchronization

- URL sync does not apply in React Native. Navigation state is managed by Expo Router's stack/modal navigation.
- Deep links to `/view/{uuid}` should push the play view screen onto the navigation stack.
- The "browser back closes drawer" behavior maps to the hardware back button handler on Android and the swipe-back gesture on iOS.

#### Wake Lock

- Replace the web Wake Lock API with `expo-keep-awake` (`activateKeepAwakeAsync()` / `deactivateKeepAwake()`).

#### Bluetooth / Lightbulb

- Web Bluetooth API is replaced by `react-native-ble-plx` or the shared `@boardsesh/ble-protocol` package.
- The lightbulb button behavior (connect, take control, release control) maps directly; only the BLE transport layer changes.

#### Double-Tap Favorite

- Use `react-native-gesture-handler`'s `TapGestureHandler` with `numberOfTaps={2}` for double-tap detection.
- The heart animation uses `react-native-reanimated`'s `withSpring` or `withTiming` for the scale/opacity burst effect.
- The `Animated.View` overlay with the heart icon should use `pointerEvents="none"`.
## E. Global Persistent Queue Control Bar and Session Mini Bar

The Queue Control Bar is the most complex persistent UI element in the application. It sits between the main content area and the bottom tab bar on all board pages, provides swipe-based queue navigation, quick tick logging, session management, and serves as the primary surface users interact with throughout a climbing session. This section documents every layer, interaction, state transition, and visual behavior in the web implementation, then maps each to the React Native equivalent.

---

### E.1 Queue Control Bar -- Overview

**Visibility rules:**
- Renders on all board-scoped pages (list, view, play, create) when the `GraphQLQueueProvider` is mounted.
- The bar is always present in the DOM once a board context exists. When there is no current climb and no active session, the bar still renders but shows the "Start Sesh" prompt in the session header and a blank swipe container.
- On `/view/{uuid}` routes, the bar seeds the play drawer as open on initial render (no slide-in animation) via `initialOpenWithoutAnimation`.

**Structural layers (top to bottom within the MUI Card):**
1. **Session Header Row** -- collapsible via CSS grid transition; collapses when tick mode is active
2. **Tick Row** -- collapsible via CSS grid transition; expands when tick mode is active
3. **Swipe Container** -- the main bar with climb thumbnail, title, and action buttons

**Reconnect state:** When the WebSocket connection is in `reconnecting`, `stale`, or `error` state (and the browser is online), the entire bar renders a special reconnect view instead of the normal three-layer structure. This shows a spinner, reconnect message, and cancel button.

**Card styling:**
- Mobile (`< 768px`): Full-width with 12px horizontal margin, 4px border-radius, no top border, subtle shadow (`0 2px 8px rgba(0,0,0,0.12)`)
- Desktop (`>= 768px`): Max-width 480px, centered, 16px border-radius, 1px solid border, deeper shadow
- Dark mode: Border color shifts to `rgba(255,255,255,0.1)`, shadow opacity increases

**Root element:** `id="onboarding-queue-bar"`, class `queue-bar-shadow`, `data-testid="queue-control-bar"`.

---

### E.2 Session Header Row

The session header row is a strip that sits at the top of the card. It uses CSS grid row collapse (`grid-template-rows: 0fr` to `1fr`) with a 200ms ease-out transition so it smoothly collapses when tick mode activates and smoothly re-expands when tick mode deactivates.

#### E.2.1 Layout when session is active

```
[Session Name (flex:1)]  [Avatar Group / Close Button]  [Queue Badge Icon]
```

- **Session name:** Truncated with ellipsis, 12px font, weight 600. Displays `persistentSession.name` or `activeSession.sessionName` or a generated name via `generateSessionName(startedAt, [boardName])`.
- **Avatar group:** Shows up to 3 participants via MUI `AvatarGroup` (28x28 avatars, 11px font, 2px transparent border). Each avatar is a `TickBadgeAvatar` component.
- **Queue badge icon:** `FormatListBulletedOutlined` icon (18px) wrapped in a `Badge` showing `queue.length`, max 99, primary color. The badge uses `themeTokens.badge.small` styling.

**Tap targets:**
- Tap anywhere on the session header row (outside avatar group and queue icon) -> dispatches `SESH_SETTINGS_DRAWER_EVENT` which opens the session settings drawer in the global header
- Tap avatar group area -> toggles `participantsExpanded` state (expands/collapses participant bar below)
- Tap queue badge icon -> opens queue drawer (`setActiveDrawer('queue')`)

**Background color:** Uses `sessionTintColor` (derived from current climb grade via `getGradeTintColor(difficulty, 'session', isDark)`), falls back to transparent (dark) or `var(--semantic-surface)` (light).

**Visual treatment:**
- 4px vertical padding, 12px horizontal padding
- Bottom border: `1px solid rgba(0,0,0,0.06)` (light), `rgba(0,0,0,0.3)` (dark)
- Box shadow: `0 2px 4px rgba(0,0,0,0.08)` (light), `0 2px 4px rgba(0,0,0,0.25)` (dark)
- Hover (pointer devices): `filter: brightness(0.95)` (light), `brightness(1.1)` (dark)
- Active press: `filter: brightness(0.9)` (light), `brightness(1.15)` (dark)

#### E.2.2 Layout when no session is active

```
[Play circle icon]  [Start Sesh text (flex:1)]  [Queue Badge Icon]
```

- `PlayCircleOutlineOutlined` icon (16px, 70% opacity) followed by "Start Sesh" text
- Entire row is tappable -> opens `StartSeshDrawer`
- Uses `gradeTintColor` background instead of `sessionTintColor`
- Row is right-justified (`justifyContent: 'flex-end'`)

#### E.2.3 Offline banner overlay

When `isDisconnected` is true and the user has not dismissed the banner, an absolute-positioned overlay covers the session header row:

```
[CloudOffOutlined icon (14px)]  [Offline message text]  [CloseOutlined icon (14px, 60% opacity)]
```

- Background: `rgba(245,245,245,0.85)` with 20px blur (light), `rgba(40,40,40,0.85)` with blur (dark)
- Font: `0.8rem`, neutral-600 color
- Tap anywhere on the banner dismisses it (sets `dismissedDisconnect = true`)
- `dismissedDisconnect` resets to false when connection is restored

**Offline message text varies:**
- No session: `t('queueBar.offline.idle')`
- Session with >1 user: `t('queueBar.offline.party')`
- Solo session: `t('queueBar.offline.solo')`

#### E.2.4 Expandable participant bar

Appears below the session header when `participantsExpanded` is true. Uses CSS grid row collapse with 200ms transitions on `grid-template-rows`, `opacity`, and `border-bottom-color`.

**When there is only 1 participant (solo session):**
- Shows invite copy text + share icon button
- QR code (`QRCodeSVG`, 140px, level "M", margin 4) for the session join URL (`/join/{sessionId}`)
- Share button triggers `shareWithFallback` with the session URL

**When there are multiple participants:**
- Horizontal scrolling row of participant chips
- Each chip: `TickBadgeAvatar` (32px) + username text below (10px, max-width 56px, centered, truncated)
- Row padding: 8px vertical, 12px horizontal when expanded
- Scrollbar hidden (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`)
- 12px gap between participant chips

#### E.2.5 TickBadgeAvatar component

Each avatar can show up to two badge overlays composited together:

1. **Tick badge (bottom-right):** Green circle (16x16, `themeTokens.colors.success`) with white `CheckOutlined` icon (10px). Visible when the participant has ticked the current climb. Determined by merging backend `tickedBy` array on the queue item with locally tracked `localTickedClimbs` set.

2. **Driver badge (top-right):** Primary-colored circle with white `Lightbulb` icon (10px). Visible when the participant's `id` matches `driverParticipantId`. Uses `themeTokens.badge.small` sizing.

Both badges can appear simultaneously on the same avatar.

#### E.2.6 Participant deduplication and driver sorting

Session users are deduplicated by `userId` (stable DB UUID), falling back to connection `id` for unauthenticated users. After dedup, the driver is floated to position 0 in the array so the driver's avatar (with its lightbulb badge) always appears first in the AvatarGroup. Non-drivers keep their existing order (stable sort).

---

### E.3 Swipe Container (Main Bar)

The swipe container is the primary interaction surface. It renders the current climb's thumbnail, title/grade, and action buttons.

#### E.3.1 Layout

```
[Board Preview (44px)]  [gap]  [Text Swipe Clip (flex:1)]  [gap]  [Button Cluster]
```

**Board preview container:** Fixed 44px width, flex-shrink 0. Contains `ClimbThumbnail` which renders a miniature board with highlighted holds. On enter animation (after swipe navigation), applies a 120ms `thumbnailFadeIn` keyframe animation (scale 0.85 -> 1, opacity 0 -> 1).

**Text swipe clip:** `overflow: hidden`, `flex: 1`, `min-width: 0`, `position: relative`. Contains the current climb text (which slides with the swipe gesture) and the peek text (absolutely positioned, slides in from the edge during swipe).

**Button cluster:** `flex: none`, stacked horizontally with 4px spacing. Content varies by breakpoint and tick mode state.

#### E.3.2 Background color

The swipe container background dynamically changes based on the current climb's difficulty grade:
- `getGradeTintColor(displayedClimb?.difficulty, 'default', isDark)` computes a grade-specific tint color
- Fallback: transparent (dark mode) or `var(--semantic-surface)` (light mode)
- Padding: `themeTokens.spacing[2]` vertical, `themeTokens.spacing[3]` horizontal

When tick mode is active, the `displayedClimb` is frozen to the climb that was current when tick mode was entered (`tickClimb`), preventing the grade tint from changing if another user advances the queue.

#### E.3.3 Swipe navigation

Horizontal swipe on the main bar navigates between queue items. Implemented via `useCardSwipeNavigation` hook which wraps `react-swipeable`.

**Parameters:**
- `threshold`: 80px (distance to trigger navigation)
- `delayNavigation`: true (navigation fires after exit animation completes, not immediately)
- `canSwipeNext`: `!viewOnlyMode && !!nextClimb && !tickBarActive`
- `canSwipePrevious`: `!viewOnlyMode && !!previousClimb && !tickBarActive`
- Touch action: `pan-y` (vertical scroll is native; horizontal swipe is JavaScript-controlled)

**Animation timing constants:**
- `EXIT_DURATION`: 300ms -- card slides off-screen
- `SNAP_BACK_DURATION`: 200ms -- card snaps back if threshold not met
- `CLIP_EXIT_DURATION`: 100ms -- text leaves the narrow clip area faster than the full exit
- `ENTER_ANIMATION_DURATION`: 170ms -- enter crossfade after navigation completes

**Swipe states:**
- `swipeOffset` (number): Current horizontal pixel offset of the text
- `isAnimating` (boolean): True during exit/enter animation
- `animationDirection` ('left' | 'right' | null): Direction of exit animation
- `enterDirection` ('from-left' | 'from-right' | null): Direction of enter crossfade

**Text transition logic:**
- During enter animation: `transition: 'none'` (snap instantly)
- During exit animation: `transform {EXIT_DURATION}ms ease-out`
- When swipe offset returns to 0: `transform {SNAP_BACK_DURATION}ms ease-out`
- During active swipe: `transition: 'none'` (follow finger directly)

**Peek behavior:**
The peek text shows the next or previous climb sliding in from the opposite edge during swipe:
- Next climb peeks from the right: `translateX(max(0px, calc(100% + {swipeOffset}px)))`
- Previous climb peeks from the left: `translateX(min(0px, calc(-100% + {swipeOffset}px)))`
- The `max(0px, ...)` / `min(0px, ...)` clamping prevents the peek text from overshooting past position 0
- Peek text is `pointer-events: none`, `cursor: default`

**Swipe hint animation:**
On first load for touch devices (`pointer: coarse`), a one-time swipe hint plays to teach users about horizontal navigation:
- Checks `getPreference<boolean>('swipeHint:queueBarSeen')` from IndexedDB
- If not seen: after 800ms delay, the element with `id="onboarding-queue-toggle"` peeks left twice
  - Each peek: slide to `translateX(-40px)` over 350ms ease-out, hold 500ms, slide back over 250ms ease-out
  - Two peeks with 300ms gap between them
- After completing, sets `setPreference('swipeHint:queueBarSeen', true)` to prevent future replays
- Skipped if tick mode is active or no current climb exists
- All animations are cancellable via `AbortController`-style cleanup

#### E.3.4 Thumbnail interaction

Tap thumbnail -> dispatches `PLAY_DRAWER_EVENT` (no climb payload) to open the play-view drawer in wall-view mode. The drawer reads `currentClimbQueueItem` directly. Disabled when `viewOnlyMode` is true or no current climb exists.

#### E.3.5 Title interaction

Tap the title/grade area (the `onboarding-queue-toggle` element):
- Same behavior as thumbnail tap: opens play-view drawer via `dispatchOpenPlayDrawer()`
- **Disabled during tick mode:** When `tickBarActive` is true, the title has no `role`, `tabIndex`, or click handler -- it becomes non-interactive
- Tracks `'Play Drawer Opened'` analytics event with `source: 'bar_tap'`

#### E.3.6 Button cluster

Buttons are laid out in a horizontal `Stack` with 4px spacing. Visibility depends on breakpoint and mode:

| Button | Mobile (<768px) | Desktop (>=768px) | Tick Mode |
|--------|----------------|-------------------|-----------|
| Mirror | Hidden | Visible (if board supports mirroring) | Same |
| Play mode link | Hidden | Visible (if not already on /play/) | Same |
| Nav prev/next | Hidden | Visible | Same |
| Attempt | Hidden | Hidden | Visible |
| Tick | Visible | Visible | Visible (saves tick) |

**Mirror button:** `SyncOutlined` icon. When mirrored state is active: purple background (`themeTokens.colors.purple`), white icon, primary color. Calls `mirrorClimb()` and tracks `'Mirror Climb Toggled'`.

**Play mode link:** `OpenInFullOutlined` icon wrapped in `LocaleLink` to the play URL. Tracks `'Play Mode Entered'`.

**Navigation buttons (desktop only):** Two `QueueNavButton` components -- previous (`FastRewindOutlined`) and next (`FastForwardOutlined`). Each calls `setCurrentClimbQueueItem(target)` where target is from `getPreviousClimbQueueItem()` or `getNextClimbQueueItem()`. Also tracks `'Queue Navigation'` and `'Wall Advance'` analytics events.

**Attempt button (tick mode only):** `PersonFallingIcon` with error-muted background (`themeTokens.colors.errorMuted`), error-colored icon. Calls `quickTickBarRef.current?.saveAttempt(element)`. Wrapped in `TickButtonWithLabel` with label text.

**Tick button:** Persistent `TickButton` component. Behavior depends on state:
- **No tick mode active + authenticated:** Tap activates tick mode (`setActiveDrawer('tick')`)
- **Tick mode active:** Tap saves the tick (`quickTickBarRef.current?.save(element)`)
- **Not authenticated:** Either opens external Aurora app URL or shows sign-in drawer
- Shows ascent badge count from logbook
- Icon changes based on `isFlash` and `ascentType` state

---

### E.4 Quick Tick Mode (Tick Row)

The tick row is a collapsible panel between the session header and the swipe container. It uses the same CSS grid row collapse pattern (`grid-template-rows: 0fr/1fr`) as the session header, with 200ms ease-out transitions on both `grid-template-rows` and `opacity`.

#### E.4.1 Entry and exit

**Entry:** `setActiveDrawer('tick')` sets `tickBarActive = true`, which:
1. Sets `tickRowVisible = true` (keeps DOM mounted)
2. Collapses the session header row (removes `sessionHeaderExpanded` class)
3. Expands the tick row (adds `tickRowExpanded` class)
4. Restores persisted expanded state from `getPreference<boolean>('tickBarExpanded')`
5. Closes expanded participants panel
6. Snapshots the current climb into `tickClimb` so the bar stays frozen on it

**Exit:** `setActiveDrawer('none')` sets `tickBarActive = false`, which:
1. Resets `tickSwipeOffset` to 0
2. Resets `isFlash` to false
3. Resets `ascentType` to 'send'
4. Resets `tickBarExpanded` to false
5. After 200ms delay (to let collapse animation play): sets `tickRowVisible = false`, clears `tickComment` and `tickCommentFocused`

**Backdrop overlay:** When tick mode is active, a full-screen fixed overlay is rendered via `createPortal` to `document.body`:
- Background: `var(--overlay-light)`
- z-index: 9
- 200ms opacity transition
- Tap anywhere on overlay dismisses tick mode
- `pointer-events: auto` only when active

#### E.4.2 Layout

```
[Drag Handle Bar (centered, absolute)]
[Toolbar: [Expand/Collapse button (left)]  [Close button (right)]]
[QuickTickBar controls]
[Comment field]
```

**Drag handle bar:** Centered absolute element -- 36px wide, 4px tall, 2px border-radius, `var(--neutral-200)` background (dark: `var(--neutral-500)`). Visual-only grab indicator at the top of the tick row.

**Toolbar row:** Flex row with space-between alignment.
- Left: Expand/collapse button with up/down chevron icon (16px, 70% opacity) + text label ("More" / "Less"), 12px font, weight 600
- Right: Close button -- `CloseOutlined` (16px) with `action.selected` background, `action.focus` hover, 2px padding

**QuickTickBar:** The `QuickTickBar` component manages tick form state:
- **Tick target:** Snapshots the climb on first render so edits to grade/quality persist even if the wall climb changes
- **Quality:** Star rating (null by default)
- **Difficulty:** Grade override (undefined by default, uses climb grade)
- **Attempt count:** Number input starting at 1
- **Ascent type:** Derived -- flash if no prior history and 1 attempt, otherwise send

**Compact layout (default):**
```
[Comment input (flex:1)]  [Grade button]  [Star picker]  [Tries picker]
```

**Expanded layout:**
```
[Full-height comment field]
[Grade picker (scrollable)]
[Star picker]
[Tries picker]
[Ascent type toggle]
```

Each picker section has `data-scrollable-picker` attribute to prevent swipe-to-dismiss gestures from interfering with horizontal scroll in grade pickers.

#### E.4.3 Comment field

**Compact mode:**
- Inline `TextField` -- single line, `minRows: 1`, `maxRows: 1` (expands to 4 when focused)
- `ChatBubbleOutlineOutlined` start adornment (16px, 50% opacity)
- Max length: 2000 characters
- When focused (`tickCommentFocused: true`): Container gets `position: relative`, `height: 40px`, `z-index: 2`. The TextField inside is absolutely positioned so it grows downward over the queue bar without reflowing the tick row.

**Expanded mode:**
- Separate `TextField` -- `minRows: 2`, `maxRows: 4`
- No start adornment icon
- Same max length and styling

#### E.4.4 Vertical swipe behavior

The tick row supports vertical swipe-to-dismiss gestures via `react-swipeable`:

**Swipe tracking:**
- `tickSwipeOffset` tracks vertical displacement in pixels
- Swipe is disabled when comment field is focused (`tickCommentFocused`) or tick mode is inactive
- Horizontal swipe is ignored (`Math.abs(deltaX) > Math.abs(deltaY)`)
- Targets with `[data-scrollable-picker]` attribute are excluded

**Compact mode swipe thresholds:**
- Swipe up >= 50px: Expand tick bar (`handleTickBarExpandedChange(true)`)
- Swipe down >= 80px: Dismiss tick mode entirely (`setActiveDrawer('none')`)
- Both directions tracked for visual feedback

**Expanded mode swipe thresholds:**
- Swipe down >= 120px (or velocity > 0.5): Dismiss tick mode entirely
- Swipe down >= 50px: Collapse to compact (`handleTickBarExpandedChange(false)`)
- Swipe up: No action (already expanded)
- Only downward offset tracked for visual feedback

**Visual feedback during downward swipe:**
- `gridTemplateRows` shrinks: `fraction = max(0, 1 - offset/150)`, applied as `${fraction}fr`
- `opacity` fades: same fraction value
- `transition: none` during active swipe (follows finger directly)
- Spring-back on release: resumes `transition: grid-template-rows 200ms ease-out, opacity 200ms ease-out`

**Expanded state persistence:**
- `handleTickBarExpandedChange(expanded)` stores the value in `setPreference('tickBarExpanded', expanded)` (IndexedDB)
- On next tick mode entry, the persisted value is restored

#### E.4.5 Tick submission

**Save (via tick button or save trigger):** Calls `quickTickBarRef.current?.save(originElement)` which:
1. Builds the tick payload (quality, difficulty, attempt count, comment, ascent type)
2. Calls `saveTick` mutation
3. On success: adds climb UUID to `localTickedClimbs` set (for tick badge display), calls `onSave` which dismisses tick mode
4. Shows confirmation animation (confetti from origin element position)
5. On error: calls `onError` which shows snackbar `t('queueBar.tickError')`

**Save attempt:** Calls `quickTickBarRef.current?.saveAttempt(originElement)` -- same flow but ascent type is forced to 'attempt'.

---

### E.5 Reconnect View

When `isReconnecting` is true (session exists, not fully disconnected, connection state is `reconnecting`/`stale`/`error`), the entire card renders a reconnect-specific layout:

**Reconnect row:**
```
[CircularProgress (16px, thickness 5)]  [Message text]  [Cancel button]
```

- Message: "Connection error" or "Reconnecting..." depending on `connectionState`
- Cancel button: `MuiButton` text variant, small size

**Confirm row (after tapping cancel):**
```
[Confirmation text]  [Leave button (error color, CloseOutlined)]  [Keep button (CheckOutlined)]
```

- Leave button calls `handleLeaveSession()` which tries `endSession()`, falls back to `disconnect()`, shows warning snackbar on failure
- Keep button dismisses the confirm row

The reconnect view still shows the climb thumbnail (using the same grade tint background) but replaces the title area with the reconnect/confirm UI.

---

### E.6 Queue Drawer (Expanded Queue List)

#### E.6.1 How it opens

- Tap queue badge icon in session header
- Tap queue button in play-view action bar
- Opens as a `SwipeableDrawer` from the bottom, 60% height, with drag-to-resize handle

#### E.6.2 Drawer header

```
[Drag handle zone (horizontal)]
[Title "Queue" (left)]  [History toggle | Edit | Clear | Close (right)]
```

**Header actions (non-edit mode):**
- History toggle: `HistoryOutlined` icon button -- when active, shows bordered style (`border: 1px solid divider`). Toggles `showHistory` state.
- Edit button: `EditOutlined` icon -- enters edit mode

**Header actions (edit mode):**
- Clear all: `DeleteOutlined` icon + "Clear" text button -- removes all items from queue
- Close edit: `CloseOutlined` icon -- exits edit mode

**Header styling:** `themeTokens.spacing[4]` vertical padding, `themeTokens.spacing[6]` horizontal padding, bottom border `1px solid var(--neutral-200)`.

#### E.6.3 Queue list structure (virtualized)

The `QueueList` component uses `@tanstack/react-virtual` (`useVirtualizer`) with a flat row model. All row types are flattened into a single discriminated union array (`FlatRow[]`):

**Row types in order:**

| Row Type | Height Estimate | Description |
|----------|----------------|-------------|
| `history-show-all` | 44px | "Show full history" button (shows count of hidden items) |
| `history-item` | 102px | Past climbs, 60% opacity |
| `history-divider` | 17px | MUI Divider separating history from current |
| `current-item` | 102px | Highlighted current climb, grade tint background |
| `future-item` | 102px | Upcoming queue items |
| `suggestion-header` | 36px | "Next up" overline text |
| `suggestion` | 102px | Similar climbs from search/playlist |
| `loading` | 220px | Three-row skeleton placeholder |
| `end-message` | 52px | "No more climbs" disabled text |

**Virtualizer configuration:**
- Overscan: 10 items
- Scroll element: External ref from parent (for drawer resize coordination)
- Item keys: `q-{uuid}` for queue items, `s-{uuid}` for suggestions, static strings for meta rows
- Items use `contain: layout style paint` and absolute positioning with `translateY` for performance

**History display:**
- Default limit: `DEFAULT_HISTORY_DISPLAY_LIMIT = 5` most recent history items
- "Show full history" button shows hidden count and expands to show all
- `showFullHistory` resets to false when the drawer becomes inactive (`active` prop transitions to false)

**Scroll-to-current:** On drawer open (after 100ms transition delay), `scrollToIndex(scrollTargetFlatIndex, { align: 'center', behavior: 'smooth' })` centers the current item.

**Suggestions (infinite scroll):**
- Only rendered when `active && !viewOnlyMode`
- Loads from either playlist suggestions or search suggestions
- Loading state shows three skeleton rows (64x60 thumbnail + text + 32x32 button placeholder)
- Suggestion thumbnail tap calls `previewClimbFromBrowse(climb)` -- in solo, sends to wall; in party, previews locally

#### E.6.4 Queue item row (QueueClimbListItem)

Each queue item wraps `ClimbListItem` with queue-specific behavior:

**Visual states:**
- **Current item:** Grade tint background via `getGradeTintColor(difficulty, 'light', isDark)`, fallback to `var(--semantic-selected)`
- **History item:** `var(--neutral-100)` background, 60% content opacity
- **Future item:** Transparent background, full opacity

**Content layout:**
```
[Thumbnail (64px)]  [Climb Title + Grade + Setter]  [After-title slot]  [Three-dot menu]
```

**After-title slot varies:**
- **History items:** Tick badge -- `TickIcon` wrapped in `MuiBadge` showing ascent count. Badge color: green (`themeTokens.colors.success`) for successful ascent, red (`themeTokens.colors.error`) for attempts only. Tap opens tick drawer for that climb.
- **Current + future items:** Attribution avatar -- `MuiAvatar` (24x24) showing the user who added the climb (`addedByUser.avatarUrl`) with tooltip. If no user info, shows Bluetooth icon (climb was added via BLE board).
- **Editable items:** Edit button (`EditOutlined`, 16px) appears before the trailing element, routed to `/b/{boardSlug}/{angle}/create?editClimbUuid={uuid}`.

**Swipe gestures (non-edit mode):**

| Direction | Threshold | Action | Visual |
|-----------|-----------|--------|--------|
| Swipe left (short, 60px) | 60px | Primary action: opens actions drawer | Primary color background |
| Swipe left (long, 150px) | 150px | Secondary action: opens playlist selector | Neutral-600 background |
| Swipe right | 60px | Tick the climb | Green (`themeTokens.colors.success`) background + white CheckOutlined icon |

Note: Queue items override the default swipe-right action (which would be "add to queue" on non-queue list items) to "tick" instead, since items are already in the queue.

**Tap interactions:**
- Single tap: `setCurrentClimbQueueItem(item)` -- makes this the active climb
- Thumbnail tap: `setCurrentClimbQueueItem(item)` then `dispatchOpenPlayDrawer()` -- sets active and opens play drawer

**Drag-and-drop reorder (non-edit mode):**
Each item registers as both a `draggable` source and a `dropTargetForElements` using `@atlaskit/pragmatic-drag-and-drop`:
- `draggable` provides `{ index, id: item.uuid }` as initial data
- Drop target uses `attachClosestEdge` with `allowedEdges: ['top', 'bottom']`
- During drag, `DropIndicator` renders at the closest edge (top or bottom)
- On drop, `monitorForElements` at the list level computes new order via `reorder()` from `@atlaskit/pragmatic-drag-and-drop/reorder` and calls `setQueue(newQueue)`

**Edit mode:**
- Checkbox appears left of each item
- Tap anywhere toggles selection
- Drag-and-drop is disabled
- Swipe gestures are disabled
- Selected items can be bulk-removed via the sticky bar at the bottom

#### E.6.5 Shared drawers (performance optimization)

The queue list uses a shared-drawer pattern instead of per-item drawers:

1. **One global actions drawer:** `actionsClimb` state holds the climb; drawer mounts only when non-null. Contains `ClimbActions` with excluded actions computed via `getExcludedClimbActions(boardName, 'list')`.

2. **One global playlist selector drawer:** `playlistClimb` state; `PlaylistSelectionContent` inside a SwipeableDrawer.

3. **One global tick drawer:** `tickClimb` + `tickDrawerVisible` state; renders `LogAscentDrawer` when authenticated, sign-in prompt when not.

This avoids 100+ nested drawer trees that would result from rendering a drawer per queue item.

#### E.6.6 Drawer interactions

- **Drag-to-resize:** `useDrawerDragResize` hook manages height changes by dragging the handle
- **Pull-to-close:** `usePullToClose` hook handles downward-swipe-to-close on the scroll container
- **Close cleanup:** Resets edit mode, selected items, and show-history state to defaults

---

### E.7 Session Overview Panel (Session Details)

The `SessionOverviewPanel` component renders session statistics and can appear in two modes.

#### E.7.1 Compact mode

Renders when `compact={true}`, typically within the sesh-settings drawer or session header expansion:

```
[Board Thumbnail (90px square)]  [Board Name (bold)]
                                  [Angle Selector dropdown]
```

- Board thumbnail: `BoardRenderer` with `thumbnail fillHeight` mode, 6px border-radius, `var(--neutral-100)` background, subtle shadow
- Board name: `body2` typography, weight 600. Shows `namedBoardName` or capitalized `boardDetails.board_name`
- Angle selector: `AngleSelector` component with current angle and available angles for the board

After the board info, renders `afterParticipants` slot (participant list) and goal (if set).

#### E.7.2 Full mode

Renders when `compact={false}`, shows all session statistics:

**Stats chips (wrapped flex row, 8px gap):**

| Chip | Condition | Style |
|------|-----------|-------|
| Flashes | `totalFlashes > 0` | `bgcolor: success.main`, `color: success.contrastText`, `FlashOnOutlined` icon |
| Sends (excluding flashes) | `totalSends - totalFlashes > 0` | `color="primary"`, `CheckCircleOutlineOutlined` icon |
| Attempts | `totalAttempts > 0` | `variant="outlined"`, `ErrorOutlineOutlined` icon |
| Duration | `durationMinutes > 0` | `variant="outlined"`, `TimerOutlined` icon. Format: `Xm` for <60min, `Xh Ym` otherwise |
| Climb count | Always | `variant="outlined"`, text only |
| Hardest grade | `hardestGrade` exists | `variant="outlined"`, formatted via `useGradeFormat`. Shows skeleton while grade format loads |

**Session goal (if set):**
```
[FlagOutlined (16px, action color)]  [Goal text (body2, text.secondary)]
```

**Board types (if any):**
```
[Chip per board type, capitalized, small, outlined]
```

**Grade distribution chart (if data exists):**
- `CssBarChart` component inside a `Card`
- Height: 160px (desktop), 120px (mobile)
- Gap: 3px between bars
- Bars built via `buildSessionGradeBars(gradeDistribution, formatGrade)`
- Legend below chart: colored squares (10x10, 2px border-radius) + caption text, centered, 12px gap

#### E.7.3 Summary parts builder

`buildSessionSummaryParts()` function creates a condensed string array for collapsed display:
- "X flashes" (if any)
- "X sends" (non-flash sends, if any)
- "X attempts" (if any)
- "X climbs" (always)
- "Hardest: {grade}" (if exists, formatted via `formatGrade`)

---

### E.8 Queue State Management (QueueContext)

The `GraphQLQueueProvider` is the central state manager. It uses a reducer pattern with fine-grained context splits for performance.

#### E.8.1 Context architecture (six separate contexts)

| Context | Data | Re-render trigger |
|---------|------|-------------------|
| `CurrentClimbContext` | `{ currentClimb, currentClimbQueueItem }` | Wall climb changes |
| `CurrentClimbUuidContext` | `string \| null` | Only the UUID string changes |
| `QueueListContext` | `{ queue, suggestedClimbs }` | Queue array or suggestions change |
| `SearchContext` | `{ searchParams, results, counts, fetching states }` | Search state changes |
| `SessionContext` | `{ viewOnlyMode, connectionState, sessionId, users, ... }` | Session metadata changes |
| `QueueActionsContext` | All action functions | Never (stable identity) |

The combined `QueueContext` still exists for backward compatibility and the queue-bridge plumbing.

#### E.8.2 State shape

```typescript
type QueueState = {
  queue: ClimbQueueItem[]              // All items (history + current + future)
  currentClimbQueueItem: ClimbQueueItem | null  // The climb on the wall
  climbSearchParams: SearchRequestPagination    // Filter/sort state
  playlistSuggestionSource: PlaylistSuggestionSource | null
  hasDoneFirstFetch: boolean
  needsResync: boolean
  pendingCurrentClimbUpdates: Map<string, ...>
  optimisticDriverParticipantId: string | null
}
```

#### E.8.3 Key actions

| Action | Behavior |
|--------|----------|
| `addToQueue(climb, source)` | Creates `ClimbQueueItem` with UUID, dispatches `DELTA_ADD_QUEUE_ITEM`, broadcasts via persistent session if connected, buffers if offline |
| `removeFromQueue(item)` | Dispatches `DELTA_REMOVE_QUEUE_ITEM`, broadcasts removal |
| `setCurrentClimb(climb, options)` | Creates item, dispatches `DELTA_UPDATE_CURRENT_CLIMB` with `insertAfterCurrent: true`, broadcasts, returns the new item |
| `setCurrentClimbQueueItem(item)` | Sets an existing queue item as current (no new item creation) |
| `previewClimbFromBrowse(climb)` | Solo/driver: calls `setCurrentClimb` + opens drawer. Party non-driver: opens drawer with preview only (no wall mutation) |
| `mirrorClimb()` | Toggles mirrored flag on current climb, dispatches `DELTA_MIRROR_CURRENT_CLIMB` |
| `takeControl(climb?)` | Claims driver authority. Solo: degrades to `setCurrentClimb`. Party: calls server `takeControl` mutation, dispatches optimistic `OPTIMISTIC_SET_DRIVER` |
| `releaseControl()` | Releases driver authority (party only, no-op in solo) |
| `setQueue(newQueue)` | Bulk replace after reorder, broadcasts full queue via `persistentSession.setQueue()` |
| `getNextClimbQueueItem(options?)` | Walk forward: queue first, then suggestions. With `suggestionsOnly: true`, walks only suggestions (non-driver party path) |
| `getPreviousClimbQueueItem(options?)` | Walk backward: queue only by default. With `suggestionsOnly: true`, walks suggestions backward |
| `replaceQueueItem(uuid, climb)` | Replace an existing item's climb (used by create form during edit) |
| `fetchMoreClimbs()` | Trigger next page of search results for suggestions |

#### E.8.4 Queue restoration

On mount, the queue state is restored from one of two sources:

1. **Persistent session (party mode):** When `isPersistentSessionActive && hasConnected`, dispatches `INITIAL_QUEUE_DATA` with `persistentSession.queue` and `persistentSession.currentClimbQueueItem`.

2. **In-memory bridge (solo, SPA navigation):** When no party session and `isLocalQueueLoaded && localBoardPath === baseBoardPath`, restores from `persistentSession.localQueue` and `localCurrentClimbQueueItem`.

#### E.8.5 Real-time sync via queue event subscription

The `useQueueEventSubscription` hook subscribes to `persistentSession.subscribeToQueueEvents()` and dispatches reducer actions:

| Server Event | Reducer Action |
|-------------|----------------|
| `FullSync` | `INITIAL_QUEUE_DATA` with full queue + current climb |
| `QueueItemAdded` | `DELTA_ADD_QUEUE_ITEM` with item and optional position |
| `QueueItemRemoved` | `DELTA_REMOVE_QUEUE_ITEM` with uuid |
| `QueueReordered` | `DELTA_REORDER_QUEUE_ITEM` with uuid, oldIndex, newIndex |
| `CurrentClimbChanged` | `DELTA_UPDATE_CURRENT_CLIMB` with current item, server event flag, client/correlation IDs for echo suppression |
| `ClimbMirrored` | `DELTA_MIRROR_CURRENT_CLIMB` with mirrored flag and mirroredUuid for race-condition guard |

**Echo suppression:** When `CurrentClimbChanged` arrives from the server with a `correlationId` matching a locally-dispatched pending update, the event is suppressed to prevent double-application.

**Resync mechanism:** When `needsResync` flag is set (corrupted data detected), triggers `persistentSession.triggerResync()` and clears the flag.

#### E.8.6 Offline handling

**Offline queue buffer:**
- `useOfflineQueueBuffer` hook maintains an array of items added while disconnected
- Buffer limit exists; shows warning snackbar when full
- Synced to `persistentSession.offlineBufferRef` for FullSync merge

**Offline reconciliation:**
- `useOfflineReconciliation` hook pushes buffered additions on reconnect
- Watches `isDisconnected`, `isPersistentSessionActive`, `hasConnected`, `users`

**Mutation guard:**
- `useMutationGuard` returns `viewOnlyMode` and `canMutate`
- `viewOnlyMode` is true when connected to a session but can't mutate (e.g., read-only viewer)
- `guardMutation()` returns true (blocks) when mutation is not allowed; callers check and early-return

#### E.8.7 Driver state

- `driverParticipantId`: Server-authoritative participant ID of the wall driver. Overlaid with `optimisticDriverParticipantId` during the brief window between `takeControl` call and `DriverChanged` broadcast landing.
- `isDriver`: Derived via `deriveIsDriver({ isPersistentSessionActive, participantId, driverParticipantId })`. True in solo mode. In party, true only when local participant matches driver.
- **Driver handoff toasts:** When `DriverChanged` event arrives and the new driver is not the local user, a toast surfaces who took control: "X took control", "X took control from you", or "X is now driving".

---

### E.9 Play-View Drawer Integration

The `PlayViewDrawer` is rendered from the queue control bar but documented separately. Key integration points:

- `activeDrawer === 'play'` controls open state
- `drawerDisplayedItem` state holds a climb when opened via browse (non-driver party preview) or direct `/view/{uuid}` hit
- Reset to null on drawer close and when `activeDrawer` leaves 'play'
- `PLAY_DRAWER_EVENT` listener stores climb payloads for preview mode

**MiniSessionBar** (inside the play-view drawer):
- Morphs between four states: non-driver on wall, non-driver drifted, driver, solo/no party
- Non-driver drifted shows back-button to return to wall climb
- Driver shows lit lightbulb + "DRIVING" text
- Audience AvatarGroup on the right side
- Warm whisper tint background: `color-mix(in srgb, warning 5%, transparent)`

---

### E.10 Mobile Adaptation Notes

#### E.10.1 Queue control bar positioning

- Render as a persistent bottom bar using absolute/fixed positioning above the Expo Router tab bar
- Use `react-native-safe-area-context` for bottom inset handling
- The bar should be part of the tab layout's persistent UI, not per-screen

#### E.10.2 Swipe navigation

Replace `react-swipeable` (DOM-based) with `react-native-gesture-handler` `PanGestureHandler`:
- Configure `activeOffsetX` to match the 80px threshold
- Use `Gesture.Pan()` from RNGH v2 with `failOffsetY` to let vertical scroll pass through
- Map `swipeOffset` to a `react-native-reanimated` `useSharedValue` for 60fps tracking
- Exit and snap-back animations: `withTiming` with matching durations (300ms exit, 200ms snap)

**Peek behavior:** Use `Animated.View` with `translateX` transform driven by the shared value. Clamp via `interpolate()` with `Extrapolation.CLAMP`.

**Swipe hint:** Replace DOM `animate()` with Reanimated `withSequence` + `withDelay` + `withTiming`. Replace IndexedDB check with AsyncStorage (`@react-native-async-storage/async-storage`).

#### E.10.3 Tick row expand/collapse

Replace CSS grid collapse with Reanimated `useAnimatedStyle`:
- Shared value `tickRowHeight` transitions between 0 and measured content height
- `opacity` shared value transitions 0 to 1
- Use `withTiming(value, { duration: 200, easing: Easing.out(Easing.ease) })`
- Vertical swipe-to-dismiss: `PanGestureHandler` with `onGestureEvent` updating height shared value

#### E.10.4 Queue list

Replace `@tanstack/react-virtual` with `@shopify/flash-list`:
- Set `estimatedItemSize: 102`
- Use `overrideItemLayout` for non-standard row heights (divider: 17, header: 36, loading: 220, end: 52)
- `getItemType` returns the discriminated union type for recycling optimization
- Sticky header for "Next up" section via `stickyHeaderIndices`

#### E.10.5 Drag-and-drop reorder

Replace `@atlaskit/pragmatic-drag-and-drop` with `react-native-draggable-flatlist` or a custom `LongPressGestureHandler` + `PanGestureHandler`:
- Long press activates drag mode (haptic feedback via `expo-haptics`)
- Drop indicator rendered as `Animated.View` at closest edge
- On drop, recompute order and call `setQueue(newQueue)`

#### E.10.6 Swipe actions on queue items

Replace DOM-based swipe with `react-native-gesture-handler` `Swipeable` component or custom `PanGestureHandler`:
- Right action (swipe left): Tick button with green background
- Left short action: Queue add (primary color)
- Left long action: Playlist selector (neutral color)
- Threshold values: 60px (short), 150px (long) -- may need density adjustment for mobile

#### E.10.7 Session details panel

Render as a bottom sheet using `@gorhom/bottom-sheet`:
- Snap points: collapsed (session header height), half-expanded (50%), full-expanded (90%)
- `BottomSheetScrollView` for scrollable content
- Grade distribution chart: use `react-native-svg` for the bar chart

#### E.10.8 Grade tint background

Use `Animated.View` with `useAnimatedStyle` and `backgroundColor` driven by a shared value:
- `interpolateColor` for smooth transitions between grade tint colors
- Fall back to theme surface color when no climb is active

#### E.10.9 Offline indicator

Same `CloudOffOutlined` icon treatment but using `react-native-vector-icons` or Expo's `@expo/vector-icons`:
- Dismissible banner with `Pressable` + `Animated.View` opacity transition

#### E.10.10 Shared drawer pattern

On React Native, use a single `BottomSheet` instance per drawer type at the navigator level:
- Actions sheet, playlist sheet, and tick sheet -- each with portal-style state management
- Prevents per-item sheet instantiation (same optimization as web's shared drawers)
- Consider `react-native-portal` or a context-based sheet manager

#### E.10.11 State management

The `QueueContext` architecture (fine-grained contexts, reducer, stable action refs) translates directly to React Native. Key differences:
- Replace IndexedDB persistence with AsyncStorage
- Replace WebSocket connection manager with the same `graphql-ws` client (already platform-agnostic)
- Replace `window.addEventListener` event dispatching with a simple EventEmitter or React context callbacks
- `setPreference` / `getPreference` calls switch to AsyncStorage wrappers

#### E.10.12 Haptic feedback

Add haptic feedback for interactions that have no web equivalent:
- Swipe threshold crossed: `Haptics.impactAsync(ImpactFeedbackStyle.Light)`
- Tick saved: `Haptics.notificationAsync(NotificationFeedbackType.Success)`
- Drag-and-drop activated: `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`
- Session disconnect: `Haptics.notificationAsync(NotificationFeedbackType.Warning)`
## Session Management

### Start Session Drawer

The Start Session drawer is the entry point for creating a new climbing session. On web it is implemented as a full-height bottom `SwipeableDrawer` (`start-sesh-drawer.tsx`) containing a `SessionCreationForm`.

**Layout and behaviour:**

- Opens from the bottom, pinned to `height: 100%` using `useDrawerDragResize` with both `initialHeight` and `expandedHeight` set to `'100%'`. The drag handle is in the header but swipe-to-dismiss is disabled (`swipeEnabled={false}`).
- Header contains the title (i18n key `session:creation.drawerTitle`) with drag handle styling via `drawerCss.dragHeaderWrapper`.
- Footer is sticky at the bottom: a full-width `contained` `Button` with a `PlayCircleOutlineOutlined` icon, or a `CircularProgress` spinner (size 16) while the session is being created. Label comes from `session:creation.submitDefault`.
- Below the header, a short blurb differs for signed-in vs anonymous users (`creation.loggedInBlurb` / `creation.anonymousBlurb`).
- Anonymous users see a "Sign in for more" text button (`LoginOutlined` icon) that opens the auth modal.

**Board selector:**

- Heading: "Boards near you" (`creation.boardsNearYou`).
- When no board is selected or the selector is expanded, a `BoardDiscoveryScroll` renders horizontally with: the user's saved boards (`useMyBoards`), popular board configs, and a "Custom" option that opens a `BoardSelectorDrawer` from the top.
- Once a board is selected, the scroll collapses to a single `BoardScrollCard` in `"collapsed"` size with a grey overlay and `EditOutlined` icon. Tapping it re-expands the scroll.
- Auto-selection on open: if the user is on a named board route (`/b/{slug}`), the matching `UserBoard` is auto-selected. If on a generic board route (`/{board}/{layout}/{size}/{sets}/{angle}/...`), a custom config is built from the current route's resolved board details. Runs once per drawer open via `hasAutoSelectedRef`.

**AI queue generator:**

- When no queue has been generated, a full-width outlined `Button` with `AutoFixHighOutlined` icon shows "Generate Queue" (or a hint to select a board first when `generatorBoardDetails` is null).
- After generation, the button is replaced by a summary chip: primary border, `selectedLight` background, showing count of generated climbs. Includes a "Regenerate" text button and a close `IconButton` to clear.
- Opens a `PlaylistGeneratorDrawer` with `targetType="session"`. Generation accumulates climbs in a `runBufferRef` and only commits to `generatedQueue` on `onComplete` when `added > 0`. Dismissing mid-run preserves the prior queue.
- Generated queue items get `suggested: true` and a random UUID. The angle from the generator is pinned onto each climb explicitly.
- On session creation, the generated queue is appended after any carried-over queue from the current board.

**Form fields (`SessionCreationForm`):**

| Field | Type | Constraints | Notes |
|---|---|---|---|
| Session name | `TextField` (small) | Optional, max 100 chars | Placeholder from i18n |
| Session goal | `TextField` (small, multiline 2-4 rows) | Optional, max 500 chars | Helper text shows character count |
| Session colour | 12 circular `Chip` buttons | Optional, tap to toggle | Colours: `#F44336, #E91E63, #9C27B0, #673AB7, #3F51B5, #2196F3, #00BCD4, #009688, #4CAF50, #8BC34A, #FF9800, #FF5722`. Selected chip gets a 3px white border. |
| Discoverable | `Switch` | Boolean, defaults false | Hidden for anonymous users. Label + description text. |
| Permanent session | `Switch` + `FormControlLabel` | Boolean, defaults false | Only shown when `isGymAdmin` is true. |

**Submit flow:**

1. Resolves `boardPath` and `navigateUrl` from selection (named board, custom path, or current route).
2. Calls `createSession(formData, boardPath)`.
3. Merges existing same-board queue with generated queue; sets initial queue for the new session.
4. Sets the session cookie via `setClimbSessionCookie`.
5. Calls `activateSession` with board details and parsed params.
6. Navigates to `navigateUrl` via `router.push`.
7. Fires `registerSessionStart` and analytics.
8. Closes the drawer and shows a success snackbar.
9. On error: logs to console, shows error snackbar, throws so the form preserves data for retry.

**Mobile adaptation:**

- Replace `SwipeableDrawer` with a React Native bottom sheet (e.g. `@gorhom/bottom-sheet`) at full height.
- Replace `BoardDiscoveryScroll` with a horizontal `FlatList` of board cards.
- Replace MUI `TextField`, `Switch`, `Chip` with React Native equivalents styled via the mobile theme.
- The colour picker becomes a grid of `TouchableOpacity` circles.
- The footer button becomes a sticky `View` at the bottom of the sheet with a native `Button`.
- The board selector drawer becomes a nested bottom sheet or a pushed screen.

### Session Overview Panel

The `SessionOverviewPanel` (`session-overview-panel.tsx`) renders session statistics in two modes:

**Compact mode** (`compact={true}`, used in the session mini-bar drawer):

- Board thumbnail: 90px square `BoardRenderer` with rounded corners, `boxShadow: var(--shadow-xs)`, neutral-100 background.
- Board name (capitalised) or named board name, displayed as bold `body2` text.
- Angle selector: `AngleSelector` component rendered next to the board name when `currentAngle` and `onAngleChange` are provided.
- Session goal: flag icon (`FlagOutlined`, 16px, action colour) + `body2` secondary text with the goal text. Only shown when a goal is set.

**Full mode** (`compact={false}`, used in standalone session detail pages):

- Stats chips row (`flexWrap: 'wrap'`, gap 1):
  - Flashes: green `Chip` with `FlashOnOutlined` icon, `success` colour. Only shown when > 0.
  - Sends (non-flash): primary `Chip` with `CheckCircleOutlineOutlined` icon. Sends minus flashes to avoid double-counting. Only shown when > 0.
  - Attempts: outlined `Chip` with `ErrorOutlineOutlined` icon. Only shown when > 0.
  - Duration: outlined `Chip` with `TimerOutlined` icon. Formatted as "X min" for < 60 minutes, "Xh Ym" otherwise. Only shown when > 0.
  - Total climbs: outlined `Chip` with count.
  - Hardest grade: outlined `Chip` with formatted grade. Shows a `Skeleton` (rounded, 80x32) while grade format is loading.
- Board types row: small outlined `Chip` per board type (capitalised).
- Grade distribution card: `CssBarChart` at 160px height (120px mobile), gap 3, with legend row below (10x10 colour squares + caption labels from `SESSION_GRADE_LEGEND`).

**Summary text builder** (`buildSessionSummaryParts`):

Produces an array of human-readable strings for collapsed pill display: flashes count, non-flash sends count, attempts count, total climb count, and hardest grade (formatted). Used by `CollapsibleSection` in embedded mode.

### Session Summary Dialog

The session summary appears when a session ends, displayed as a `Dialog` (`session-summary-dialog.tsx`) wrapping a `SessionSummaryView`.

**Dialog:**

- `maxWidth="sm"`, `fullWidth`.
- Title changes based on how the session ended: `summary.dialogTitle` for manual end, `summary.autoFinishedDialogTitle` when auto-finished after inactivity.
- Actions row: optional "Save to Apple Health" button (outlined, `FavoriteOutlined` icon) when HealthKit is available, plus a "Done" contained button.
- HealthKit auto-sync: if the user has enabled auto-sync (`useHealthKitAutoSync`), the workout is saved automatically on first dialog open via `useEffect`. Button states: saving, saved, error (retry).

**Session Summary View (`SessionSummaryView`):**

- Header stat cards: three side-by-side `Card` components with `flex: 1, minWidth: 120`:
  - Total Sends: `h4` primary colour, bold 700 weight.
  - Total Attempts: `h4` default colour, bold 700 weight.
  - Duration: `h5` with `TimerOutlined` icon, bold 700 weight. Only shown when `durationMinutes` is set. Formatted same as overview panel.
- Goal card: `FlagOutlined` icon + "Goal" label + goal text. Only shown when set.
- Hardest climb card: `EmojiEventsOutlined` icon (warning colour) + "Hardest send" label + climb name (bold 600) + grade `Chip` with vivid colour from `getGradeColor` and white text.
- Grade distribution card:
  - Title: `subtitle2` "Grade distribution".
  - Each grade row: grade label (40px min-width, right-aligned, bold 600) + `LinearProgress` bar (16px height, rounded, width proportional to `count / maxGradeCount`) with vivid grade colour + count number (20px min-width).
  - Skeleton placeholders while grade format loads.
- Participants card:
  - Title: `subtitle2` "Participants".
  - Dense `List`: each participant has a 32x32 `Avatar` (image or `PersonOutlined` fallback), display name (bold 600 `body2`), and "X sends / Y attempts" caption.

### Session Detail Page (`/session/[sessionId]`)

A server-rendered page that fetches session data via GraphQL (`GET_SESSION_DETAIL`) and renders `SessionDetailContent`.

**Metadata generation:**

- Title: `{sessionName} | Boardsesh`.
- Description: includes participant names and send count, or a fallback.
- OG image: dynamic via `/api/og/session?sessionId=...` with version-based cache busting.
- Canonical URL: `/session/{sessionId}`.
- Twitter card: `summary_large_image`.

**`SessionDetailContent` (`session-detail-content.tsx`):**

This component serves two modes:

1. **Standalone page** (`embedded=false`): full-page layout with header bar, social features, and climb list.
2. **Embedded in drawer** (`embedded=true`): compact layout with collapsible sections, used inside `SeshSettingsDrawer`.

**Standalone page layout:**

- Back button (`ArrowBackOutlined`, links to `/`).
- Session name (`h6`, truncated) or auto-generated name from `generateSessionName(firstTickAt, boardTypes)`.
- Date subtitle (`caption`, formatted as "Wed, Jan 15, 2025").
- Share button (`IosShare` icon) using `shareWithFallback`.
- Edit button (only for inferred sessions where the current user is a participant): toggles inline `TextField` for name and description editing, with save/cancel `IconButton`s.
- `SessionOverviewPanel` in full mode.
- Session-level social row: `VoteButton` (like only) + comment toggle (`ChatBubbleOutlineOutlined` with comment count badge) + collapsible `CommentSection`.
- HealthKit save button (for participants only).
- Divider, then "Climbs (N)" heading.
- `ClimbsList` with tick details rendered below each climb via `renderItemExtra`. Tick details show per-user rows in multi-user sessions: avatar, name, status chip (flash=success, send=primary, attempt=outlined), attempt text, vote button, comment toggle, and delete button (own ticks only, with `ConfirmPopover`).
- Clicking a climb calls `navigateToClimb`: in solo mode sets it as current climb via queue actions, in party mode skips `setCurrentClimb` to avoid yanking the wall. Non-embedded mode fetches a redirect URL from `/api/internal/climb-redirect`.

**Embedded mode layout:**

- `SessionOverviewPanel` in compact mode (board thumbnail + angle selector).
- `CollapsibleSection` with three pill-shaped sections:
  - **Invite** (key: `'invite'`): share link text, share button (`IosShare`), QR toggle (`QrCode2Outlined`). QR code rendered via `QRCodeSVG` at 180px, level M. Tour mode shows a disabled preview with a non-URL QR payload.
  - **Activity** (key: `'activity'`): summary parts as pill text, expands to full `ClimbsList` with tick details. Shows "No climbs yet" when empty.
  - **Analytics** (key: `'analytics'`): grade count summary, expands to `CssBarChart` with legend. Shows "Log some climbs" when empty.
- `tourActiveSection` prop can force a specific section open and disable user interaction with headers (used by onboarding tour).

### Session Settings Drawer

The `SeshSettingsDrawer` (`sesh-settings-drawer.tsx`) is the session management panel opened from the session mini-bar.

**Header:**

- Board thumbnail (36px square, rounded 6px).
- Session name (bold `subtitle1`, truncated with ellipsis).
- Live timer (`monospace`, bold 600, secondary colour) via `useSessionTimer`.
- Stop button (`StopCircleOutlined`, error colour) or close button (`CloseOutlined`) when stopped/touring.

**Body:**

- When loading: centred `CircularProgress` (28px).
- When error: `Alert` with severity "warning".
- Delegates to `SessionDetailContent` in embedded mode with invite content, angle change handler, and named board name.
- Uses `useSessionDetail` hook to fetch live data; falls back to a constructed `SessionDetail` from persistent session state while loading.

**Angle change:** replaces the angle segment in the current URL pathname, preserving query string from `window.location.search`.

**Stop session:** calls `deactivateSession()` + `clearClimbSessionCookie()`, toggles to stopped state showing close button instead of stop button.

**Tour mode:** accepts `tourMockSession` prop (a `SessionDetail` with fake participants and ticks from `getMockSessionDetail()`) and `tourActiveSection` to force collapsible sections during onboarding.

### Session Join Flow (`/join/[sessionId]`)

**Server-side (`page.tsx`):**

- Generates rich OG metadata: title "Join {leaderName}'s session | Boardsesh" or "Join a climbing session | Boardsesh", description with send count and board info, OG image via `/api/og/session?sessionId=...&variant=join`.
- `robots: { index: false, follow: true }` (join pages are not indexed).
- Renders a `<noscript>` fallback with `<meta httpEquiv="refresh">` pointing to `/api/internal/join/{sessionId}`.

**Client-side (`JoinRedirect`):**

- Full-screen centred layout: `CircularProgress` (48px) + "Joining session..." text.
- `useEffect` immediately sets `window.location.href` to the join API endpoint.
- The API endpoint handles session joining server-side and redirects the user to the board page with the session cookie set.

**Mobile adaptation:**

- Deep link handling: `/join/{sessionId}` URLs should be registered as universal links / app links.
- The join flow can use `expo-linking` to handle the deep link and call the `joinSession` mutation directly.
- Show a native loading screen during the join process.
- On success, navigate to the board page with the session activated.

### Data Layer

| Operation | Type | Purpose |
|---|---|---|
| `createSession` | Mutation | Creates a new session with form data and board path |
| `joinSession` | Mutation | Adds the current user to an existing session |
| `endSession` / `endSessionWithSummary` | Action | Ends the active session and fetches summary |
| `deactivateSession` | Action | Deactivates the session locally without ending it on the server |
| `sessionDetail` | Query | Fetches full session data including ticks, participants, stats |
| `sessionSummary` | Query | Fetches end-of-session summary data |
| `nearbySessions` | Query | Lists discoverable sessions near the user |
| `mySessions` | Query | Lists sessions the user has participated in |

---

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

## Bluetooth Integration

### Connection Flow

The BLE connection is managed by `useBoardBluetooth` hook and exposed via `BluetoothProvider` context.

**Step-by-step:**

1. **User initiates connection** -- taps lightbulb or connect button.
2. **Adapter creation** -- `createBluetoothAdapter(boardName, devicePicker)` creates a platform-appropriate adapter:
   - Web: uses Web Bluetooth API (`navigator.bluetooth.requestDevice`).
   - Capacitor (native iOS/Android): uses `react-native-ble-plx` equivalent with a custom `DevicePickerDialog` rendered as a bottom sheet (`Dialog` on web).
3. **Availability check** -- `adapter.isAvailable()` confirms BLE is supported.
4. **Existing adapter cleanup** -- if a prior connection exists, emits `Bluetooth Disconnected` event with `reason: 'reconnect'`, then disconnects.
5. **Device request and connect** -- `adapter.requestAndConnect(targetSerial)` opens the device picker (OS native on web, custom dialog on Capacitor with RSSI-based signal indicators).
6. **Device name parsing** -- `parseApiLevel(deviceName)` extracts the Aurora API level from the device name (e.g., `Kilter Board#751737@3` yields API level 3). `parseSerialNumber(deviceName)` extracts the serial (e.g., `751737`).
7. **Board configuration** -- `adapter.configureBoard()` is called with board name, layout ID, size ID, API level, device name, and colour overrides. Configuration is keyed and cached so reconfiguration is skipped when the key matches.
8. **Disconnection listener** -- `adapter.onDisconnect(handleDisconnection)` is registered.
9. **Initial frames** -- if provided, `sendFramesToBoard(initialFrames, mirrored)` sends the first climb immediately.
10. **Serial recording** -- for Aurora boards, `recordBoardSerial()` POSTs the serial-to-config mapping to `/api/internal/board-serials` for future auto-matching.
11. **Session serial broadcast** -- `onConnectSuccess(parsedSerial)` fires, which in `BluetoothProvider` calls `setSessionBoardSerial(serial)` if a session is active.
12. **Wake lock** -- `useWakeLock(isConnected)` keeps the screen on while connected.

**Device picker dialog (`DevicePickerDialog`):**

- MUI `Dialog` with "Select a board" title and `BluetoothSearching` icon.
- Lists discovered BLE devices with:
  - Board thumbnail: `BoardThumbnail` for resolved saved boards, `BoardRenderer` for recorded configs, `UnknownBoardPreview` with `HelpOutline` overlay for unknown serials.
  - Board name: saved board name, recorded config display name, or raw device name.
  - Board details: layout/size/set info, location, last connected time.
  - Signal strength: icon (`SignalCellularAlt`) + label (Strong/Good/Weak/Very weak based on RSSI thresholds: -50/-70/-85).
- "Cancel" button in actions.
- Board config mismatch detection: if the resolved config doesn't match the current route's board, a `BoardConfigMismatchDialog` offers "Switch" (navigate to matching route with `?autoConnect` param), "Connect anyway", or "Cancel".

**Auto-connect (`AutoConnectHandler`):**

- Reads `?autoConnect={serialNumber}` from URL search params.
- When present and BLE is supported and first search fetch is done: auto-selects the first available climb, initiates BLE connection to the target serial, and removes the param from the URL.
- Fires once per mount via `triggeredRef`.

### Frame Sending

`sendFramesToBoard(frames, mirrored, signal, climbUuid)`:

**Aurora boards:**

1. If `frames` is empty string, sends a clear-all-LEDs packet (no placement data needed).
2. If `mirrored` and board supports mirroring: `convertToMirroredFramesString` maps each hold ID to its `mirroredHoldId` via `holdsData`.
3. Loads LED placement positions via dynamic import of `@boardsesh/board-constants/led-placements` (cached after first load).
4. Calls `getAuroraBluetoothPacket(frames, placementPositions, boardName, apiLevel, ledColorOverrides)`.
5. Handles skipped placements:
   - All placements skipped: shows error snackbar "This climb is for a different board configuration", returns `false`.
   - Partial skip: shows warning snackbar with count, sends remaining holds.
   - Captures Sentry warnings for both cases with context (climbUuid, layoutId, sizeId, setIds, skip counts).
6. Writes packet via `adapter.write(packet, signal)`.
7. Increments BLE send counter and checks feedback prompt threshold.

**MoonBoard:**

1. Empty frames are skipped (MoonBoard packet format doesn't support "clear").
2. `getMoonboardBluetoothPacket(frames)` produces the packet.
3. If all placements are skipped, shows error snackbar and returns `false`.
4. Partial skips are logged to Sentry.

**Error handling:**

- `AbortError` (from unmount-mid-write) is swallowed silently -- the AutoSender's drain loop handles this.
- Other errors are logged and return `false`.

### Light Control Drawer

Long-pressing the lightbulb opens the `LightControlDrawer` (`light-control-drawer.tsx`), a bottom `SwipeableDrawer` with height `"auto"`.

**Menu items (MUI `List`):**

| Action | Icon | Behaviour |
|---|---|---|
| Turn off all LEDs | `LightbulbOutlined` | Calls `clearBoard()`. If a light show is active, stops it first (the stop effect auto-clears). Disabled when not connected. |
| Disco mode | `AutoAwesome` / `StopCircleOutlined` | Toggles `partyMode` between `'disco'` and `'off'`. Requires a climb to be loaded (`hasClimbLoaded`). Randomizes HAND hold colours every 450ms (`DISCO_TICK_MS`). START/FOOT/FINISH holds keep their canonical colours. |
| Party mode (Glyphs) | `Celebration` / `StopCircleOutlined` | Toggles `partyMode` between `'glyphs'` and `'off'`. Cycles through letters "BOARDSESH" at 600ms per letter (`PARTY_TICK_MS`). Each letter is snapped to hold IDs via `mapGlyphToHolds`. Not available on MoonBoard. |
| Customise colours | `Palette` | Opens a colour picker `Dialog`. Four customisable LED roles (START, HAND, FOOT, FINISH from `CUSTOMISABLE_LED_ROLES`). Each shows a colour swatch (`<input type="color">`), defaults to the board's canonical role colour from `STATE_TO_PRIMARY_CODE`. "Reset" button clears all overrides. Not available on MoonBoard. |
| Disconnect | `BluetoothDisabledOutlined` | Calls `disconnect()` then `onClose()`. Disabled when not connected. |

**Disco mode effect:**

- Extracts HAND-role placement IDs from the current climb's frames.
- Builds base frames (non-HAND segments preserved as-is).
- Every tick: appends randomized role codes for HAND placements.
- Sends combined frames with the climb's mirrored flag.

**Glyphs mode effect:**

- Pre-computes bitmap-to-hold-ID mapping for each unique letter in "BOARDSESH".
- Cycles through letters, rotating through the board's available role colours.
- Sends frames via `buildPartyFrames(holdIds, stateCode)`.

**Cleanup:**

- Light shows stop automatically when the board disconnects (`useEffect` watches `isConnected`).
- When a light show stops, the wall is cleared once via `clearBoard()`, then the auto-sender resumes and repaints the current climb.

### Disconnect Handling

**User-initiated disconnect (`disconnect` callback):**

- Updates state synchronously for immediate UI feedback.
- Clears `connectedAtRef`, unsubscribes disconnect listener, nulls adapter ref.
- Fires `Bluetooth Disconnected` analytics with `reason: 'user'`, `disconnectReason: 'user_initiated'`, and `connectionDurationSec`.

**Unexpected disconnect (`handleDisconnection` callback):**

- Fires when the adapter reports `gattserverdisconnected`.
- Only runs on unexpected drops (signal loss, board power-off, OS BLE stack reset) because user-initiated disconnects null the listener first.
- Fires analytics with `reason: 'lost'`, `disconnectReason: 'gatt_error'`.

**Navigation disconnect (unmount cleanup):**

- Rejects any pending picker promise.
- If still connected at unmount, fires analytics with `reason: 'navigation'`, `disconnectReason: 'unknown'`.
- Calls `adapter.disconnect()`.

**Status store (`bluetooth-status-store.ts`):**

- Module-level store registers active BLE connections via `registerBluetoothConnection(disconnect)`.
- Allows consumers outside the `BluetoothProvider` tree (root tab bar, board switch guard) to observe connection state and trigger disconnect.

### Mobile Adaptation

- **Web Bluetooth API** is replaced by `react-native-ble-plx` on mobile.
- **Device picker**: custom bottom sheet listing discovered BLE devices with board thumbnails, signal strength, and names. Not the OS-level picker.
- **Auto-pairing**: remembers the last connected serial. When the session's `lastConnectedBoardSerial` is set, mobile clients can auto-connect without manual selection.
- **Haptic feedback**: on unexpected disconnect, trigger haptic feedback via `expo-haptics`.
- **Background BLE**: handle BLE state restoration for iOS background mode.

---

## Onboarding Tour

### Tour Architecture

The onboarding tour is a 15-step guided overlay managed by three key modules:

- **`OnboardingTourProvider`** (`onboarding-tour-provider.tsx`): React context managing tour state, step transitions, analytics, and side effects.
- **`OnboardingTourOverlay`** (`onboarding-tour-overlay.tsx`): Visual overlay rendering step content, anchoring to UI elements.
- **`onboarding-tour-steps.ts`**: Static step definitions with route matching, anchor selectors, advance triggers, and side effects.

### Tour Steps

| # | ID | Route | Anchor | Title | Advance Trigger | Side Effects |
|---|---|---|---|---|---|---|
| 1 | `home-intro` | `/` | None (centred) | "Let's get you climbing" | `next` (button) | -- |
| 2 | `home-pick-board` | `/` | None | "Pick a board to start your sesh" | `route-change` | Enter: opens Start Sesh drawer |
| 3 | `climb-list-grid-view` | `/*/list` | `#onboarding-view-mode-grid` | "Two ways to browse" | `view-mode-grid` | -- |
| 4 | `climb-list-back-to-list` | `/*/list` | `#onboarding-view-mode-list` | "Back to list view" | `view-mode-list` | -- |
| 5 | `climb-list` | `/*/list` | `#onboarding-climb-card-2` or `#onboarding-climb-card` | "Your wall, your climbs" | `current-climb-set` (via `TOUR_CLIMB_LIST_PICK_EVENT`) | -- |
| 6 | `queue-add` | `/*/list` | `#onboarding-climb-card` or `#onboarding-climb-card-2` | "Queue one up" | `queue-added` | Enter: replays swipe hint animation |
| 7 | `queue-bar` | `/*/list` | `#onboarding-queue-bar` | "This is your current climb" | `current-climb-set` (via `notifyCurrentClimb`) | -- |
| 8 | `queue-thumbnail` | `/*/list` | Climb thumbnail `[data-testid="climb-thumbnail"]` | "Tap a thumbnail" | `play-drawer-open` (via `PLAY_DRAWER_EVENT`) | -- |
| 9 | `play-view` | `/*/list` | None (banner) | "Everything for this climb" | `next` (button) | -- |
| 10 | `play-queue` | `/*/list` | None (banner) | "One queue for the whole crew" | `next` (button) | Enter: opens play queue; Exit: closes play queue |
| 11 | `queue-bar-reopen` | `/*/list` | `#onboarding-queue-bar` | "Jump back anytime" | `next` (button) | Enter: closes play view |
| 12 | `session-mini-bar` | `/*/list` | `[data-tour-anchor="session-mini-bar"]` | "Open your session" | `next` (button) | -- |
| 13 | `sesh-invite` | `/*/list` | None (banner) | "Invite your crew" | `next` (button) | Enter: opens dummy sesh drawer |
| 14 | `sesh-activity` | `/*/list` | None (banner) | "Every ascent, logged" | `next` (button) | -- |
| 15 | `sesh-analytics` | `/*/list` | None (banner) | "See how the night went" | `finish` (button) | Exit: closes dummy sesh drawer |

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

| Effect | Event | Purpose |
|---|---|---|
| `open-start-sesh` | `onboarding:open-start-sesh` | Opens the Start Session drawer |
| `open-dummy-sesh` | `onboarding:open-dummy-sesh` | Opens the Sesh Settings drawer with mock data |
| `close-dummy-sesh` | `onboarding:close-dummy-sesh` | Closes the mock session drawer |
| `open-play-queue` | `onboarding:open-play-queue` | Opens the play view queue section |
| `close-play-queue` | `onboarding:close-play-queue` | Closes the play view queue section |
| `close-play-view` | `onboarding:close-play-view` | Closes the play view drawer |
| `replay-climb-list-swipe-hint` | (direct call) | Replays the swipe hint animation on the first climb card |

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
## 7. Playlists / Library

### 7.1 Library Main Page (`/playlists`)

The library is the user's playlist hub, combining owned, pinned, smart, and community playlists into a scrollable discovery surface.

**Layout (top to bottom):**

1. **Board Filter Strip** -- Horizontal chip row of the user's saved boards (`useMyBoards`). Tapping a chip filters every section below to playlists matching that `boardType` + `layoutId`. An "All" chip clears the filter. The strip auto-selects the board matching the current queue/session context when no explicit selection exists.

2. **Sign-In Banner** (unauthenticated only) -- A horizontal bar with a login icon, title, one-line description, and a "Sign In" contained button. Tapping opens the auth modal with a playlist-specific title/description. A placeholder `div` of equal height renders during the `loading` auth state to prevent CLS.

3. **Your Picks (Smart Playlists)** -- Section title "Your Picks". A CSS grid of `PlaylistCard` components (variant `"grid"`). Each card maps to a `SmartPlaylistPresentation` preset:

   | Preset | Icon | Color | Data Source |
   |--------|------|-------|-------------|
   | Five Stars | star emoji | amber | User's 5-star rated climbs |
   | Most Repeated | repeat emoji | purple | Most attempted climbs |
   | Projects | target emoji | accentRose | Climbs worked most without sending |

   Cards with `count === 0` are omitted. Tapping navigates to `/discover/<slug>/<userId>`. The board-preview backdrop uses the currently selected board (or the user's primary board as fallback).

4. **Pinned** -- Section title "Pinned". A `PlaylistCardGrid` showing the user's server-side pinned playlists. Each card displays a pin toggle button (filled `PushPin` when pinned, outlined when not). Falls back to per-device IndexedDB "recently opened" playlists when the user has nothing pinned. Pin/unpin calls `PIN_PLAYLIST` / `UNPIN_PLAYLIST` mutations.

5. **Jump Back In** -- Section title "Jump Back In". A `PlaylistScrollSection` with horizontal scroll and IntersectionObserver-driven pagination. Shows all owned playlists ordered by `lastAccessedAt`. Each card is variant `"scroll"` (taller, wider).

6. **Discover** -- Section title "Discover". Same horizontal scroll pattern. Merges `popular` and `recent` community playlists, de-duped and excluding the current user's own playlists. Two parallel cursors (popular + recent) live inside `useDiscoverPlaylists`; exhausted streams stop pulling.

7. **Create Playlist FAB** (authenticated only) -- A fixed-position `Fab` with `+` icon anchored to the right edge of the page container, above the bottom bar. Tapping triggers a board picker drawer if no board is selected, or directly opens the create playlist drawer.

8. **Empty State** (authenticated, no playlists or pins) -- Centered icon (`LabelOutlined`), title, description text (max 300px wide).

9. **Error State** (authenticated, fetch error) -- Centered sad-face icon, title, description, "Try Again" outlined button.

**Playlist Card Anatomy:**

- **Grid variant**: Compact square thumbnail (`PlaylistPreviewSquare` showing a board image tinted with the playlist's color + optional emoji icon), name (single line, truncated), climb count text, optional pin button overlay.
- **Scroll variant**: Larger square thumbnail, name below, climb count below name.
- Both variants are wrapped in `LocaleLink` for navigation.

**React Native adaptation:**
- Replace horizontal `PlaylistScrollSection` with a `FlatList` with `horizontal` prop and snap-to-item behavior.
- Replace CSS grid with a 2-column `FlatList` for the pinned/smart sections.
- Replace FAB with a floating `Pressable` positioned via absolute layout above the tab bar.
- Board filter strip becomes a horizontal `ScrollView` with chip `Pressable` components.

---

### 7.2 Playlist Detail (`/playlists/[playlist_uuid]`)

**Header (Hero Section):**
- Back button (falls back to `/playlists`).
- `PlaylistPreviewSquare` (96x96) showing board image with playlist color tint and optional emoji icon.
- Playlist name (`h5`), climb count, follower count (with people icon), visibility badge (Public with globe icon / Private with lock icon).
- Optional description text.
- Follow button for non-owners on public playlists (uses generic `FollowButton` component with `FOLLOW_PLAYLIST` / `UNFOLLOW_PLAYLIST` mutations). Shows follower count change optimistically.
- **Top-right action cluster** (absolutely positioned):
  - Pin toggle button (any signed-in viewer): filled `PushPin` when pinned, outlined when not.
  - Share button (public playlists only): `IosShare` icon. Uses `shareWithFallback` (native Web Share API with clipboard fallback).
  - Three-dot menu (`MoreVertOutlined`):
    - **Generate** (owner only): Opens `PlaylistGeneratorDrawer` (AI-powered climb generation).
    - **Edit** (owner only): Opens `PlaylistEditDrawer`.
    - **Delete** (owner only): Red text, calls `DELETE_PLAYLIST` mutation, navigates back to library on success.

**Climb List:**
- Uses `MultiboardClimbList` component with board filter chips.
- Infinite scroll via `useInfiniteQuery` with 20 climbs per page.
- Each climb row: thumbnail, climb name, grade, board info. Tapping a climb activates it in the queue context if available.
- Empty state: "No climbs in this playlist yet" (via `EmptyState` component).

**Discussion Section:**
- Rendered only for public playlists.
- Uses `CommentSection` component with entity type `"playlist_climb"` and entity ID `"<playlistUuid>:_all"`.

**React Native adaptation:**
- Hero section as a sticky header or scroll-away header using `Animated.ScrollView`.
- Action menu via an ActionSheet (iOS native bottom sheet).
- Climb list as a `FlashList` with `onEndReached` for pagination.

---

### 7.3 Create / Edit Playlist Drawers

**Create Playlist Drawer** (`CreatePlaylistDrawer`):
- Bottom sheet drawer (`SwipeableDrawer`).
- Title: "Create Playlist".
- Fields:
  - **Name** (required): `TextField`, max 100 chars, autofocus. Validation: required, max length.
  - **Description** (optional): `TextField`, multiline, 2 rows, max 500 chars.
  - **Color** (optional): Color picker (`<input type="color">`), defaults to `#000000`.
- Header-right "Create" contained button (disabled while submitting).
- Calls `CREATE_PLAYLIST` mutation with `boardType`, `layoutId`, name, description, color.
- On success: toast, analytics event, navigates to the new playlist detail page.

**Edit Playlist Drawer** (`PlaylistEditDrawer`):
- Bottom sheet drawer.
- Title: "Edit Playlist".
- Fields:
  - **Name**, **Description**, **Color** -- same as create.
  - **Icon** (optional): Emoji picker button (48x48, shows current emoji or "+"). Popover with `@emoji-mart/react` picker. Remove icon button when set.
  - **Visibility** toggle: `Switch` between Private (lock icon) and Public (globe icon) with descriptive hint text below.
- Header-right Cancel (outlined) + Save (contained) buttons.
- Calls `UPDATE_PLAYLIST` mutation.

**React Native adaptation:**
- Use `Sheet` component (bottom sheet) instead of `SwipeableDrawer`.
- Replace emoji picker with a modal or the `expo-emoji-picker` package.
- Color picker as a row of preset color swatches rather than a native color input (which has poor RN support).

---

### 7.4 Smart Playlists

Smart playlists are auto-generated from the user's logbook and are not editable. They live at `/discover/<slug>/<userId>`.

| Smart Playlist | Slug | Logic |
|----------------|------|-------|
| Five Stars | `five-stars` | All climbs the user rated 5 stars |
| Most Repeated | `most-repeated` | Climbs with the highest attempt count |
| Projects | `projects` | Climbs with the most attempts but no successful send |

- Each has a dedicated color, emoji icon, and i18n title/description.
- Share button with preset share text.
- Empty state when no qualifying climbs exist.
- Counts fetched via `GET_MY_SMART_PLAYLIST_COUNTS` query (5-minute stale time).

**Data operations:**
- `allUserPlaylists` / `useUserPlaylists` -- Paginated owned playlists with board filter.
- `myPinnedPlaylists` / `usePinnedPlaylists` -- Server-side pins with IndexedDB recents fallback.
- `playlist` / `GET_PLAYLIST` -- Single playlist fetch.
- `playlistClimbs` / `GET_PLAYLIST_CLIMBS` -- Paginated climbs within a playlist (supports board-specific filtering).
- `discoverPlaylists` / `useDiscoverPlaylists` -- Popular + recent community playlists.
- `searchPlaylists` -- Text search across playlists.
- `mySmartPlaylistCounts` / `GET_MY_SMART_PLAYLIST_COUNTS` -- Counts for each smart playlist type.
- `smartPlaylist` -- Fetches climbs for a specific smart playlist type.
- `createPlaylist` / `CREATE_PLAYLIST` -- Creates a new playlist.
- `updatePlaylist` / `UPDATE_PLAYLIST` -- Updates name, description, color, icon, visibility.
- `deletePlaylist` / `DELETE_PLAYLIST` -- Deletes a playlist.
- `addClimbToPlaylist` / `ADD_CLIMB_TO_PLAYLIST` -- Adds a climb to a playlist.
- `removeClimbFromPlaylist` -- Removes a climb from a playlist.
- `pinPlaylist` / `PIN_PLAYLIST` -- Pins a playlist for the current user.
- `unpinPlaylist` / `UNPIN_PLAYLIST` -- Unpins a playlist.
- `followPlaylist` / `FOLLOW_PLAYLIST` -- Follows a playlist (non-owner).
- `unfollowPlaylist` / `UNFOLLOW_PLAYLIST` -- Unfollows a playlist.

---

## 8. Profile

### 8.1 Main Profile Page (`/profile/[user_id]`)

**User Card** (top):
- 80x80 `Avatar` with profile image (or `PersonOutlined` fallback).
- Display name (`h6`) beside the avatar.
- Follow/Unfollow button (for other users' profiles) using `FollowButton` with `FOLLOW_USER` / `UNFOLLOW_USER` mutations. Optimistic follower count update.
- `FollowerCount` component showing follower/following counts. Tapping opens a follower/following list drawer.
- Email address (own profile only, body2, secondary text).
- Instagram link (if set): Instagram icon + formatted handle (strips URL prefix). External link, opens in new tab.

**Activity Overview** (last 3 months):
- A `CssBarChart` showing weekly activity bars. Built from all boards' tick data via `buildWeeklyBars`. Height 100px (80px mobile). No legend.

**Beta Videos Section**:
- `ProfileBetaSection` component showing beta videos contributed by this user.

**Navigation Cards** (vertical stack, 1.5 spacing):
Three `ProfileNavCard` components, each a `Card` with icon, title, subtitle, and chevron-right:

| Card | Icon | Route | Subtitle |
|------|------|-------|----------|
| Statistics | `ShowChartOutlined` | `/profile/<id>/statistics` | "X sends logged" or "Start climbing" |
| Sessions | `TimelineOutlined` | `/profile/<id>/sessions` | "Activity and session history" |
| Created Climbs | `FitnessCenterOutlined` | `/profile/<id>/climbs` | "Climbs you've set" / "Climbs they've set" |

**React Native adaptation:**
- `ScrollView` with vertical layout.
- Avatar, name, and follow button in a horizontal row.
- Navigation cards as `Pressable` rows with `router.push`.
- Activity chart as a simplified bar chart using `react-native-svg` or similar.

---

### 8.2 Statistics Sub-page (`/profile/[user_id]/statistics`)

**Filter controls:**
- Header injects a filter button via `StatsFilterBridgeInjector`.
- `StatsFilterDrawer` bottom sheet with:
  - Board selector (all boards or specific board).
  - Timeframe selector (All time, Last 3 months, Last 6 months, Last year, Custom).
  - Custom date range (from/to date pickers).
- Active filter indicator in the header.

**Stats Summary** (`StatsSummary` component):
- Hardest send grade and hardest flash grade.
- Total ascents, total sessions.
- Percentile ranking vs other climbers (from `userClimbPercentile` query).
- Weekly activity bar chart (`CssBarChart`).
- Aggregated grade distribution stacked bar chart.
- Flash vs Redpoint breakdown bar chart.
- V-Points progression timeline chart.

**Board Stats Section** (`BoardStatsSection` component):
- Per-board breakdown when a specific board is selected.
- Grade distribution by board layout with color-coded bars.
- Filtered logbook entries.

---

### 8.3 Sessions Sub-page (`/profile/[user_id]/sessions`)

- Uses `ProfileSubPageLayout` wrapper.
- Renders `ActivityFeed` component filtered by `userId`.
- Shows session cards from this user's climbing history (same `SessionFeedCard` used in the main feed).
- Each session card: participant avatars, relative time, duration, climb count, sends/flashes/attempts chips, hardest grade badge, grade distribution bar chart, outcome doughnut (desktop only), board types, like/comment buttons.

---

### 8.4 Created Climbs Sub-page (`/profile/[user_id]/climbs`)

- Uses `ProfileSubPageLayout` wrapper.
- Renders `UserClimbList` component filtered by `userId`.
- List of climbs created/set by this user.
- Board/layout filter available.
- Tapping a climb navigates to climb detail.

---

### 8.5 Personal Dashboard (`/you`)

- Progress dashboard with personal stats and charts.
- Tab navigation: Progress, Sessions, Logbook.
- Requires authentication (redirects to home if not logged in).

**Data operations:**
- `publicProfile` -- Profile data for any user.
- `userProfileStats` -- Aggregated statistics (total ascents, sessions, grade distribution).
- `userClimbPercentile` -- Percentile ranking among all climbers.
- `userAscentsFeed` -- Paginated ascent feed for a user.
- `userGroupedAscentsFeed` -- Grouped ascent feed by session.
- `followers` / `following` -- Follower/following lists.
- `isFollowing` -- Whether the current user follows the target.
- `followUser` / `unfollowUser` -- Follow/unfollow mutations.
- `userBetaLinks` -- Beta videos contributed by the user.
- `sessionGroupedFeed` -- Session-grouped feed filtered by user.
- `userClimbs` -- Climbs created by the user.
- `setterProfile` / `setterClimbs` -- Setter-specific profile and climbs.

---

## 9. Feed

### 9.1 Feed Page (`/feed`)

The feed is the social hub of the app. It uses three tabs with URL-based state (`?tab=sessions|proposals|comments`).

**Global controls:**
- **Board Filter Strip** (authenticated only): Same horizontal chip row as the library page, filtering all feed content by board.
- **Full-width Tabs**: Sessions (default), Proposals, Comments. Tab state synced to URL params.

---

### 9.2 Sessions Tab (default)

**Component:** `ActivityFeed`

**Sign-in prompt:** An info `Alert` for unauthenticated users.

**Session Feed Cards** (`SessionFeedCard`):
Each card represents a climbing session and contains:

- **Header row**: Participant avatar(s) (single `Avatar` or `AvatarGroup` max 3), participant name(s) linked to profiles, relative timestamp ("5m ago", "2h ago"), duration (e.g., "1h 30min"), session title (auto-generated from date + board types).
- **Goal** (if set): Flag icon + goal text.
- **Stats chips row** (flex wrap):
  - Flash count (amber background, lightning icon).
  - Send count (green background, check icon, excludes flashes).
  - Attempt count (neutral background, error icon).
  - Hardest grade badge (color-coded by grade).
- **Grade distribution chart**: `CssBarChart`, 80px height (60px mobile), no legend.
- **Outcome doughnut** (desktop only, min-width 768px): Flash/Send/Attempt breakdown, 120px wide.
- **Board types + climb count**: Bottom row with board names and total ticks.
- **Social row**: Like button (`VoteButton`, like-only mode) + comment button (`FeedCommentButton`).

The entire body area (below the header) links to `/session/<sessionId>`.

**Empty states:**
- Authenticated, no sessions: "Follow climbers to see their activity" with "Find Climbers" button (opens `UnifiedSearchDrawer` in users mode).
- Unauthenticated, no recent activity: "No recent activity" message.

**Infinite scroll:** `useInfiniteScroll` hook with sentinel `div` and `IntersectionObserver`. Skeleton loading cards during fetch.

---

### 9.3 Proposals Tab

**Component:** `ProposalFeed`

- Paginated list of community climb proposals using `BROWSE_PROPOSALS` query.
- Each proposal rendered as a `ProposalCard` component.
- Vote buttons (Support/Oppose).
- Proposal reason and community discussion.
- Vote count with approval status (Approved/Rejected/Pending).
- Empty state: Gavel icon + "No proposals yet" message.
- Infinite scroll with sentinel.

---

### 9.4 Comments Tab

**Component:** `CommentFeed`

Each comment rendered as a `CommentFeedCard`:
- **Header**: User avatar (32x32, linked to profile), display name (linked to profile), context text ("commented on a climb"), relative timestamp (via `dayjs.fromNow()`).
- **Comment body**: Blockquote-styled box with left border, secondary background.
- **Social row**: `VoteButton` (up/down votes, not like-only), reply count.

Entity type labels map: session, climb, proposal, tick (ascent), comment, board, gym, playlist_climb.

Empty state: Chat bubble icon + "No comments yet" message.

---

### 9.5 Find Climbers Drawer

- `UnifiedSearchDrawer` opened from the empty feed state.
- Default category set to "users".
- Allows searching for climbers to follow.

**Data operations:**
- `sessionGroupedFeed` / `GET_SESSION_GROUPED_FEED` -- Cursor-paginated session feed with optional board/user filters.
- `browseProposals` / `BROWSE_PROPOSALS` -- Paginated proposals with optional board filter.
- `globalCommentFeed` / `GET_GLOBAL_COMMENT_FEED` -- Cursor-paginated global comment feed with optional board filter.
- `vote` -- Vote on entities (sessions, comments, ticks).
- `addComment` -- Add a comment to an entity.
- `voteOnProposal` -- Vote on a climb proposal.

---

## 10. Notifications

### 10.1 Notification Center (`/notifications`)

**Layout:**
- Page title "Notifications" in the layout header.
- "Mark all as read" text button (right-aligned, visible only when `unreadCount > 0`).
- `List` of `NotificationItem` components with infinite scroll.
- Empty state: Bell icon (`NotificationsNoneOutlined`, 40px, neutral-300 color) + "Nothing yet" text.
- Loading state: Centered `CircularProgress` (24px).

### 10.2 Notification Item Display

Each `NotificationItem` is a `ListItem` with:

- **Background**: Transparent when read; faint primary color tint (`primary + 08` opacity) when unread.
- **Avatar area**: Single `Avatar` (40x40) for single-actor notifications; `AvatarGroup` (max 3, 28x28 each) for multi-actor notifications. Avatar shows actor's image or a type-specific fallback icon.
- **Primary text**: Actor summary + action text, bold when unread, 2-line clamp. Examples:
  - "Alice followed you"
  - "Bob and 2 others liked your tick"
  - "Carol replied to your comment: [preview]"
- **Secondary text row**: Relative timestamp + unread dot indicator.
  - Timestamp formats: "just now", "5m", "2h", "3d", or full date.
  - Blue dot: 6x6 circle with `primary` color, margin-left 0.5.

**Notification Types and Icons:**

| Type | Text Pattern | Icon |
|------|-------------|------|
| `new_follower` | "X followed you" | `PersonAddOutlined` |
| `comment_reply` | "X replied to your comment: [body]" | `ChatBubbleOutline` |
| `comment_on_tick` | "X commented on your tick: [body]" | `ChatBubbleOutline` |
| `comment_on_climb` | "X commented on the climb: [body]" | `ChatBubbleOutline` |
| `vote_on_tick` | "X liked your tick" | `ThumbUpOutlined` |
| `vote_on_comment` | "X liked your comment" | `ThumbUpOutlined` |
| `proposal_created` | "X created a proposal" | `LightbulbOutlined` |
| `proposal_approved` | "X's proposal was approved" | `LightbulbOutlined` |
| `proposal_rejected` | "X's proposal was rejected" | `LightbulbOutlined` |
| `proposal_vote` | "X voted on a proposal" | `LightbulbOutlined` |
| `new_climb` / `new_climb_global` | "X added a new climb" | `AddCircleOutline` |
| `new_climbs_synced` | "X new climbs synced from [setter]" | `AddCircleOutline` |

**Actor Summarization:**
- 1 actor: "Alice"
- 2 actors: "Alice and Bob"
- 3+ actors: "Alice and N others"

**Tap behavior:**
1. Marks the notification group as read (via `markGroupAsReadMutation`).
2. Navigates to relevant content:
   - `new_follower` -> `/profile/<actorId>`
   - `new_climbs_synced` -> `/setter/<setterUsername>`
   - Climb-related (with `climbUuid` + `boardType`) -> Fetches climb URL via `/api/internal/climb-redirect` and navigates.

**React Native adaptation:**
- Use a `FlashList` with custom `renderItem` for notification rows.
- Unread dot via a small `View` with absolute positioning.
- Navigation via `router.push`.
- Tap haptic feedback.

**Data operations:**
- `groupedNotifications` / `useGroupedNotifications` -- Cursor-paginated grouped notifications.
- `unreadNotificationCount` / `useUnreadNotificationCount` -- Badge count for tab bar / header.
- `markNotificationRead` -- Mark a single notification as read.
- `markGroupNotificationsRead` / `useMarkGroupAsRead` -- Mark a notification group as read.
- `markAllNotificationsRead` / `useMarkAllAsRead` -- Mark all notifications as read.
- `notificationReceived` subscription -- Real-time notification delivery.

---

## 11. Settings

### 11.1 Profile Section

**Layout:** Card with "Profile" title and "Manage your profile" subtitle.

**Avatar uploader:**
- 96x96 `Avatar` preview.
- "Upload" / "Change" outlined button (toggles based on whether an avatar exists).
- "Remove" outlined button (visible when an avatar is set).
- Hidden file input accepting `image/jpeg, image/png, image/gif, image/webp`.
- Max input size: 10MB. Images are compressed client-side: resized to max 1024px on longest side, JPEG at 0.85 quality, white fill for transparency.
- Uploads via `POST /api/avatars` to the backend with `Bearer` auth token.
- Hint text below avatar buttons.

**Display Name:**
- `TextField` with person icon adornment, max 100 chars, placeholder text.

**Instagram Profile URL:**
- `TextField` with Instagram icon adornment.
- Validated against `instagram.com/<username>` pattern.

**Email:**
- `TextField`, disabled/read-only, person icon adornment.
- Helper text explaining it cannot be changed.

**Save button:** Full-width contained button. Shows `CircularProgress` spinner while saving. Calls `PUT /api/internal/profile`.

---

### 11.2 Display Preferences

Card with "Display" title and subtitle.

**Grade Format Toggle:**
- `ToggleButtonGroup` with two options: "V-Grade" (V3, V6) and "Font" (6A, 7C+).
- Persisted via `useGradeFormat` hook (IndexedDB).

**Apple Health Integration** (iOS only, conditionally rendered):
- `FormControlLabel` with `Switch` toggle.
- Label and subtitle text.
- Only visible when `isHealthKitAvailable()` returns true.

---

### 11.3 Password Management

**Component:** `SetPasswordSection`

**When password is set:**
- Card with green checkmark icon + "Password Enabled" title.
- Description showing the email address.

**When password is not set:**
- Card with "Set Password" title and description.
- Info alert showing linked OAuth providers (Google, Apple, Facebook).
- Form with:
  - Password field (min 8, max 128 chars, `new-password` autocomplete, lock icon).
  - Confirm password field.
  - "Set Password" contained button with lock icon.
- Validation: required, min length, max length, passwords must match.

---

### 11.4 Aurora Account Linking

**Component:** `AuroraCredentialsSection`

Card for each board type (iterates `AURORA_BOARDS`: kilter, tension).

**Not Connected state:**
- Board name + "Board" suffix as title.
- Description text (Kilter has special "shutdown" text).
- Buttons:
  - "Link Account" contained button (non-Kilter only): Opens link dialog.
  - "Import JSON" outlined button: Opens file picker.
  - "Request Data" outlined button (Kilter only): Opens pre-filled mailto link to Aurora Climbing.

**Connected state:**
- Board name as title + status chip:
  - Active: green `CheckCircleOutlined` + "Connected"
  - Error: red `WarningAmberOutlined` + "Error"
  - Expired: yellow `AccessTimeOutlined` + "Expired"
  - Syncing: blue `SyncOutlined` + "Syncing"
- Info rows: Username, last synced timestamp.
- Error message (if any).
- Unsynced counts warning alert (ascents + climbs).
- Buttons: "Unlink" (red, with confirmation popover) + "Import JSON".

**Link Account Dialog:**
- Title: "Link <Board> Account"
- Username + password text fields.
- "Link Account" contained button.

**Import Flow** (unified dialog with phase transitions):
1. **Preview phase**: Shows parsed export data counts (draft climbs, ascents, attempts, circuits). Cancel/Confirm buttons.
2. **Importing phase**: Step-by-step progress with `ImportProgressSteps`:
   - Steps: Importing draft climbs -> Resolving climb names -> Checking for duplicates -> Importing ascents -> Importing attempts -> Importing circuits -> Building sessions.
   - Each step shows: complete checkmark, active spinner, or pending circle.
   - Active step shows progress bar with count (e.g., "142 / 500").
3. **Complete phase**: Results summary per category (imported/skipped/failed counts). Unresolved climbs warning (shows up to 20 names).
4. **Error phase**: Error alert with message.

---

### 11.5 ESP32 Controllers

**Component:** `ControllersSection`

**Controller List:**
- Cards for each registered controller showing:
  - Name (or "Unnamed Controller").
  - Status chip: Online (green), Offline (default), Never Connected (default).
  - Board type chip (primary color).
  - Layout/Size info row.
  - Last seen timestamp (formatted as relative time: "just now", "5m ago", "2h ago", or full date).
  - "Delete Controller" red outlined button with confirmation popover.

**Add Controller Dialog:**
- Name input (optional, max 100 chars).
- Cascading select dropdowns: Board Type -> Layout -> Size -> Hold Sets (multi-select, auto-selects all on size change).
- "Register Controller" contained button.

**API Key Success Dialog:**
- Warning alert: "Save this key now -- you won't be able to see it again."
- Controller name display.
- Monospace read-only text field with the API key.
- "Copy to Clipboard" outlined button.
- "Done" contained button.

---

### 11.6 Account Deletion

**Component:** `DeleteAccountSection`

**Main card:**
- "Delete Account" title.
- Warning text about permanent deletion.
- "Delete Account" red outlined button.

**Confirmation Dialog:**
- Title: "Delete Your Account".
- Warning text about irreversibility.
- Loading state while fetching `deleteAccountInfo` (published climb count).
- Published climbs notice: "You have X published climbs. These will be preserved but..."
- Checkbox: "Remove my setter name from published climbs" (visible when user has published climbs).
- Type "DELETE" confirmation text field.
- Cancel (text) + "Delete Account" (red contained, disabled until "DELETE" is typed) buttons.
- Calls `DELETE_ACCOUNT` mutation, then `signOut` and redirect to home.

**Data operations:**
- `profile` -- REST `GET /api/internal/profile`.
- `updateProfile` -- REST `PUT /api/internal/profile`.
- `auroraCredentials` -- REST `GET/POST/DELETE /api/internal/aurora-credentials`.
- `myControllers` -- REST `GET/POST/DELETE /api/internal/controllers`.
- `deleteAccountInfo` / `GET_DELETE_ACCOUNT_INFO` -- GraphQL query for published climb count.
- `deleteAccount` / `DELETE_ACCOUNT` -- GraphQL mutation.
- `saveAuroraCredential` -- REST POST.
- `deleteAuroraCredential` -- REST DELETE.
- `registerController` -- REST POST (returns API key).
- `deleteController` -- REST DELETE.

---

## 12. Logbook

### 12.1 Personal Ascents List

**Component:** `LogbookView` (per-climb view within the play/detail screen)

Displays ascents for a specific climb filtered from the user's logbook. Sorted newest-first by `climbed_at`.

**Logbook Entry Card** (`LogbookEntryCard`):
Each card is a full-width `Card` containing:

- **User row** (crew logbook mode only): 32x32 avatar linked to profile + display name.
- **Primary info row** (flex wrap):
  - Date/time in absolute format ("MMM D, YYYY h:mm A").
  - Angle chip (e.g., "40 degrees", primary color).
  - Ascent status icon (Flash / Send / Attempt via `AscentStatusIcon`).
  - Mirrored chip (Tension boards only, secondary color, only when `isMirror` is true).
- **Quality rating**: Read-only `Rating` (1-5 stars, small size). Only shown for successful ascents with quality > 0.
- **Attempt count**: "X attempts" text.
- **Comment**: Pre-wrapped secondary text.
- **Social row** (only for persisted ticks with `tickUuid`):
  - `VoteButton` (like-only mode) with initial up/down votes.
  - `FeedCommentButton` with comment count.

Wrapped in `VoteSummaryProvider` for bulk vote state hydration (max 100 tick UUIDs per batch).

### 12.2 Crew Logbook View

**Component:** `CrewLogbookView`

Shows ascents from followed users on the same climb. Uses `GET_FOLLOWING_CLIMB_ASCENTS` query. Each entry rendered as `LogbookEntryCard` with user info (avatar, name). Empty states: sign-in prompt, load error, "No crew ascents yet".

### 12.3 Logging an Ascent (Tick)

**Component:** `LogAscentForm`

**Type toggle:** Full-width `ToggleButtonGroup` with "Ascent" and "Attempt" options.

**Form fields (label-value rows, 120px label width):**

| Field | Component | Details |
|-------|-----------|---------|
| Boulder | Text + optional Mirrored chip | Climb name (bold), mirror toggle chip (Tension boards only) with tooltip |
| Date and Time | `DateTimePicker` | Defaults to now, small size |
| Angle | `Select` with angle options | Board-specific angles, defaults to effective angle from route/party/climb. Error state when null. 0 degrees is a valid angle. |
| Attempts | `TextField` type number | Min 1, max 999, default 1. Flash = 1 attempt, Send = 2+ attempts |
| Quality | `Rating` (ascent only) | 1-5 stars, default 0 |
| Difficulty | `Select` (ascent only) | Grade override dropdown, "No override" default |
| Notes | `TextField` multiline | 3 rows, optional |
| Beta Video | `TextField` (ascent only) | URL input, validated against TikTok/Instagram/YouTube patterns. Helper text shown. |

**Submit button:** Full-width, large, contained. Text shows "Log at X degrees" when angle is set, or generic "Log" when not. Disabled when saving, video URL invalid, or angle is null.

**Cancel button:** Full-width, large, outlined.

**Wall Drift Banner:**
- Warning `Alert` shown when the party session's current climb differs from the one being logged.
- Shows which climb is on the wall vs. which is being logged.
- "Switch to [climb name]" outlined button (with dirty-form confirmation via `window.confirm`).
- Dismissable via close button.

### 12.4 Logbook Feed (Library Page)

**Component:** `LogbookFeed` (within the library/playlists page context)

Full logbook browser with:

**Search and Filters** (`LogbookSearchForm`):
- Search text field with magnifying glass icon.
- Board filter strip (same as other pages).
- Collapsible filter sections:
  - **Grade range**: Min/max grade pickers using `InlineGradePicker`.
  - **Result type**: Sends/Attempts toggles, Flash only, Benchmark only switches.
  - **Date range**: From/To date pickers.
  - **Angle range**: Slider for angle range filter.
- **Sort options**: Field selector (Newest, Hardest, Most Attempts, etc.) with direction toggle (ascending/descending).

**Feed Items** (`LogbookFeedItem`):
Swipeable cards with:
- Climb thumbnail (`AscentThumbnail`).
- Board/layout display name.
- Climb name, grade, ascent status icon.
- Date, angle, attempt count, quality stars.
- Comment preview.
- Climb icons (benchmark, mirror).
- Swipe actions: Edit (left swipe), Delete (right swipe).
- Inline editing: Star picker, grade picker, attempts picker, comment field.
- Three-dot menu: Edit, Delete, Post to Instagram, Attach Beta Video.

**Export:**
- Download button for per-board JSON export via backend API.

**Data operations:**
- `ticks` / `userTicks` -- User's tick/ascent data (used by `BoardProvider`).
- `userAscentsFeed` / `GET_USER_ASCENTS_FEED` -- Paginated ascent feed with filters (board, grade range, status, date range, angle range, sort).
- `saveTick` -- Creates a new tick/ascent.
- `updateTick` / `useUpdateTick` -- Updates an existing tick (quality, grade, attempts, comment).
- `deleteTick` / `DELETE_TICK` -- Deletes a tick.
- `attachBetaLink` -- Attaches a beta video URL to a tick.
- `followingClimbAscents` / `GET_FOLLOWING_CLIMB_ASCENTS` -- Ascents from followed users on a specific climb.

---

## 13. Data Layer Reference

| Screen | Queries | Mutations | Subscriptions | Local Storage |
|--------|---------|-----------|---------------|---------------|
| **Home** | `popularBoardConfigs`, `recentBetaLinks`, `myBoards`, `searchBoards` | -- | -- | Saved boards (IndexedDB) |
| **Auth** | -- (NextAuth REST API) | -- (NextAuth REST API) | -- | Auth tokens (expo-secure-store on mobile) |
| **Board Selection** | `searchBoards`, `myBoards`, `popularBoardConfigs` | `createBoard` | -- | Selected board config (IndexedDB / expo-secure-store) |
| **Climb List** | `searchClimbs`, `favorites`, `bulkClimbCommunityStatus`, `bulkVoteSummaries` | -- | -- | Recent searches (IndexedDB) |
| **Play View** | `climb`, `similarClimbs`, `comments`, `betaLinks` | `toggleFavorite`, `saveTick`, `addComment`, `vote` | -- | -- |
| **Climb Detail** | `climb`, `similarClimbs`, `comments`, `betaLinks`, `climbStatsHistory`, `climbProposals`, `voteSummary`, `climbCommunityStatus` | `toggleFavorite`, `saveTick`, `addComment`, `vote`, `createProposal` | -- | -- |
| **Create Climb** | -- | `saveClimb`, `saveMoonBoardClimb`, `updateClimb`, `deleteDraftClimb` | -- | -- |
| **Queue** | -- | `addQueueItem`, `removeQueueItem`, `reorderQueueItem`, `setCurrentClimb`, `mirrorCurrentClimb`, `setQueue` | `queueUpdates` | Queue state (IndexedDB) |
| **Session** | `session`, `sessionSummary`, `nearbySessions` | `createSession`, `joinSession`, `endSession` | `sessionUpdates` | Session ID (IndexedDB / session-store) |
| **Party** | `session` | `takeControl`, `releaseControl`, `confirmClimbOnWall`, `setSessionBoardPath`, `setSessionBoardSerial` | `sessionUpdates`, `queueUpdates` | Party profile (IndexedDB) |
| **Playlists** | `allUserPlaylists`, `myPinnedPlaylists`, `playlist`, `playlistClimbs`, `discoverPlaylists`, `searchPlaylists`, `mySmartPlaylistCounts`, `smartPlaylist` | `createPlaylist`, `updatePlaylist`, `deletePlaylist`, `addClimbToPlaylist`, `removeClimbFromPlaylist`, `pinPlaylist`, `unpinPlaylist`, `followPlaylist`, `unfollowPlaylist` | -- | Recent playlists (IndexedDB) |
| **Profile** | `publicProfile`, `userProfileStats`, `userClimbPercentile`, `userAscentsFeed`, `userGroupedAscentsFeed`, `followers`, `following`, `isFollowing`, `userBetaLinks`, `sessionGroupedFeed`, `userClimbs`, `setterProfile`, `setterClimbs` | `followUser`, `unfollowUser` | -- | -- |
| **Feed** | `sessionGroupedFeed`, `browseProposals`, `globalCommentFeed`, `bulkVoteSummaries` | `vote`, `addComment`, `voteOnProposal` | -- | -- |
| **Notifications** | `groupedNotifications`, `unreadNotificationCount` | `markNotificationRead`, `markGroupNotificationsRead`, `markAllNotificationsRead` | `notificationReceived` | -- |
| **Settings** | `profile` (REST), `auroraCredentials` (REST), `myControllers` (REST), `deleteAccountInfo` | `updateProfile` (REST), `saveAuroraCredential` (REST), `deleteAuroraCredential` (REST), `registerController` (REST), `deleteController` (REST), `deleteAccount`, `setPassword` (REST) | -- | Grade format (IndexedDB), HealthKit pref (IndexedDB) |
| **Logbook** | `userAscentsFeed`, `followingClimbAscents`, `ticks` | `saveTick`, `updateTick`, `deleteTick`, `attachBetaLink` | -- | Logbook filter prefs (IndexedDB) |
| **Onboarding** | -- | -- | -- | Onboarding status (IndexedDB) |
| **Social** (cross-cutting) | `bulkVoteSummaries`, `comments`, `followers`, `following` | `vote`, `addComment`, `deleteComment`, `followUser`, `unfollowUser` | -- | -- |

---

## 14. Current Mobile App Gap Analysis

The following table compares every web feature against the current state of the React Native mobile app in `packages/mobile/`.

| Feature | Web | Mobile | Status | Notes |
|---------|-----|--------|--------|-------|
| **Auth: Email login** | Email + password login | Built | Complete | Uses `expo-auth-session` for OAuth, custom email login flow |
| **Auth: OAuth (Google/Apple)** | Google + Apple sign-in | Built | Complete | OAuth via `expo-auth-session` with callback route |
| **Auth: Signup + Verify** | Email signup with verification | Built | Complete | Same API endpoints, custom UI |
| **Board Selection: My Boards list** | List of user's saved boards with board details | Built | Complete | `BoardSelection` screen shows user boards as cards with active indicator |
| **Board Selection: Map search** | Map-based gym/board search | Not built | Missing | Mobile has no map or location-based board discovery |
| **Board Selection: Popular configs** | Popular board config suggestions | Not built | Missing | No popular/suggested boards in mobile board selection |
| **Board Selection: Custom board config** | Full board config selector (layout/size/sets) | Not built | Missing | Mobile relies on web-created board configs |
| **Climb Browsing: List view** | Vertical list with infinite scroll | Built | Complete | `FlashList` with infinite scroll pagination, `ClimbListRow` component |
| **Climb Browsing: Grid view** | Toggle between grid and list layouts | Not built | Missing | Mobile only supports list view |
| **Climb Browsing: Search** | Native search bar with debounce | Built | Complete | iOS native `headerSearchBarOptions` with 300ms debounce |
| **Climb Browsing: Filters** | Grade range, min ascents, min rating, sort | Built | Complete | `ClimbFilterSheet` bottom sheet with grade/ascent/rating/sort filters |
| **Climb Browsing: Favorites** | Favorite/unfavorite climbs | Built | Complete | Toggle favorite on climb detail via `useToggleFavorite` |
| **Play View: Board rendering** | SVG board with hold overlay | Built | Complete | `BoardRenderer` component with `BoardHoldOverlay` using `Image` layers |
| **Play View: Carousel/swipe** | Horizontal swipe between climbs | Not built | Missing | Mobile has no swipe navigation between climbs |
| **Play View: Zoom/pan** | Pinch-to-zoom on board image | Not built | Missing | Board image is static, no gesture handling |
| **Play View: Climb actions** | Add to queue, favorite, share, tick | Partial | Partial | Add to queue and tick logging built; no share or climb action menu |
| **Play View: Tick logging** | Full log ascent form in drawer | Built | Complete | `LogAscentSheet` with angle, attempts, quality, notes, mirrored toggle |
| **Queue: List view** | Vertical list of queued climbs | Built | Complete | `FlashList` with `QueueItemRow` components |
| **Queue: Navigation controls** | Previous/next, current climb info | Built | Complete | Bottom nav bar with prev/next buttons, current climb name/grade |
| **Queue: Drag reorder** | Drag-and-drop reorder via handle | Not built | Missing | No drag reorder gesture in mobile queue |
| **Queue: Swipe actions** | Swipe to remove from queue | Not built | Missing | Remove only via button, no swipe gesture |
| **Queue: Bluetooth send** | Send climb to board via BLE | Built | Complete | `BluetoothStatusIcon` + `ConnectionBanner` in queue nav bar |
| **Session: Create** | Create session drawer with goal/name | Not built | Missing | Sessions auto-created when first tick is logged |
| **Session: Summary** | End session with full summary view | Built | Complete | `SessionSummaryScreen` with stats, grade chart, participants, goal |
| **Session: Details** | Session detail page with all ticks | Not built | Missing | No dedicated session detail screen |
| **Party Mode: Driver control** | Take/release control, wall confirmation | Not built | Missing | No party mode UI in mobile |
| **Party Mode: Real-time sync** | WebSocket-based real-time queue sync | Partial | Partial | WS client exists (`ws-client.ts`) but no party-specific UI |
| **Bluetooth: Connect/scan** | Web Bluetooth connection | Built | Complete | `react-native-ble-plx` with device picker sheet |
| **Bluetooth: Device picker** | Device selection drawer | Built | Complete | `DevicePickerSheet` with scanning state and device cards |
| **Bluetooth: Light control** | Detailed BLE control drawer | Not built | Missing | No advanced light control drawer |
| **Playlists: Library page** | Pinned, Jump Back In, Discover, Smart playlists | Not built | Missing | No playlist screens in mobile |
| **Playlists: Detail page** | Playlist with climbs, comments, share | Not built | Missing | No playlist detail screen |
| **Playlists: Create/edit** | Create and edit playlist drawers | Not built | Missing | No playlist creation/editing |
| **Playlists: Smart playlists** | Five Stars, Most Repeated, Projects | Not built | Missing | No smart playlist feature |
| **Playlists: Pin/follow** | Pin and follow playlists | Not built | Missing | No pin/follow functionality |
| **Profile: Own profile** | Avatar, name, email, follower counts | Partial | Partial | Basic profile with avatar, name, email, sign-out button. No follower counts or stats. |
| **Profile: Public profile** | View other users' profiles | Not built | Missing | No navigation to other user profiles |
| **Profile: Follow/unfollow** | Follow button on other profiles | Not built | Missing | No follow/unfollow functionality |
| **Profile: Statistics** | Grade charts, activity heatmap, percentile | Not built | Missing | No statistics sub-page |
| **Profile: Sessions** | Session history feed | Not built | Missing | No sessions sub-page |
| **Profile: Created climbs** | List of user's set climbs | Not built | Missing | No created climbs sub-page |
| **Profile: Instagram link** | Instagram profile URL display | Not built | Missing | No Instagram link display |
| **Feed: Sessions tab** | Session cards from followed climbers | Not built | Missing | No feed screens in mobile |
| **Feed: Proposals tab** | Community climb proposals with voting | Not built | Missing | No proposal feed |
| **Feed: Comments tab** | Global comment feed | Not built | Missing | No comment feed |
| **Feed: Board filter** | Filter feed by board | Not built | Missing | No feed to filter |
| **Notifications: List** | Grouped notification list with types | Not built | Missing | No notification screen in mobile |
| **Notifications: Unread badge** | Badge count on tab/header | Not built | Missing | No notification badge |
| **Notifications: Real-time** | WebSocket subscription for new notifications | Not built | Missing | No notification subscription |
| **Notifications: Mark as read** | Mark individual/all as read | Not built | Missing | No notification management |
| **Settings: Profile editing** | Avatar, name, Instagram, email | Not built | Missing | Only sign-out button on profile page |
| **Settings: Grade format** | V-Grade vs Font toggle | Not built | Missing | No display preferences |
| **Settings: Apple Health** | HealthKit integration toggle | Not built | Missing | No HealthKit integration |
| **Settings: Password** | Set/manage password | Not built | Missing | No password management |
| **Settings: Aurora linking** | Link Kilter/Tension accounts | Not built | Missing | No Aurora account linking |
| **Settings: Aurora import** | JSON file import with progress | Not built | Missing | No data import |
| **Settings: Controllers** | ESP32 controller management | Not built | Missing | No controller management |
| **Settings: Delete account** | Account deletion flow | Not built | Missing | No account deletion |
| **Logbook: Full logbook view** | Paginated logbook with filters and search | Not built | Missing | No dedicated logbook browser |
| **Logbook: Basic tick logging** | Log ascent/attempt with form | Built | Complete | `LogAscentSheet` in queue and climb detail |
| **Logbook: Edit tick** | Edit existing ascent inline | Not built | Missing | No tick editing |
| **Logbook: Delete tick** | Delete ascent with undo | Not built | Missing | No tick deletion |
| **Logbook: Export** | Export logbook as JSON | Not built | Missing | No export functionality |
| **Logbook: Crew logbook** | Ascents from followed users on same climb | Not built | Missing | No crew logbook view |
| **Onboarding: Tour overlay** | Interactive feature tour overlay | Not built | Missing | No onboarding flow |
| **Social: Follow users** | Follow/unfollow with follower lists | Not built | Missing | No social follow system |
| **Social: Comments** | Comment on climbs, ticks, sessions | Not built | Missing | No commenting |
| **Social: Likes/votes** | Like/vote on ticks, sessions, comments | Not built | Missing | No voting |
| **Social: Proposals** | Create/vote on climb proposals | Not built | Missing | No proposal system |
| **Beta Videos: Attach** | Attach TikTok/IG/YouTube video to tick | Not built | Missing | No beta video attachment |
| **Beta Videos: View** | View beta videos on climb detail | Not built | Missing | No beta video gallery |
| **Beta Videos: Gallery** | User's contributed beta videos | Not built | Missing | No beta section on profile |
| **Climb Creation: Hold editor** | Interactive hold placement editor | Not built | Missing | No climb creation |
| **Climb Creation: Form** | Name, grade, description, visibility | Not built | Missing | No climb creation form |
| **i18n: Multi-language** | English, Spanish, French | Built | Complete | `i18n-provider.tsx` with English locale catalogs |
| **Haptics** | -- (web has no haptics) | Built | Complete | `hapticSelection`, `hapticSuccess` via `expo-haptics` |

**Summary of mobile coverage:**
- **Complete**: 15 features (Auth, board selection list, climb list/search/filters, board rendering, basic tick logging, queue list/navigation, session summary, BLE connect/scan, i18n, haptics)
- **Partial**: 4 features (play view actions, party mode real-time, own profile, BLE integration)
- **Missing**: 40+ features (playlists, feed, notifications, settings, full logbook, social, climb creation, onboarding, public profiles, map search, and more)
