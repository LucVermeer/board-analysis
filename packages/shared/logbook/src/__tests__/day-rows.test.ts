import { describe, expect, it } from 'vitest';
import {
  buildLogbookListRows,
  dedupeLogbookItems,
  describeLogbookDay,
  logbookDayKey,
  shouldShowLogbookDividers,
  type LogbookDayItem,
} from '../day-rows';

// Naive-UTC timestamps, the shape `climbed_at` arrives in (no Z suffix). Tests
// run in whatever TZ the runner uses; assertions that depend on the local day
// derive the expected key via logbookDayKey rather than hardcoding it.
function tick(overrides: Partial<LogbookDayItem> & { uuid: string; climbedAt: string }): LogbookDayItem {
  return { status: 'send', difficulty: 10, difficultyName: 'V4', ...overrides };
}

const NOON = 'T12:00:00';

describe('shouldShowLogbookDividers', () => {
  it('shows dividers for the recent preset and custom date sorts only', () => {
    expect(shouldShowLogbookDividers({ sortBy: 'recent' })).toBe(true);
    expect(shouldShowLogbookDividers({ sortBy: 'date' })).toBe(true);
    expect(shouldShowLogbookDividers({ sortBy: 'hardest' })).toBe(false);
    expect(shouldShowLogbookDividers({ sortBy: 'climbName' })).toBe(false);
    expect(shouldShowLogbookDividers({ sortBy: 'attemptCount' })).toBe(false);
  });
});

describe('buildLogbookListRows', () => {
  it('groups consecutive same-day items under one divider', () => {
    const rows = buildLogbookListRows(
      [
        tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}` }),
        tick({ uuid: 'b', climbedAt: `2026-06-30${NOON}` }),
        tick({ uuid: 'c', climbedAt: `2026-06-29${NOON}` }),
      ],
      { hasMore: false },
    );
    expect(rows.map((row) => row.type)).toEqual(['divider', 'entry', 'entry', 'divider', 'entry']);
    expect(rows[0].key).toBe(`day-${logbookDayKey(`2026-06-30${NOON}`)}`);
  });

  it('dedupes duplicate uuids across page boundaries before grouping', () => {
    const rows = buildLogbookListRows(
      [
        tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}` }),
        tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}` }),
        tick({ uuid: 'b', climbedAt: `2026-06-30${NOON}` }),
      ],
      { hasMore: false },
    );
    const entryKeys = rows.filter((row) => row.type === 'entry').map((row) => row.key);
    expect(entryKeys).toEqual(['a', 'b']);
  });

  it('withholds stats from the oldest loaded day while more pages remain', () => {
    const rows = buildLogbookListRows(
      [
        tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}` }),
        tick({ uuid: 'b', climbedAt: `2026-06-29${NOON}` }),
      ],
      { hasMore: true },
    );
    const dividers = rows.filter((row) => row.type === 'divider');
    expect(dividers[0].stats).not.toBeNull(); // bounded by the day change below it
    expect(dividers[1].stats).toBeNull(); // could straddle the next page
  });

  it('completes the last day when the feed is exhausted', () => {
    const rows = buildLogbookListRows([tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}` })], { hasMore: false });
    const [divider] = rows;
    if (divider.type !== 'divider') throw new Error('expected divider first');
    expect(divider.stats).toEqual({ climbCount: 1, sendCount: 1, topDifficulty: 10, topDifficultyName: 'V4' });
  });

  it('counts flashes as sends and picks the hardest send for the rollup', () => {
    const rows = buildLogbookListRows(
      [
        tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}`, status: 'flash', difficulty: 12, difficultyName: 'V5' }),
        tick({ uuid: 'b', climbedAt: `2026-06-30${NOON}`, status: 'send', difficulty: 18, difficultyName: 'V8' }),
        // Hard PROJECT must not win the "top send" slot.
        tick({ uuid: 'c', climbedAt: `2026-06-30${NOON}`, status: 'attempt', difficulty: 25, difficultyName: 'V11' }),
      ],
      { hasMore: false },
    );
    const [divider] = rows;
    if (divider.type !== 'divider') throw new Error('expected divider first');
    expect(divider.stats).toEqual({ climbCount: 3, sendCount: 2, topDifficulty: 18, topDifficultyName: 'V8' });
  });

  it('falls back to the consensus grade for ungraded sends in the rollup', () => {
    const rows = buildLogbookListRows(
      [
        tick({
          uuid: 'a',
          climbedAt: `2026-06-30${NOON}`,
          difficulty: null,
          difficultyName: null,
          consensusDifficulty: 15,
          consensusDifficultyName: 'V6',
        }),
      ],
      { hasMore: false },
    );
    const [divider] = rows;
    if (divider.type !== 'divider') throw new Error('expected divider first');
    expect(divider.stats?.topDifficultyName).toBe('V6');
  });

  it('keeps divider keys unique if a day recurs non-contiguously (defensive)', () => {
    const rows = buildLogbookListRows(
      [
        tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}` }),
        tick({ uuid: 'b', climbedAt: `2026-06-29${NOON}` }),
        tick({ uuid: 'c', climbedAt: `2026-06-30${NOON}` }),
      ],
      { hasMore: false },
    );
    const dividerKeys = rows.filter((row) => row.type === 'divider').map((row) => row.key);
    expect(new Set(dividerKeys).size).toBe(dividerKeys.length);
  });

  it('returns no rows for an empty list', () => {
    expect(buildLogbookListRows([], { hasMore: false })).toEqual([]);
  });
});

describe('describeLogbookDay', () => {
  const now = new Date(2026, 5, 30, 15, 0, 0).getTime(); // local Jun 30 2026, 3pm

  it('classifies today / yesterday / this-year / older against the injected now', () => {
    const dayMs = (year: number, monthIndex: number, day: number) => new Date(year, monthIndex, day).getTime();
    expect(describeLogbookDay(dayMs(2026, 5, 30), now).kind).toBe('today');
    expect(describeLogbookDay(dayMs(2026, 5, 29), now).kind).toBe('yesterday');
    expect(describeLogbookDay(dayMs(2026, 2, 14), now).kind).toBe('thisYear');
    expect(describeLogbookDay(dayMs(2025, 11, 31), now).kind).toBe('older');
  });
});

describe('dedupeLogbookItems', () => {
  it('keeps first occurrence order', () => {
    const items = [
      tick({ uuid: 'a', climbedAt: `2026-06-30${NOON}` }),
      tick({ uuid: 'b', climbedAt: `2026-06-30${NOON}` }),
      tick({ uuid: 'a', climbedAt: `2026-06-29${NOON}` }),
    ];
    expect(dedupeLogbookItems(items).map((item) => item.uuid)).toEqual(['a', 'b']);
  });
});
