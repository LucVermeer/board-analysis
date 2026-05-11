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

// Soft wait: if skeletons never fully unmount within the timeout, resolve
// rather than throw. Boardsesh renders MUI Skeletons in two patterns:
//   1. "page is loading data" — these unmount once the data arrives.
//   2. "image is still decoding" — these can linger as long as their
//      <Image> sibling is still loading network bytes. Some screenshots
//      need to fire before every last image decodes (the bluetooth
//      picker is the canonical case), so a strict assertion would
//      regress those.
// Callers that need a hard assertion can use the underlying expect()
// directly. The intent of this helper is "give visible loading
// affordances time to clear before snapping a screenshot."
export async function waitForSkeletonsGone(page: Page, timeout = 30_000): Promise<void> {
  try {
    await expect(page.locator(SKELETON)).toHaveCount(0, { timeout });
  } catch {
    // Soft-fail: caller's next assertion / screenshot is the real check.
  }
}
