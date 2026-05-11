import { type Page, test, expect } from '@playwright/test';

/**
 * E2E tests for queue persistence across navigation.
 *
 * These tests verify that the queue state is preserved when navigating
 * away from the board page and back, using the queue bridge architecture.
 */

const bottomTabBar = '[data-testid="bottom-tab-bar"]';
const queueControlBar = '[data-testid="queue-control-bar"]';

// Helper to wait for the board page to be ready
async function waitForBoardPage(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#onboarding-climb-card, [data-testid="climb-card"]', {
    timeout: 30000,
  });
}

// Helper to add a climb to the queue via double-click and return the climb name
async function addClimbToQueue(page: Page): Promise<string> {
  const climbCard = page.locator('#onboarding-climb-card');
  await expect(climbCard).toBeVisible({ timeout: 15000 });
  await climbCard.dblclick();
  await page.waitForSelector(queueControlBar, { timeout: 10000 });

  const queueToggle = page.locator('#onboarding-queue-toggle');
  await expect(queueToggle).toBeVisible({ timeout: 5000 });
  const climbName = ((await queueToggle.textContent()) ?? '').trim();
  expect(climbName).toBeTruthy();
  return climbName;
}

// Helper to verify the queue bar shows the expected climb
async function verifyQueueShowsClimb(page: Page, expectedClimbName: string, timeout = 5000) {
  const bar = page.locator(queueControlBar);
  await expect(bar).toBeVisible({ timeout: 10000 });
  await expect(bar).toContainText(expectedClimbName, { timeout });
}

// Scoped tab button selector to avoid ambiguity with multiple bars during transitions
function bottomTabButton(page: Page, name: string, exact = false) {
  return page.locator(bottomTabBar).getByRole('button', { name, exact });
}

test.describe('Queue Persistence - Local Mode', () => {
  const boardUrl = '/kilter/original/12x12-square/screw_bolt/40/list';

  // /playlists and /feed are pre-warmed once by global-setup.ts so the first
  // navigation during a test doesn't race a cold-path backend round-trip
  // against the navigation timeout (the recurring shard-5 flake mode).
  test.beforeEach(async ({ page }) => {
    await page.goto(boardUrl);
    await waitForBoardPage(page);
  });

  test('queue should persist when navigating to home and back', async ({ page }) => {
    const climbName = await addClimbToQueue(page);

    // Navigate to home via bottom tab bar (client-side navigation preserves state)
    await bottomTabButton(page, 'Home').click();
    await expect(page).toHaveURL('/', { timeout: 15000 });

    // Queue bar should show same climb on home page
    await verifyQueueShowsClimb(page, climbName);

    // Navigate back to the board via bottom tab bar
    await bottomTabButton(page, 'Climb', true).click();
    await expect(page).toHaveURL(/\/kilter\//, { timeout: 20000 });

    // Verify queue bar still shows same climb after returning
    await verifyQueueShowsClimb(page, climbName, 15000);
  });

  test('global bar should appear with correct climb when navigating away', async ({ page }) => {
    const climbName = await addClimbToQueue(page);

    // Navigate to home via bottom tab bar (client-side navigation)
    await bottomTabButton(page, 'Home').click();
    await expect(page).toHaveURL('/', { timeout: 15000 });

    // Queue control bar should show the same climb on the non-board page
    await verifyQueueShowsClimb(page, climbName);
  });

  test('queue control bar should persist correct climb across all pages', async ({ page }) => {
    test.slow(); // This test walks several pages with queue verification on each
    const climbName = await addClimbToQueue(page);

    // Note: an earlier version of this test also navigated via the user
    // drawer → /settings (then /help) to exercise the non-tab-bar path.
    // /settings requires auth (3c4c5271), and the drawer pathway is
    // covered by the bottom-tab-bar spec's queue-integration tests; this
    // test focuses on the tab-bar persistence path specifically.

    // 1. Navigate to Home via bottom tab bar
    await bottomTabButton(page, 'Home').click();
    await expect(page).toHaveURL('/', { timeout: 15_000 });
    await verifyQueueShowsClimb(page, climbName);

    // 2. Navigate to Discover via bottom tab bar
    await bottomTabButton(page, 'Discover').click();
    await expect(page).toHaveURL(/\/playlists/, { timeout: 15_000 });
    await verifyQueueShowsClimb(page, climbName);

    // 3. Navigate to Feed via bottom tab bar (Notifications tab was removed;
    //    Feed is a second public route that exercises the persistence path).
    await bottomTabButton(page, 'Feed').click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 15_000 });
    await verifyQueueShowsClimb(page, climbName);

    // 4. Navigate back to climb list via bottom tab bar.
    // Board route re-mounts its own queue bar and restores from the
    // in-memory bridge state.
    await bottomTabButton(page, 'Climb', true).click();
    await expect(page).toHaveURL(/\/kilter\//, { timeout: 20_000 });
    await verifyQueueShowsClimb(page, climbName, 15000);
  });

  test('clicking global bar thumbnail should keep current route and open play drawer context', async ({ page }) => {
    test.slow(); // Queue setup + navigation + thumbnail click
    const climbName = await addClimbToQueue(page);

    // Navigate to home via bottom tab bar (client-side navigation preserves queue state)
    await bottomTabButton(page, 'Home').click();
    await expect(page).toHaveURL('/', { timeout: 15000 });

    // Verify climb is still shown before clicking
    await verifyQueueShowsClimb(page, climbName);

    // Click the thumbnail button within the queue bar
    const queueBar = page.locator(queueControlBar);
    const thumbnailButton = queueBar.getByRole('button').first();
    await thumbnailButton.click();

    // Route should remain stable; thumbnail should activate/open play context instead of navigating to climb info.
    await expect(page).toHaveURL('/', { timeout: 10000 });
    await verifyQueueShowsClimb(page, climbName, 15000);
  });
});

test.describe('Queue Persistence - Board Switch', () => {
  test('queue should NOT persist across full page navigations (no IndexedDB persistence)', async ({ page }) => {
    const boardUrl1 = '/kilter/original/12x12-square/screw_bolt/40/list';
    const boardUrl2 = '/kilter/original/12x12-square/screw_bolt/45/list'; // Different angle

    // Navigate to first board and add a climb
    await page.goto(boardUrl1);
    await waitForBoardPage(page);
    await addClimbToQueue(page);

    // Full page navigation destroys in-memory state; queue is not persisted to IndexedDB
    await page.goto(boardUrl2);
    await waitForBoardPage(page);

    // Queue bar should NOT be visible (queue lost on full page reload)
    const bar = page.locator(queueControlBar);
    await expect(bar).not.toBeVisible({ timeout: 3000 });
  });
});
