import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferUserUtcOffsetSeconds,
  climbedAtMatchesForAdoption,
  adoptionMatchScoreSeconds,
  type TickTimeSample,
} from '../tick-offset-inference';

const HOUR = 60 * 60 * 1000;

/** Build a sample at an ISO instant. */
function sample(climbUuid: string, angle: number, iso: string): TickTimeSample {
  return { climbUuid, angle, climbedAtMs: Date.parse(iso) };
}

describe('inferUserUtcOffsetSeconds', () => {
  it('returns null when either side is empty', () => {
    assert.equal(inferUserUtcOffsetSeconds([], []), null);
    assert.equal(inferUserUtcOffsetSeconds([sample('c1', 40, '2026-05-01T12:00:00Z')], []), null);
    assert.equal(inferUserUtcOffsetSeconds([], [sample('c1', 40, '2026-05-01T12:00:00Z')]), null);
  });

  it('returns null when there are no overlapping (climb, angle) keys', () => {
    const existing = [sample('c1', 40, '2026-05-01T22:00:00Z')];
    const incoming = [sample('c2', 25, '2026-05-01T12:00:00Z')];
    assert.equal(inferUserUtcOffsetSeconds(existing, incoming), null);
  });

  it('infers a typical +10h offset (existing local-wall-time is 10h ahead of true-UTC incoming)', () => {
    // Existing rows stored local wall time (UTC+10) relabelled as UTC; incoming
    // Kilter created_at is the true UTC instant 10h earlier.
    const existing = [
      sample('c1', 40, '2026-05-01T22:00:00Z'),
      sample('c2', 25, '2026-05-02T08:30:00Z'),
      sample('c3', 40, '2026-05-03T20:15:00Z'),
    ];
    const incoming = [
      sample('c1', 40, '2026-05-01T12:00:00Z'),
      sample('c2', 25, '2026-05-01T22:30:00Z'),
      sample('c3', 40, '2026-05-03T10:15:00Z'),
    ];
    assert.equal(inferUserUtcOffsetSeconds(existing, incoming), 10 * 3600);
  });

  it('infers a half-hour zone (+9:30) rounded to the nearest 15 minutes', () => {
    const existing = [sample('c1', 40, '2026-05-01T21:30:00Z'), sample('c2', 25, '2026-05-02T09:30:00Z')];
    const incoming = [sample('c1', 40, '2026-05-01T12:00:00Z'), sample('c2', 25, '2026-05-02T00:00:00Z')];
    // +9:30 = 34200s, an exact multiple of 900.
    assert.equal(inferUserUtcOffsetSeconds(existing, incoming), 9.5 * 3600);
  });

  it('snaps sub-minute client/server jitter to a whole offset', () => {
    // ~+10h but each pair is off by a few seconds of clock drift.
    const existing = [sample('c1', 40, '2026-05-01T22:00:07Z'), sample('c2', 25, '2026-05-02T08:29:58Z')];
    const incoming = [sample('c1', 40, '2026-05-01T12:00:00Z'), sample('c2', 25, '2026-05-01T22:30:00Z')];
    assert.equal(inferUserUtcOffsetSeconds(existing, incoming), 10 * 3600);
  });

  it('is robust to a minority of mismatched keys (mixed honest + shifted history)', () => {
    // Three shifted keys (+10h) and one honest key (0 offset). Median wins for
    // the +10h majority.
    const existing = [
      sample('c1', 40, '2026-05-01T22:00:00Z'), // +10h
      sample('c2', 25, '2026-05-02T08:00:00Z'), // +10h
      sample('c3', 40, '2026-05-03T20:00:00Z'), // +10h
      sample('c4', 15, '2026-05-04T12:00:05Z'), // honest (~0)
    ];
    const incoming = [
      sample('c1', 40, '2026-05-01T12:00:00Z'),
      sample('c2', 25, '2026-05-01T22:00:00Z'),
      sample('c3', 40, '2026-05-03T10:00:00Z'),
      sample('c4', 15, '2026-05-04T12:00:00Z'),
    ];
    assert.equal(inferUserUtcOffsetSeconds(existing, incoming), 10 * 3600);
  });

  it('infers 0 for already-honest UTC on both sides', () => {
    const existing = [sample('c1', 40, '2026-05-01T12:00:03Z')];
    const incoming = [sample('c1', 40, '2026-05-01T12:00:00Z')];
    assert.equal(inferUserUtcOffsetSeconds(existing, incoming), 0);
  });

  it('drops implausible gaps beyond ±14h (genuinely different climbs sharing a key)', () => {
    // The only overlapping key is 20h apart — not a plausible offset, and there
    // are no other keys, so nothing to infer from.
    const existing = [sample('c1', 40, '2026-05-02T08:00:00Z')];
    const incoming = [sample('c1', 40, '2026-05-01T12:00:00Z')];
    assert.equal(inferUserUtcOffsetSeconds(existing, incoming), null);
  });
});

describe('climbedAtMatchesForAdoption', () => {
  const base = Date.parse('2026-05-01T12:00:00Z');

  it('matches within ±60s on the fast path (offset 0)', () => {
    assert.equal(climbedAtMatchesForAdoption(base + 30_000, base, 0), true);
    assert.equal(climbedAtMatchesForAdoption(base + 30_000, base, null), true);
    assert.equal(climbedAtMatchesForAdoption(base + 61_000, base, 0), false);
  });

  it('matches within ±60s of an inferred offset', () => {
    const existing = base + 10 * HOUR + 20_000; // 10h + 20s ahead
    assert.equal(climbedAtMatchesForAdoption(existing, base, 10 * 3600), true);
    // 10h + 90s ahead is outside the ±60s window around the offset.
    assert.equal(climbedAtMatchesForAdoption(base + 10 * HOUR + 90_000, base, 10 * 3600), false);
  });

  it('does not match a shifted row when no offset is inferred', () => {
    const existing = base + 10 * HOUR;
    assert.equal(climbedAtMatchesForAdoption(existing, base, null), false);
  });
});

describe('adoptionMatchScoreSeconds', () => {
  const base = Date.parse('2026-05-01T12:00:00Z');

  it('returns null when neither the fast path nor the offset path matches', () => {
    assert.equal(adoptionMatchScoreSeconds(base + 61_000, base, 0), null);
    assert.equal(adoptionMatchScoreSeconds(base + 10 * HOUR, base, null), null);
    assert.equal(adoptionMatchScoreSeconds(base + 5 * HOUR, base, 10 * 3600), null);
  });

  it('scores a fast-path match by its raw |Δt| (in [0, tolerance])', () => {
    assert.equal(adoptionMatchScoreSeconds(base, base, 0), 0);
    assert.equal(adoptionMatchScoreSeconds(base + 30_000, base, 10 * 3600), 30);
  });

  it('scores an offset-path match ABOVE any fast-path match (tolerance + distance)', () => {
    // Δt = offset + 10s → offset-path distance 10s → score 60 + 10 = 70,
    // strictly greater than the worst fast-path score (60).
    const score = adoptionMatchScoreSeconds(base + 10 * HOUR + 10_000, base, 10 * 3600);
    assert.equal(score, 70);
    assert.ok((score as number) > 60);
  });

  it('prefers the honest same-instant row over an offset-distant DISTINCT ascent', () => {
    // A shifted-history user (+10h offset) logs the SAME climb+angle twice:
    // the true same-instant existing row is 40s away (fast path, score 40); a
    // genuinely different ascent sits ~10h away (offset path, score ≥60).
    // Whichever the caller loops first, the lower score must be the honest one.
    const incoming = base;
    const honest = adoptionMatchScoreSeconds(base + 40_000, incoming, 10 * 3600);
    const distinct = adoptionMatchScoreSeconds(base + 10 * HOUR + 5_000, incoming, 10 * 3600);
    assert.ok(honest !== null && distinct !== null);
    assert.ok((honest as number) < (distinct as number), 'fast-path honest row must win');
  });
});
