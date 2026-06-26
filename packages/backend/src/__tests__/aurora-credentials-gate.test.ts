import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// `isKilterSyncAllowed` reads KILTER_SYNC_ALLOWED_USER_IDS once at module load,
// so each case re-imports the module with `vi.resetModules()` after setting the
// env. Mock the db client so importing the service never opens a connection.
vi.mock('../db/client', () => ({ db: {}, dbRead: {} }));

async function loadGate(allowList: string | undefined) {
  vi.resetModules();
  if (allowList === undefined) {
    delete process.env.KILTER_SYNC_ALLOWED_USER_IDS;
  } else {
    process.env.KILTER_SYNC_ALLOWED_USER_IDS = allowList;
  }
  const module = await import('../services/aurora-credentials');
  return module.isKilterSyncAllowed;
}

describe('isKilterSyncAllowed', () => {
  const originalAllowList = process.env.KILTER_SYNC_ALLOWED_USER_IDS;

  beforeEach(() => {
    process.env.AURORA_CREDENTIALS_SECRET ??= 'test-aurora-secret';
  });

  afterEach(() => {
    if (originalAllowList === undefined) {
      delete process.env.KILTER_SYNC_ALLOWED_USER_IDS;
    } else {
      process.env.KILTER_SYNC_ALLOWED_USER_IDS = originalAllowList;
    }
  });

  it('disables everyone when unset', async () => {
    const isKilterSyncAllowed = await loadGate(undefined);
    expect(isKilterSyncAllowed('any-user')).toBe(false);
  });

  it('disables everyone when empty', async () => {
    const isKilterSyncAllowed = await loadGate('');
    expect(isKilterSyncAllowed('any-user')).toBe(false);
  });

  it('allows every user with the * wildcard', async () => {
    const isKilterSyncAllowed = await loadGate('*');
    expect(isKilterSyncAllowed('user-a')).toBe(true);
    expect(isKilterSyncAllowed('user-b')).toBe(true);
  });

  it('honours an explicit comma-separated allowlist', async () => {
    const isKilterSyncAllowed = await loadGate('user-a, user-b');
    expect(isKilterSyncAllowed('user-a')).toBe(true);
    expect(isKilterSyncAllowed('user-b')).toBe(true);
    expect(isKilterSyncAllowed('user-c')).toBe(false);
  });
});
