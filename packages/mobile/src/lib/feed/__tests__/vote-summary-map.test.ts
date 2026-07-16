import { describe, it, expect } from 'vitest';
import { buildVoteSummaryMap, voteSummaryKey, type VoteSummaryEntry } from '../vote-summary-map';

function entry(
  entityType: VoteSummaryEntry['entityType'],
  entityId: string,
  upvotes: number,
  userVote: number | null,
): VoteSummaryEntry {
  return { entityType, entityId, upvotes, userVote };
}

describe('buildVoteSummaryMap', () => {
  it('keys entries by `entityType:entityId`', () => {
    const map = buildVoteSummaryMap(null, [entry('session', 's1', 3, 1), entry('tick', 't1', 0, null)]);
    expect(map.get(voteSummaryKey('session', 's1'))).toEqual({ upvotes: 3, userVote: 1 });
    expect(map.get(voteSummaryKey('tick', 't1'))).toEqual({ upvotes: 0, userVote: null });
    // Distinct namespaces: a session and a tick with the same id don't collide.
    const collide = buildVoteSummaryMap(null, [entry('session', 'x', 1, null), entry('tick', 'x', 9, 1)]);
    expect(collide.get('session:x')).toEqual({ upvotes: 1, userVote: null });
    expect(collide.get('tick:x')).toEqual({ upvotes: 9, userVote: 1 });
  });

  it('returns a fresh Map reference every rebuild (so FlashList extraData fires)', () => {
    const previous = buildVoteSummaryMap(null, [entry('session', 's1', 3, 1)]);
    const next = buildVoteSummaryMap(previous, [entry('session', 's1', 3, 1)]);
    expect(next).not.toBe(previous);
  });

  it('reuses the prior value object for an entity whose vote is unchanged', () => {
    const previous = buildVoteSummaryMap(null, [entry('session', 's1', 3, 1)]);
    const priorObject = previous.get('session:s1');
    const next = buildVoteSummaryMap(previous, [entry('session', 's1', 3, 1)]);
    // Same values → the exact same object reference, so React.memo can bail the row.
    expect(next.get('session:s1')).toBe(priorObject);
  });

  it('mints a new value object when upvotes change', () => {
    const previous = buildVoteSummaryMap(null, [entry('session', 's1', 3, 1)]);
    const priorObject = previous.get('session:s1');
    const next = buildVoteSummaryMap(previous, [entry('session', 's1', 4, 1)]);
    expect(next.get('session:s1')).not.toBe(priorObject);
    expect(next.get('session:s1')).toEqual({ upvotes: 4, userVote: 1 });
  });

  it('mints a new value object when userVote changes', () => {
    const previous = buildVoteSummaryMap(null, [entry('session', 's1', 3, 1)]);
    const priorObject = previous.get('session:s1');
    const next = buildVoteSummaryMap(previous, [entry('session', 's1', 3, null)]);
    expect(next.get('session:s1')).not.toBe(priorObject);
    expect(next.get('session:s1')).toEqual({ upvotes: 3, userVote: null });
  });

  it('preserves identity for untouched entities while a sibling changes (page-load / single-vote case)', () => {
    const previous = buildVoteSummaryMap(null, [
      entry('session', 's1', 3, 1),
      entry('session', 's2', 5, null),
      entry('tick', 't1', 2, 1),
    ]);
    const s1 = previous.get('session:s1');
    const t1 = previous.get('tick:t1');
    // s2's vote moved; s1 and t1 are untouched.
    const next = buildVoteSummaryMap(previous, [
      entry('session', 's1', 3, 1),
      entry('session', 's2', 6, 1),
      entry('tick', 't1', 2, 1),
    ]);
    expect(next.get('session:s1')).toBe(s1);
    expect(next.get('tick:t1')).toBe(t1);
    expect(next.get('session:s2')).toEqual({ upvotes: 6, userVote: 1 });
  });

  it('adds new entities and drops entities no longer present', () => {
    const previous = buildVoteSummaryMap(null, [entry('session', 's1', 3, 1)]);
    const next = buildVoteSummaryMap(previous, [entry('session', 's2', 1, null)]);
    expect(next.has('session:s1')).toBe(false);
    expect(next.get('session:s2')).toEqual({ upvotes: 1, userVote: null });
  });

  it('handles an empty entry list', () => {
    expect(buildVoteSummaryMap(null, []).size).toBe(0);
  });
});
