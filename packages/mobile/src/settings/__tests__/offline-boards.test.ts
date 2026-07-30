import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserBoard } from '@boardsesh/shared-schema';

const mockStorage = new Map<string, string>();
const setSpy = vi.fn();

vi.mock('react-native-mmkv', () => {
  const createMockInstance = () => ({
    getString(key: string) {
      return mockStorage.get(key);
    },
    set(key: string, value: string) {
      setSpy(key, value);
      mockStorage.set(key, value);
    },
    remove(key: string) {
      mockStorage.delete(key);
    },
    clearAll() {
      mockStorage.clear();
    },
  });
  return { createMMKV: vi.fn(() => createMockInstance()) };
});

import {
  getOfflineBoards,
  rememberOfflineBoards,
  forgetOfflineBoardScope,
  clearOfflineBoards,
} from '../offline-boards';
import { resetAllSettings } from '../hooks';

const board = (overrides: Partial<UserBoard> & { uuid: string; name: string }): UserBoard =>
  ({
    boardType: 'kilter',
    layoutId: 8,
    sizeId: 17,
    setIds: '20,21',
    angle: 40,
    ...overrides,
  }) as unknown as UserBoard;

describe('offline board snapshots', () => {
  beforeEach(() => {
    mockStorage.clear();
    resetAllSettings();
    setSpy.mockClear();
  });

  it('starts empty', () => {
    expect(getOfflineBoards()).toEqual([]);
  });

  it('upserts by uuid, most-recent-first, without duplicating a re-enabled board', () => {
    rememberOfflineBoards([board({ uuid: 'a', name: 'Garage' })]);
    rememberOfflineBoards([board({ uuid: 'b', name: 'Gym' })]);
    rememberOfflineBoards([board({ uuid: 'a', name: 'Garage renamed' })]);

    expect(getOfflineBoards().map((card) => [card.uuid, card.name])).toEqual([
      ['a', 'Garage renamed'],
      ['b', 'Gym'],
    ]);
  });

  it('does not write when the remembered list is unchanged', () => {
    const boards = [board({ uuid: 'a', name: 'Garage' }), board({ uuid: 'b', name: 'Gym' })];
    rememberOfflineBoards(boards);
    setSpy.mockClear();

    // Every settings write calls emitChange(), which re-renders every useSetting
    // consumer app-wide. The online refresh hook runs on each myBoards success, so a
    // no-op refresh must not touch storage.
    rememberOfflineBoards(boards);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('caps the remembered list at 20 boards, keeping the most recent', () => {
    for (let index = 0; index < 25; index += 1) {
      rememberOfflineBoards([board({ uuid: `b${index}`, name: `Board ${index}` })]);
    }
    const cards = getOfflineBoards();
    expect(cards).toHaveLength(20);
    expect(cards[0]?.uuid).toBe('b24');
    expect(cards.at(-1)?.uuid).toBe('b5');
  });

  it('ignores boards that fail the shape guard', () => {
    rememberOfflineBoards([
      board({ uuid: 'ok', name: 'Fine' }),
      { uuid: 'bad', name: 'No layout', boardType: 'kilter', setIds: '20', angle: 40 } as unknown as UserBoard,
    ]);
    expect(getOfflineBoards().map((card) => card.uuid)).toEqual(['ok']);
  });

  it('forgets BOTH boards that share the scope being turned off', () => {
    // The download is per scope, so disabling one of two same-layout boards removes
    // the data behind both — leaving the sibling would offer a board with no climbs.
    rememberOfflineBoards([
      board({ uuid: 'garage', name: 'Garage' }),
      board({ uuid: 'gym', name: 'Gym' }),
      board({ uuid: 'tension', name: 'Tension', boardType: 'tension', layoutId: 12, sizeId: 3 }),
    ]);

    forgetOfflineBoardScope({ boardType: 'kilter', layoutId: 8, sizeId: 17 });

    expect(getOfflineBoards().map((card) => card.uuid)).toEqual(['tension']);
  });

  it('does not write when the scope being forgotten has no cards', () => {
    rememberOfflineBoards([board({ uuid: 'garage', name: 'Garage' })]);
    setSpy.mockClear();

    forgetOfflineBoardScope({ boardType: 'tension', layoutId: 12, sizeId: 3 });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('clears every card', () => {
    rememberOfflineBoards([board({ uuid: 'a', name: 'A' }), board({ uuid: 'b', name: 'B' })]);
    clearOfflineBoards();
    expect(getOfflineBoards()).toEqual([]);
  });

  it('reads a corrupt or non-array stored value as empty rather than throwing', () => {
    mockStorage.set('offlineBoardsV1', '{"not":"an array"}');
    expect(getOfflineBoards()).toEqual([]);

    mockStorage.set('offlineBoardsV1', 'not json at all');
    expect(getOfflineBoards()).toEqual([]);
  });
});
