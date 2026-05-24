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

