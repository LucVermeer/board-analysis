import { describe, expect, it, vi } from 'vitest';
import { createKioskPresenceStore, type KioskBoardSnapshot } from '../use-kiosk-board-presence';

function makeSnapshot(overrides: Partial<KioskBoardSnapshot> = {}): KioskBoardSnapshot {
  return { currentClimb: null, history: [], isLive: true, ...overrides };
}

describe('createKioskPresenceStore', () => {
  it('returns null for a board that has not published yet', () => {
    const store = createKioskPresenceStore();
    expect(store.getBoardSnapshot(1)).toBeNull();
    expect(store.getAllSnapshots().size).toBe(0);
  });

  it('stores and returns a published board snapshot by reference', () => {
    const store = createKioskPresenceStore();
    const snapshot = makeSnapshot({ isLive: true });
    store.publish(7, snapshot);
    expect(store.getBoardSnapshot(7)).toBe(snapshot);
    expect(store.getAllSnapshots().get(7)).toBe(snapshot);
  });

  it('notifies only the subscribers of the board that changed', () => {
    const store = createKioskPresenceStore();
    const boardOneListener = vi.fn();
    const boardTwoListener = vi.fn();
    store.subscribeBoard(1, boardOneListener);
    store.subscribeBoard(2, boardTwoListener);

    store.publish(1, makeSnapshot());

    // The whole point of the refactor: board 2's slot must not re-render when
    // board 1 gets an event.
    expect(boardOneListener).toHaveBeenCalledTimes(1);
    expect(boardTwoListener).not.toHaveBeenCalled();

    store.publish(2, makeSnapshot());
    expect(boardOneListener).toHaveBeenCalledTimes(1);
    expect(boardTwoListener).toHaveBeenCalledTimes(1);
  });

  it('notifies cross-board (subscribeAll) subscribers on any board change and hands them a fresh view', () => {
    const store = createKioskPresenceStore();
    const allListener = vi.fn();
    store.subscribeAll(allListener);

    const firstView = store.getAllSnapshots();
    store.publish(1, makeSnapshot());
    expect(allListener).toHaveBeenCalledTimes(1);
    const secondView = store.getAllSnapshots();
    // A new reference so useSyncExternalStore/useMemo readers (the leaderboard)
    // recompute.
    expect(secondView).not.toBe(firstView);

    store.publish(2, makeSnapshot());
    expect(allListener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createKioskPresenceStore();
    const boardListener = vi.fn();
    const unsubscribe = store.subscribeBoard(3, boardListener);

    store.publish(3, makeSnapshot());
    expect(boardListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.publish(3, makeSnapshot());
    expect(boardListener).toHaveBeenCalledTimes(1);
  });
});
