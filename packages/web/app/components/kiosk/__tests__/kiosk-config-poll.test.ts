import { describe, expect, it } from 'vitest';
import { evaluateKioskConfigPoll } from '../kiosk-config-poll';

const MIN_AGE = 90_000;
const T1 = '2026-07-15T10:00:00.000Z';
const T2 = '2026-07-15T11:00:00.000Z';

describe('evaluateKioskConfigPoll', () => {
  it('does nothing before any poll has succeeded', () => {
    expect(
      evaluateKioskConfigPoll({
        pageAgeMs: 500_000,
        initialUpdatedAt: T1,
        polledUpdatedAt: undefined,
        minPageAgeMs: MIN_AGE,
      }),
    ).toEqual({ action: 'none' });
  });

  it('does nothing while the polled config matches the rendered one', () => {
    expect(
      evaluateKioskConfigPoll({
        pageAgeMs: 500_000,
        initialUpdatedAt: T1,
        polledUpdatedAt: T1,
        minPageAgeMs: MIN_AGE,
      }),
    ).toEqual({ action: 'none' });
  });

  it('reloads on an updatedAt change once the page is old enough', () => {
    expect(
      evaluateKioskConfigPoll({
        pageAgeMs: MIN_AGE,
        initialUpdatedAt: T1,
        polledUpdatedAt: T2,
        minPageAgeMs: MIN_AGE,
      }),
    ).toEqual({ action: 'reload' });
  });

  it('reloads when the kiosk vanished (deleted/hidden) once old enough', () => {
    expect(
      evaluateKioskConfigPoll({
        pageAgeMs: MIN_AGE + 1,
        initialUpdatedAt: T1,
        polledUpdatedAt: null,
        minPageAgeMs: MIN_AGE,
      }),
    ).toEqual({ action: 'reload' });
  });

  it('defers a too-early mismatch to a recheck exactly when the floor expires', () => {
    // The reload-loop guard: right after an edit, a reload can serve the same
    // stale SSR cache, and the very first poll already sees the new updatedAt.
    // Reloading now would loop, so the decision is to re-check when the
    // revalidate window has passed — NOT to drop the mismatch (React Query's
    // structural sharing means no further data-identity change would re-fire
    // an effect keyed on data alone).
    expect(
      evaluateKioskConfigPoll({
        pageAgeMs: 10_000,
        initialUpdatedAt: T1,
        polledUpdatedAt: T2,
        minPageAgeMs: MIN_AGE,
      }),
    ).toEqual({ action: 'recheck', delayMs: MIN_AGE - 10_000 });
  });

  it('recheck at the deferred moment resolves to reload', () => {
    const first = evaluateKioskConfigPoll({
      pageAgeMs: 10_000,
      initialUpdatedAt: T1,
      polledUpdatedAt: T2,
      minPageAgeMs: MIN_AGE,
    });
    expect(first.action).toBe('recheck');
    const delayMs = first.action === 'recheck' ? first.delayMs : 0;
    expect(
      evaluateKioskConfigPoll({
        pageAgeMs: 10_000 + delayMs,
        initialUpdatedAt: T1,
        polledUpdatedAt: T2,
        minPageAgeMs: MIN_AGE,
      }),
    ).toEqual({ action: 'reload' });
  });
});
