/**
 * Layout Screenshot Tests
 *
 * Captures screenshots of every unique board layout Boardsesh supports.
 * For each layout we:
 *   1. Navigate to the climb list (biggest available board size, default sets, 40°)
 *   2. Screenshot the climb list
 *   3. Tap the first climb's thumbnail to open the play-view drawer
 *   4. Screenshot the play-view drawer
 *
 * Screenshots are saved to e2e/screenshots/layouts/.
 *
 * Run:
 *   bunx playwright test e2e/layout-screenshots.spec.ts
 *
 * Prerequisites:
 *   - Dev server running (or use `bun run test:e2e:setup` first)
 */
import { test } from '@playwright/test';
import path from 'path';
import { mkdirSync } from 'fs';
import { waitForBoardListReady, waitForDrawerOpen } from './helpers/waits';

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots/layouts');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Viewport/device settings come from the layout-screenshots project in
// playwright.config.ts (iPhone 16 Pro Max, 440×956 @ 3×).

/**
 * One entry per unique board layout.
 * URLs use numeric IDs (layout_id/size_id/set_ids) — the app accepts both
 * numeric and slug-based routes via hasOnlyNumericBoardRouteSegments().
 *
 * Size chosen is the largest physical board for each layout:
 *   kilter  layout 1  → size 28  "16 x 12 Super Wide"      sets 1,20  (Bolt Ons, Screw Ons)
 *   kilter  layout 8  → size 25  "10x12 Full Ride LED Kit"  sets 26,27,28,29
 *   tension layout 9  → size 1   "Full Wall"                sets 8,9,10,11
 *   tension layout 10 → size 6   "12 high x 12 wide"        sets 12,13  (Wood, Plastic)
 *   tension layout 11 → size 6   "12 high x 12 wide"        sets 12,13  (Wood, Plastic)
 */
const LAYOUTS = [
  {
    name: 'kilter-original',
    label: 'Kilter Board Original',
    url: '/kilter/1/28/1,20/40/list',
  },
  {
    name: 'kilter-homewall',
    label: 'Kilter Board Homewall',
    url: '/kilter/8/25/26,27,28,29/40/list',
  },
  {
    name: 'tension-original',
    label: 'Tension Original Layout',
    url: '/tension/9/1/8,9,10,11/40/list',
  },
  {
    name: 'tension-two-mirror',
    label: 'Tension Board 2 Mirror',
    url: '/tension/10/6/12,13/40/list',
  },
  {
    name: 'tension-two-spray',
    label: 'Tension Board 2 Spray',
    url: '/tension/11/6/12,13/40/list',
  },
] as const;

test.describe('Layout Screenshots', () => {
  // Run layouts one-at-a-time so heavy board-image loads don't pile up
  // on the dev server (and so any single layout's failure doesn't poison
  // the next via shared test-server state).
  test.describe.configure({ mode: 'serial' });

  // Board image assets can be large — give each test plenty of headroom
  test.setTimeout(90_000);

  for (const layout of LAYOUTS) {
    test(`${layout.label}`, async ({ page }) => {
      // ── 1. Navigate to the climb list ──────────────────────────────────────
      await page.goto(layout.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // Wait for the first climb card to render (board image assets may be slow)
      await waitForBoardListReady(page, 60_000);

      // ── 2. Screenshot: climb list ───────────────────────────────────────────
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${layout.name}-01-climb-list.png`,
      });

      // ── 3. Tap the first climb's thumbnail ─────────────────────────────────
      // Clicking the thumbnail activates the climb AND dispatches the
      // open-play-drawer event (see climbs-list.tsx → handleClimbThumbnailClickByIndex).
      const thumbnail = page.locator('#onboarding-climb-card [data-testid="climb-thumbnail"]');
      await thumbnail.waitFor({ state: 'visible', timeout: 10_000 });
      await thumbnail.click();

      // ── 4. Wait for the play-view drawer ───────────────────────────────────
      await waitForDrawerOpen(page, 0, 15_000);

      // ── 5. Screenshot: play-view drawer ────────────────────────────────────
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${layout.name}-02-play-drawer.png`,
      });
    });
  }
});
