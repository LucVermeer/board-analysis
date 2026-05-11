import { chromium, type FullConfig } from '@playwright/test';

const BOARD_URL = '/kilter/original/12x12-square/screw_bolt/40/list';
const WARMUP_PATHS = ['/playlists', '/feed'] as const;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'test@boardsesh.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'test';

class SetupError extends Error {
  constructor(message: string, hint?: string) {
    super(hint ? `${message}\n\nHint: ${hint}` : message);
    this.name = 'E2E global-setup failed';
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    // 1. Server reachable + board route renders climb cards
    try {
      await page.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('#onboarding-climb-card, [data-testid="climb-card"]', { timeout: 30_000 });
    } catch (cause) {
      throw new SetupError(
        `Board URL ${BOARD_URL} did not render any climb cards within 30s.`,
        'Confirm the dev server is up at ' +
          baseURL +
          ' and the dev DB image is current (`docker compose down -v && vp run db:up`). ' +
          `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    // 2. Test user can log in
    try {
      await page.goto(`/auth/login?callbackUrl=${encodeURIComponent('/')}`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Email').fill(TEST_USER_EMAIL);
      await page.getByLabel('Password').fill(TEST_USER_PASSWORD);
      await page.getByRole('button', { name: 'Login' }).click();
      await page.waitForURL('/', { timeout: 20_000 });
    } catch (cause) {
      throw new SetupError(
        `Test user ${TEST_USER_EMAIL} failed to log in.`,
        'Confirm the seeded dev DB image includes this user (the boardsesh-dev-db image ships ' +
          'test@boardsesh.com / test by default). Set TEST_USER_EMAIL/TEST_USER_PASSWORD if you ' +
          `intend to use a different account. Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    // 3. Pre-warm the SSR routes that queue-persistence and bottom-tab-bar
    //    navigate to. Both call cached GraphQL on the server and trigger
    //    Next.js's compile-on-first-hit in dev. Without this, the first
    //    navigation in a test races a cold backend round-trip against the
    //    per-navigation timeout — the recurring shard-5 / shard-4 flake mode.
    for (const path of WARMUP_PATHS) {
      await page.goto(path, { timeout: 60_000, waitUntil: 'domcontentloaded' }).catch(() => {
        // Soft-fail: warmup is best-effort. If a warmup route is genuinely
        // broken the spec that depends on it will surface the failure.
      });
    }

    await context.close();
  } finally {
    await browser.close();
  }
}
