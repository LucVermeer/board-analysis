import { expect, type Page, type Locator } from '@playwright/test';

const CLIMB_CARD_OR_ONBOARDING = '#onboarding-climb-card, [data-testid="climb-card"]';
const SWIPEABLE_DRAWER_VISIBLE = '[data-swipeable-drawer="true"]:visible';
const SKELETON = '.MuiSkeleton-root';

export async function waitForBoardListReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForSelector(CLIMB_CARD_OR_ONBOARDING, { timeout });
}

export function drawer(page: Page, index = 0): Locator {
  return page.locator(SWIPEABLE_DRAWER_VISIBLE).nth(index);
}

export async function waitForDrawerOpen(page: Page, index = 0, timeout = 10_000): Promise<void> {
  await drawer(page, index).waitFor({ timeout });
}

export async function waitForSkeletonsGone(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator(SKELETON)).toHaveCount(0, { timeout });
}
