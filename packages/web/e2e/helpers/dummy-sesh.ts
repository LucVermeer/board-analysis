import { type Page } from '@playwright/test';

const DUMMY_SESH_EVENT = 'onboarding:open-dummy-sesh';
const SWIPEABLE_DRAWER_VISIBLE = '[data-swipeable-drawer="true"]:visible';

export async function openDummySesh(
  page: Page,
  options: { maxAttempts?: number; interAttemptMs?: number } = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 10;
  const interAttemptMs = options.interAttemptMs ?? 500;

  const drawer = page.locator(SWIPEABLE_DRAWER_VISIBLE).first();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await page.evaluate((eventName) => {
      window.dispatchEvent(new CustomEvent(eventName));
    }, DUMMY_SESH_EVENT);
    try {
      await drawer.waitFor({ timeout: interAttemptMs });
      return;
    } catch {
      if (attempt === maxAttempts - 1) {
        throw new Error(`Dummy sesh drawer never mounted after ${maxAttempts} dispatches`);
      }
    }
  }
}
