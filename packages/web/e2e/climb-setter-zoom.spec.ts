/**
 * E2E tests for the zoomable climb setter.
 *
 * Renders the create-climb screen, captures a baseline screenshot,
 * performs a pinch-zoom on the board via the Chrome DevTools Protocol,
 * then captures a second screenshot showing the zoomed-in state.
 *
 * Screenshots are saved as per-test attachments (test-results/<test>/*.png)
 * and embedded in the Playwright HTML report.
 */
import { test, expect, type Page } from '@playwright/test';

// Touch emulation is required so @use-gesture/react's pinch handler fires
// from CDP-dispatched touch events. Override the chromium project defaults.
test.use({
  viewport: { width: 430, height: 932 },
  hasTouch: true,
  isMobile: true,
});

const createUrl = '/kilter/original/12x12-square/screw_bolt/40/create';

/**
 * Dispatch a two-finger pinch gesture via CDP. Playwright has no native pinch
 * helper, so we synthesize touch events directly. The touchpoints share stable
 * `id`s across the Start/Move/End phases so Chromium tracks them as a single
 * continuous gesture.
 */
async function pinchZoom(
  page: Page,
  center: { x: number; y: number },
  fromDistance: number,
  toDistance: number,
  steps = 12,
) {
  const client = await page.context().newCDPSession(page);

  const pointsAt = (offset: number) => [
    { x: center.x - offset / 2, y: center.y, id: 0, radiusX: 2, radiusY: 2, force: 1 },
    { x: center.x + offset / 2, y: center.y, id: 1, radiusX: 2, radiusY: 2, force: 1 },
  ];

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: pointsAt(fromDistance),
  });

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const offset = fromDistance + (toDistance - fromDistance) * progress;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pointsAt(offset),
    });
    await page.waitForTimeout(16);
  }

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });

  await client.detach();
}

test.describe('Climb Setter - Zoomable Board', () => {
  test.setTimeout(90_000);

  test('renders create screen and pinch-zooms the board', async ({ page }, testInfo) => {
    await page.goto(createUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const setter = page.getByTestId('climb-setter');
    await expect(setter).toBeVisible({ timeout: 30_000 });

    const boardSection = page.getByTestId('climb-setter-board');
    await expect(boardSection).toBeVisible();

    // Wait for the board SVG (BoardRenderer) to mount inside the zoom container.
    const boardSvg = boardSection.locator('svg').first();
    await expect(boardSvg).toBeVisible({ timeout: 30_000 });

    // Give images a moment to finish decoding before capturing the baseline.
    // Boardsesh holds long-lived WebSocket subscriptions (party mode etc.)
    // that keep `networkidle` from ever firing in this app, so this is a
    // bounded settle rather than a network-quiet wait.
    await page.waitForTimeout(400);

    // Baseline screenshot: zoomed-out board with header + action bar visible.
    const beforePath = testInfo.outputPath('create-screen-initial.png');
    await page.screenshot({ path: beforePath, fullPage: false });
    await testInfo.attach('create-screen-initial', { path: beforePath, contentType: 'image/png' });

    // Reset button is always in the DOM but hidden via opacity until zoom activates.
    // Assert it's not interactable before zooming (tabindex=-1 + opacity:0).
    const resetButton = page.getByRole('button', { name: 'Reset zoom' });
    await expect(resetButton).toHaveAttribute('tabindex', '-1');
    await expect(resetButton).toHaveCSS('opacity', '0');

    // Pinch out from the center of the board.
    const box = await boardSection.boundingBox();
    if (!box) throw new Error('climb-setter-board has no bounding box');
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await pinchZoom(page, center, 80, 260);

    // Once the pinch ends, useZoomPan flips isZoomed=true, which causes
    // ZoomableBoard to set data-swipe-blocked on the container and tabIndex=0
    // on the reset button. We assert both as a sanity check.
    await expect(boardSection.locator('[data-swipe-blocked]')).toHaveCount(1, { timeout: 5_000 });
    await expect(resetButton).toHaveAttribute('tabindex', '0', { timeout: 5_000 });

    // Zoomed screenshot: board should appear magnified compared to baseline.
    const afterPath = testInfo.outputPath('create-screen-zoomed.png');
    await page.screenshot({ path: afterPath, fullPage: false });
    await testInfo.attach('create-screen-zoomed', { path: afterPath, contentType: 'image/png' });
  });
});
