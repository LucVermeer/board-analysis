import { describe, it, expect, vi, beforeEach } from 'vitest';

// analytics-bootstrap.ts is the one module allowed to import party-profile-store.ts
// (and, transitively, the real expo-secure-store) from the analytics call graph.
// Mock party-profile-store.ts directly rather than expo-secure-store, so this
// test never touches the real (RN-Flow-syntax) native module.
const getOrCreatePartyProfileIdSyncMock = vi.fn();
vi.mock('../party-profile-store', () => ({
  getOrCreatePartyProfileIdSync: getOrCreatePartyProfileIdSyncMock,
}));

describe('analytics-bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    getOrCreatePartyProfileIdSyncMock.mockReset();
  });

  it('resolves the party-profile UUID synchronously on import and stores it in the shared slot', async () => {
    getOrCreatePartyProfileIdSyncMock.mockReturnValue('party-profile-uuid');

    await import('../analytics-bootstrap');
    const { getAnalyticsBootstrapId } = await import('../analytics-bootstrap-id');

    expect(getOrCreatePartyProfileIdSyncMock).toHaveBeenCalledTimes(1);
    expect(getAnalyticsBootstrapId()).toBe('party-profile-uuid');
  });

  it('stores null when the sync party-profile read/create fails', async () => {
    getOrCreatePartyProfileIdSyncMock.mockReturnValue(null);

    await import('../analytics-bootstrap');
    const { getAnalyticsBootstrapId } = await import('../analytics-bootstrap-id');

    expect(getAnalyticsBootstrapId()).toBeNull();
  });
});
