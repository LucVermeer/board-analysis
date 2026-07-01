import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_LOGBOOK_FILTERS, DEFAULT_LOGBOOK_SORT } from '@boardsesh/logbook';

const store = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../preference-store', () => ({
  getPreference: store.get,
  setPreference: store.set,
}));

import { loadLogbookPrefs, saveLogbookPrefs } from '../logbook-prefs-store';

describe('logbook-prefs-store', () => {
  beforeEach(() => {
    store.get.mockReset();
    store.set.mockReset();
  });

  it('returns null when nothing is stored', async () => {
    store.get.mockResolvedValue(null);
    expect(await loadLogbookPrefs()).toBeNull();
  });

  it('sanitizes a stored payload (clamps angle, keeps valid grade, defaults garbage sort)', async () => {
    store.get.mockResolvedValue({
      filters: { ...DEFAULT_LOGBOOK_FILTERS, angleRange: [-5, 200], minGrade: 12 },
      sort: { preset: 'bogus' },
    });
    const prefs = await loadLogbookPrefs();
    expect(prefs?.filters.angleRange).toEqual([0, 70]);
    expect(prefs?.filters.minGrade).toBe(12);
    expect(prefs?.sort.preset).toBe('recent');
  });

  it('saves the filter/sort prefs under the logbook key', async () => {
    store.set.mockResolvedValue(undefined);
    await saveLogbookPrefs({ filters: DEFAULT_LOGBOOK_FILTERS, sort: { ...DEFAULT_LOGBOOK_SORT, preset: 'hardest' } });
    expect(store.set).toHaveBeenCalledWith(
      'logbookSearchPrefs',
      expect.objectContaining({ sort: expect.objectContaining({ preset: 'hardest' }) }),
    );
  });

  it('returns null when the storage read throws (so hydration never deadlocks)', async () => {
    store.get.mockRejectedValue(new Error('storage unavailable'));
    await expect(loadLogbookPrefs()).resolves.toBeNull();
  });

  it('migrates a legacy "both" payload to sends-only on load (v1 -> v2)', async () => {
    store.get.mockResolvedValue({
      version: 1,
      filters: { ...DEFAULT_LOGBOOK_FILTERS, includeSends: true, includeAttempts: true },
      sort: DEFAULT_LOGBOOK_SORT,
    });
    const prefs = await loadLogbookPrefs();
    expect(prefs?.filters.includeSends).toBe(true);
    expect(prefs?.filters.includeAttempts).toBe(false);
  });

  it('keeps an explicit "both" once the payload is stamped v2 (one-time migration)', async () => {
    store.get.mockResolvedValue({
      version: 2,
      filters: { ...DEFAULT_LOGBOOK_FILTERS, includeSends: true, includeAttempts: true },
      sort: DEFAULT_LOGBOOK_SORT,
    });
    const prefs = await loadLogbookPrefs();
    expect(prefs?.filters.includeAttempts).toBe(true);
  });

  it('stamps the schema version when saving', async () => {
    store.set.mockResolvedValue(undefined);
    await saveLogbookPrefs({ filters: DEFAULT_LOGBOOK_FILTERS, sort: DEFAULT_LOGBOOK_SORT });
    expect(store.set).toHaveBeenCalledWith('logbookSearchPrefs', expect.objectContaining({ version: 2 }));
  });
});
