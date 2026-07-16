import { describe, expect, it } from 'vitest';
import { KioskLayoutSchema, MAX_KIOSK_BOARDS, emptyKioskLayout } from '@boardsesh/kiosk';
import {
  addBoardSlot,
  editorStateFromLayout,
  editorStatesEqual,
  moveBoardSlot,
  removeBoardSlot,
  serializeKioskLayout,
  setLeaderboardEnabled,
  setLeaderboardPeriod,
  setLeaderboardScope,
  setSlotBoard,
  type KioskEditorState,
} from '../kiosk-editor-state';

const boardA = '11111111-1111-4111-8111-111111111111';
const boardB = '22222222-2222-4222-8222-222222222222';
const boardC = '33333333-3333-4333-8333-333333333333';
const boardD = '44444444-4444-4444-8444-444444444444';
const boardE = '55555555-5555-4555-8555-555555555555';

function stateWith(boardUuids: string[], leaderboard: KioskEditorState['leaderboard'] = null): KioskEditorState {
  return { boardUuids, leaderboard };
}

describe('editorStateFromLayout', () => {
  it('reads a stored layout leniently', () => {
    const state = editorStateFromLayout({
      version: 1,
      boards: [{ boardUuid: boardA }, { boardUuid: boardB }],
      leaderboard: { boardUuid: boardB, period: 'week' },
    });
    expect(state.boardUuids).toEqual([boardA, boardB]);
    expect(state.leaderboard).toEqual({ boardUuid: boardB, period: 'week' });
  });

  it('degrades corrupt input to an empty state instead of throwing', () => {
    expect(editorStateFromLayout('garbage')).toEqual({ boardUuids: [], leaderboard: null });
    expect(editorStateFromLayout(emptyKioskLayout())).toEqual({ boardUuids: [], leaderboard: null });
  });
});

describe('addBoardSlot', () => {
  it('appends in slot order', () => {
    const state = addBoardSlot(stateWith([boardA]), boardB);
    expect(state.boardUuids).toEqual([boardA, boardB]);
  });

  it('ignores a board already assigned (dedupe)', () => {
    const initial = stateWith([boardA, boardB]);
    expect(addBoardSlot(initial, boardA)).toBe(initial);
  });

  it('refuses to grow past MAX_KIOSK_BOARDS', () => {
    const full = stateWith([boardA, boardB, boardC, boardD]);
    expect(full.boardUuids).toHaveLength(MAX_KIOSK_BOARDS);
    expect(addBoardSlot(full, boardE)).toBe(full);
  });
});

describe('setSlotBoard', () => {
  it('replaces the slot in place', () => {
    const state = setSlotBoard(stateWith([boardA, boardB]), 1, boardC);
    expect(state.boardUuids).toEqual([boardA, boardC]);
  });

  it('rejects a swap that would duplicate another slot', () => {
    const initial = stateWith([boardA, boardB]);
    expect(setSlotBoard(initial, 1, boardA)).toBe(initial);
  });

  it('widens a leaderboard scoped to the replaced board', () => {
    const initial = stateWith([boardA, boardB], { boardUuid: boardB, period: 'session' });
    const state = setSlotBoard(initial, 1, boardC);
    expect(state.leaderboard).toEqual({ boardUuid: null, period: 'session' });
  });

  it('keeps a leaderboard scoped to an untouched board', () => {
    const initial = stateWith([boardA, boardB], { boardUuid: boardA, period: 'day' });
    const state = setSlotBoard(initial, 1, boardC);
    expect(state.leaderboard).toEqual({ boardUuid: boardA, period: 'day' });
  });

  it('is a no-op out of range', () => {
    const initial = stateWith([boardA]);
    expect(setSlotBoard(initial, 3, boardB)).toBe(initial);
  });
});

describe('moveBoardSlot', () => {
  it('swaps with the neighbour in the given direction', () => {
    expect(moveBoardSlot(stateWith([boardA, boardB, boardC]), 2, -1).boardUuids).toEqual([boardA, boardC, boardB]);
    expect(moveBoardSlot(stateWith([boardA, boardB, boardC]), 0, 1).boardUuids).toEqual([boardB, boardA, boardC]);
  });

  it('is a no-op at the edges', () => {
    const initial = stateWith([boardA, boardB]);
    expect(moveBoardSlot(initial, 0, -1)).toBe(initial);
    expect(moveBoardSlot(initial, 1, 1)).toBe(initial);
  });
});

describe('removeBoardSlot', () => {
  it('drops the slot and keeps order', () => {
    const state = removeBoardSlot(stateWith([boardA, boardB, boardC]), 1);
    expect(state.boardUuids).toEqual([boardA, boardC]);
  });

  it('widens a leaderboard scoped to the removed board', () => {
    const initial = stateWith([boardA, boardB], { boardUuid: boardB, period: 'month' });
    const state = removeBoardSlot(initial, 1);
    expect(state.leaderboard).toEqual({ boardUuid: null, period: 'month' });
  });

  it('turns the rail off when the last board goes (editor invariant)', () => {
    const initial = stateWith([boardA], { boardUuid: null, period: 'session' });
    const state = removeBoardSlot(initial, 0);
    expect(state).toEqual({ boardUuids: [], leaderboard: null });
  });
});

describe('leaderboard transitions', () => {
  it('enables with the session default scoped to all boards', () => {
    const state = setLeaderboardEnabled(stateWith([boardA]), true);
    expect(state.leaderboard).toEqual({ boardUuid: null, period: 'session' });
  });

  it('refuses to enable with zero boards', () => {
    const initial = stateWith([]);
    expect(setLeaderboardEnabled(initial, true)).toBe(initial);
  });

  it('disables to null', () => {
    const initial = stateWith([boardA], { boardUuid: boardA, period: 'week' });
    expect(setLeaderboardEnabled(initial, false).leaderboard).toBeNull();
  });

  it('only scopes to an assigned board', () => {
    const initial = stateWith([boardA], { boardUuid: null, period: 'session' });
    expect(setLeaderboardScope(initial, boardB)).toBe(initial);
    expect(setLeaderboardScope(initial, boardA).leaderboard?.boardUuid).toBe(boardA);
    expect(setLeaderboardScope(setLeaderboardScope(initial, boardA), null).leaderboard?.boardUuid).toBeNull();
  });

  it('sets the period only while the rail is on', () => {
    const railOff = stateWith([boardA]);
    expect(setLeaderboardPeriod(railOff, 'day')).toBe(railOff);
    const railOn = setLeaderboardEnabled(railOff, true);
    expect(setLeaderboardPeriod(railOn, 'day').leaderboard?.period).toBe('day');
  });
});

describe('serializeKioskLayout', () => {
  it('produces a layout the strict schema accepts', () => {
    const state = stateWith([boardA, boardB], { boardUuid: boardA, period: 'day' });
    const layout = serializeKioskLayout(state);
    expect(() => KioskLayoutSchema.parse(layout)).not.toThrow();
    expect(layout).toEqual({
      version: 1,
      boards: [{ boardUuid: boardA }, { boardUuid: boardB }],
      leaderboard: { boardUuid: boardA, period: 'day' },
    });
  });

  it('round-trips through editorStateFromLayout', () => {
    const state = stateWith([boardC, boardA], { boardUuid: null, period: 'month' });
    expect(editorStateFromLayout(serializeKioskLayout(state))).toEqual(state);
  });
});

describe('editorStatesEqual', () => {
  it('drives the dirty flag structurally', () => {
    const first = stateWith([boardA], { boardUuid: null, period: 'session' });
    const second = stateWith([boardA], { boardUuid: null, period: 'session' });
    expect(editorStatesEqual(first, second)).toBe(true);
    expect(editorStatesEqual(first, stateWith([boardA]))).toBe(false);
    expect(editorStatesEqual(first, stateWith([boardA], { boardUuid: null, period: 'day' }))).toBe(false);
    expect(editorStatesEqual(first, stateWith([boardB], { boardUuid: null, period: 'session' }))).toBe(false);
  });
});
