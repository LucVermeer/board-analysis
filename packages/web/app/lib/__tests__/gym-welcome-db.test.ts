import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { isGymWelcomeDismissed, dismissGymWelcome } from '../gym-welcome-db';

const DB_NAME = 'boardsesh-gym-welcome';
const STORE_NAME = 'gym-welcome';

const GYM_A = 'gym-uuid-a';
const GYM_B = 'gym-uuid-b';

beforeEach(async () => {
  const db = await openDB(DB_NAME, 1, {
    upgrade(upgradeDb) {
      if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
        upgradeDb.createObjectStore(STORE_NAME);
      }
    },
  });
  await db.clear(STORE_NAME);
  db.close();
});

describe('gym-welcome-db', () => {
  it('is not dismissed by default', async () => {
    expect(await isGymWelcomeDismissed(GYM_A)).toBe(false);
  });

  it('persists dismissal for a gym', async () => {
    await dismissGymWelcome(GYM_A);
    expect(await isGymWelcomeDismissed(GYM_A)).toBe(true);
  });

  it('scopes dismissal per gym', async () => {
    await dismissGymWelcome(GYM_A);
    expect(await isGymWelcomeDismissed(GYM_A)).toBe(true);
    // Dismissing one gym must not dismiss another.
    expect(await isGymWelcomeDismissed(GYM_B)).toBe(false);
  });
});
