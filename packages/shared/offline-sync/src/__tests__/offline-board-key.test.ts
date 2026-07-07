import { describe, it, expect } from 'vitest';

import {
  offlineBoardKey,
  offlineBoardKeyForBoard,
  offlineBoardScopeForBoard,
  parseOfflineBoardKey,
} from '../offline-board-key';

describe('offline board key', () => {
  it('encodes a scope as boardType:layoutId:sizeId', () => {
    expect(offlineBoardKey({ boardType: 'kilter', layoutId: 1, sizeId: 5 })).toBe('kilter:1:5');
  });

  it('round-trips a well-formed key', () => {
    const scope = { boardType: 'tension', layoutId: 8, sizeId: 10 };
    expect(parseOfflineBoardKey(offlineBoardKey(scope))).toEqual(scope);
  });

  it('derives the key from a board-like object', () => {
    const board = { boardType: 'kilter', layoutId: 1, sizeId: 5, name: 'ignored' };
    expect(offlineBoardKeyForBoard(board)).toBe('kilter:1:5');
    expect(offlineBoardScopeForBoard(board)).toEqual({ boardType: 'kilter', layoutId: 1, sizeId: 5 });
  });

  it('rejects malformed keys defensively', () => {
    expect(parseOfflineBoardKey('kilter')).toBeNull(); // legacy bare board type
    expect(parseOfflineBoardKey('kilter:1')).toBeNull(); // missing size
    expect(parseOfflineBoardKey('kilter:1:5:extra')).toBeNull(); // too many parts
    expect(parseOfflineBoardKey('kilter:a:5')).toBeNull(); // non-numeric layout
    expect(parseOfflineBoardKey('kilter:1:b')).toBeNull(); // non-numeric size
    expect(parseOfflineBoardKey(':1:5')).toBeNull(); // empty board type
    expect(parseOfflineBoardKey('kilter:1.5:5')).toBeNull(); // non-integer layout
  });
});
