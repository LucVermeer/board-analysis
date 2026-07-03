import { describe, it, expect } from 'vitest';
import {
  applyDatePart,
  applyTimePart,
  clampToNow,
  formatDateForDisplay,
  formatTimeForDisplay,
  toEditableDate,
} from '../climbed-at';

describe('clampToNow', () => {
  it('leaves a past instant untouched', () => {
    const past = new Date(Date.now() - 60_000);
    expect(clampToNow(past).getTime()).toBe(past.getTime());
  });

  it('pulls a future instant back to about now', () => {
    const future = new Date(Date.now() + 60 * 60_000);
    const before = Date.now();
    const clamped = clampToNow(future).getTime();
    const after = Date.now();
    expect(clamped).toBeGreaterThanOrEqual(before);
    expect(clamped).toBeLessThanOrEqual(after);
  });
});

describe('applyDatePart', () => {
  it('takes the calendar day from the selection and keeps the time of day', () => {
    const current = new Date(2026, 5, 1, 14, 30, 45, 123); // Jun 1 2026 14:30 local
    const selected = new Date(2025, 0, 20, 9, 0, 0); // Jan 20 2025 09:00 local
    const result = applyDatePart(current, selected, { clampToPresent: false });
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(20);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  it('clamps to now when the merged day lands in the future and clampToPresent is set', () => {
    const current = new Date(Date.now() - 60_000);
    const futureDay = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const result = applyDatePart(current, futureDay, { clampToPresent: true });
    expect(result.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('applyTimePart', () => {
  it('takes the time of day from the selection and keeps the calendar day', () => {
    const current = new Date(2026, 5, 1, 14, 30);
    const selected = new Date(2020, 0, 1, 8, 15, 30);
    const result = applyTimePart(current, selected, { clampToPresent: false });
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(15);
    // seconds/millis are zeroed so equal saves don't jitter
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe('formatDateForDisplay / formatTimeForDisplay', () => {
  it('zero-pads the date parts', () => {
    expect(formatDateForDisplay(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('zero-pads the time parts', () => {
    expect(formatTimeForDisplay(new Date(2026, 0, 3, 9, 5))).toBe('09:05');
  });
});

describe('toEditableDate', () => {
  it('parses a stored ISO timestamp to the same instant', () => {
    const iso = '2026-06-01T10:30:00.000Z';
    expect(toEditableDate(iso).getTime()).toBe(Date.parse(iso));
  });

  it('falls back to about now for an unparseable value', () => {
    const before = Date.now();
    const result = toEditableDate('not a date').getTime();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});
