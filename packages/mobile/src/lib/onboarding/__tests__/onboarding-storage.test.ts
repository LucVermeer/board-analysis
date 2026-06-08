import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the secure-store adapter (the seam) rather than expo-secure-store.
const getMock = vi.fn();
const setMock = vi.fn();
const removeMock = vi.fn();
vi.mock('../../preferences/secure-store-adapter', () => ({
  secureStorePreferences: {
    get: (key: string) => getMock(key),
    set: (key: string, value: unknown) => setMock(key, value),
    remove: (key: string) => removeMock(key),
  },
}));

import { ONBOARDING_SEEN_KEY } from '@boardsesh/key-value-storage';
import { clearOnboardingSeen, hasSeenOnboarding, markOnboardingSeen } from '../onboarding-storage';

describe('onboarding storage', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset();
    removeMock.mockReset();
  });

  it('reports unseen on a fresh install (flag absent)', async () => {
    getMock.mockResolvedValue(null);
    await expect(hasSeenOnboarding()).resolves.toBe(false);
    expect(getMock).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY);
  });

  it('reports seen once the flag is true', async () => {
    getMock.mockResolvedValue(true);
    await expect(hasSeenOnboarding()).resolves.toBe(true);
  });

  it('treats a storage read error as unseen (show the tour rather than skip it)', async () => {
    getMock.mockRejectedValue(new Error('keychain unavailable'));
    await expect(hasSeenOnboarding()).resolves.toBe(false);
  });

  it('persists the seen flag as true', async () => {
    setMock.mockResolvedValue(undefined);
    await markOnboardingSeen();
    expect(setMock).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY, true);
  });

  it('clears the seen flag for replay', async () => {
    removeMock.mockResolvedValue(undefined);
    await clearOnboardingSeen();
    expect(removeMock).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY);
  });
});
