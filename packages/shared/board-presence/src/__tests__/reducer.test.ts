import { describe, it, expect } from 'vitest';
import type { BoardPresenceClimb, BoardPresenceEvent } from '@boardsesh/shared-schema';
import { boardPresenceReducer, initialBoardPresenceState, HISTORY_CAP } from '../reducer';
import { mapBoardPresenceEnvelopeToAction } from '../map-envelope';
import type { BoardPresenceState } from '../types';

function makeClimb(overrides: Partial<BoardPresenceClimb> & { seq: number }): BoardPresenceClimb {
  return {
    climbUuid: overrides.climbUuid ?? `climb-${overrides.seq}`,
    name: overrides.name ?? `Climb ${overrides.seq}`,
    grade: overrides.grade ?? 'V5',
    sentAt: overrides.sentAt ?? `2026-06-09T00:00:0${overrides.seq % 10}.000Z`,
    ...overrides,
  };
}

function makeState(overrides: Partial<BoardPresenceState> = {}): BoardPresenceState {
  return {
    ...initialBoardPresenceState,
    ...overrides,
  };
}

describe('initialBoardPresenceState', () => {
  it('starts empty with seq 0', () => {
    expect(initialBoardPresenceState).toEqual({
      currentClimb: null,
      previousClimb: null,
      history: [],
      lastSeq: 0,
    });
  });
});

describe('APPLY_CLIMB_SET', () => {
  it('sets current, history and lastSeq in order', () => {
    const first = makeClimb({ seq: 1 });
    const result = boardPresenceReducer(initialBoardPresenceState, {
      type: 'APPLY_CLIMB_SET',
      payload: first,
    });

    expect(result.currentClimb).toEqual(first);
    expect(result.previousClimb).toBeNull();
    expect(result.history).toEqual([first]);
    expect(result.lastSeq).toBe(1);
  });

  it('stashes the prior current as previousClimb (for Undo) and prepends history newest-first', () => {
    const first = makeClimb({ seq: 1 });
    const second = makeClimb({ seq: 2 });

    const afterFirst = boardPresenceReducer(initialBoardPresenceState, {
      type: 'APPLY_CLIMB_SET',
      payload: first,
    });
    const afterSecond = boardPresenceReducer(afterFirst, { type: 'APPLY_CLIMB_SET', payload: second });

    expect(afterSecond.currentClimb).toEqual(second);
    expect(afterSecond.previousClimb).toEqual(first);
    expect(afterSecond.history).toEqual([second, first]);
    expect(afterSecond.lastSeq).toBe(2);
  });

  it('ignores a seq <= lastSeq (out-of-order Redis message does not regress the wall)', () => {
    const current = makeClimb({ seq: 5 });
    const state = makeState({ currentClimb: current, history: [current], lastSeq: 5 });

    const stale = makeClimb({ seq: 3 });
    const result = boardPresenceReducer(state, { type: 'APPLY_CLIMB_SET', payload: stale });

    expect(result).toBe(state);
  });

  it('ignores an exact duplicate (climbUuid, seq) so backfill + live stream do not double-apply', () => {
    // lastSeq has been advanced past by a CLEARED, but the same set is replayed.
    const climb = makeClimb({ climbUuid: 'dup', seq: 4 });
    const state = makeState({ history: [climb], lastSeq: 4 });

    const result = boardPresenceReducer(state, { type: 'APPLY_CLIMB_SET', payload: climb });
    expect(result).toBe(state);
  });

  it('caps history at HISTORY_CAP newest-first', () => {
    let state = initialBoardPresenceState;
    for (let seq = 1; seq <= HISTORY_CAP + 10; seq += 1) {
      state = boardPresenceReducer(state, { type: 'APPLY_CLIMB_SET', payload: makeClimb({ seq }) });
    }

    expect(state.history).toHaveLength(HISTORY_CAP);
    expect(state.history[0].seq).toBe(HISTORY_CAP + 10);
    expect(state.history[HISTORY_CAP - 1].seq).toBe(11);
    expect(state.lastSeq).toBe(HISTORY_CAP + 10);
  });
});

describe('APPLY_CLIMB_CLEARED', () => {
  it('clears current and stashes previousClimb when newer than lastSeq', () => {
    const current = makeClimb({ seq: 7 });
    const state = makeState({ currentClimb: current, history: [current], lastSeq: 7 });

    const result = boardPresenceReducer(state, {
      type: 'APPLY_CLIMB_CLEARED',
      payload: { clearedAt: '2026-06-09T01:00:00.000Z', seq: 8 },
    });

    expect(result.currentClimb).toBeNull();
    expect(result.previousClimb).toEqual(current);
    expect(result.lastSeq).toBe(8);
    // Cleared is not pushed to history.
    expect(result.history).toEqual([current]);
  });

  it('ignores a stale clear (seq <= lastSeq) so it cannot wipe a newer set', () => {
    const current = makeClimb({ seq: 10 });
    const state = makeState({ currentClimb: current, history: [current], lastSeq: 10 });

    const result = boardPresenceReducer(state, {
      type: 'APPLY_CLIMB_CLEARED',
      payload: { clearedAt: '2026-06-09T01:00:00.000Z', seq: 9 },
    });

    expect(result).toBe(state);
  });
});

describe('BACKFILL_HISTORY', () => {
  it('merges newest-first, dedups by (climbUuid, seq) and sets lastSeq to the max', () => {
    const existing = makeClimb({ seq: 2 });
    const state = makeState({ currentClimb: existing, history: [existing], lastSeq: 2 });

    const backfill = [makeClimb({ seq: 1 }), existing, makeClimb({ seq: 3 })];
    const result = boardPresenceReducer(state, { type: 'BACKFILL_HISTORY', payload: backfill });

    expect(result.history.map((climb) => climb.seq)).toEqual([3, 2, 1]);
    expect(result.lastSeq).toBe(3);
    // Newest backfilled climb (seq 3) is adopted as current since it's newer.
    expect(result.currentClimb?.seq).toBe(3);
  });

  it('is idempotent — replaying the same backfill twice yields the same state', () => {
    const backfill = [makeClimb({ seq: 1 }), makeClimb({ seq: 2 }), makeClimb({ seq: 3 })];

    const once = boardPresenceReducer(initialBoardPresenceState, {
      type: 'BACKFILL_HISTORY',
      payload: backfill,
    });
    const twice = boardPresenceReducer(once, { type: 'BACKFILL_HISTORY', payload: backfill });

    expect(twice).toEqual(once);
  });

  it('does NOT clobber a newer live currentClimb already applied', () => {
    const liveCurrent = makeClimb({ seq: 20, climbUuid: 'live' });
    const state = makeState({ currentClimb: liveCurrent, history: [liveCurrent], lastSeq: 20 });

    const backfill = [makeClimb({ seq: 5 }), makeClimb({ seq: 6 })];
    const result = boardPresenceReducer(state, { type: 'BACKFILL_HISTORY', payload: backfill });

    expect(result.currentClimb).toEqual(liveCurrent);
    // lastSeq stays at the live max, not the backfill max.
    expect(result.lastSeq).toBe(20);
    expect(result.history.map((climb) => climb.seq)).toEqual([20, 6, 5]);
  });

  it('adopts the newest history climb as current when there is no live current', () => {
    const backfill = [makeClimb({ seq: 11 }), makeClimb({ seq: 12 })];
    const result = boardPresenceReducer(initialBoardPresenceState, {
      type: 'BACKFILL_HISTORY',
      payload: backfill,
    });

    expect(result.currentClimb?.seq).toBe(12);
  });

  it('no-ops on an empty backfill', () => {
    const state = makeState({ lastSeq: 4 });
    const result = boardPresenceReducer(state, { type: 'BACKFILL_HISTORY', payload: [] });
    expect(result).toBe(state);
  });
});

describe('RESET', () => {
  it('returns the initial state', () => {
    const state = makeState({
      currentClimb: makeClimb({ seq: 9 }),
      history: [makeClimb({ seq: 9 })],
      lastSeq: 9,
    });

    expect(boardPresenceReducer(state, { type: 'RESET' })).toEqual(initialBoardPresenceState);
  });
});

describe('mapBoardPresenceEnvelopeToAction', () => {
  it('maps BoardClimbSet to APPLY_CLIMB_SET with the climb', () => {
    const climb = makeClimb({ seq: 1 });
    const event: BoardPresenceEvent = { __typename: 'BoardClimbSet', climb };

    expect(mapBoardPresenceEnvelopeToAction(event)).toEqual({ type: 'APPLY_CLIMB_SET', payload: climb });
  });

  it('maps BoardClimbCleared to APPLY_CLIMB_CLEARED with clearedAt + seq', () => {
    const event: BoardPresenceEvent = {
      __typename: 'BoardClimbCleared',
      clearedAt: '2026-06-09T02:00:00.000Z',
      seq: 12,
    };

    expect(mapBoardPresenceEnvelopeToAction(event)).toEqual({
      type: 'APPLY_CLIMB_CLEARED',
      payload: { clearedAt: '2026-06-09T02:00:00.000Z', seq: 12 },
    });
  });

  it('returns null for an unknown/absent __typename', () => {
    const event = { climb: makeClimb({ seq: 1 }) } as unknown as BoardPresenceEvent;
    expect(mapBoardPresenceEnvelopeToAction(event)).toBeNull();
  });
});
