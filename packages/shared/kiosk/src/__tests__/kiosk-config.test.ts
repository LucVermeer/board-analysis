import { describe, expect, it } from 'vitest';
import {
  KioskBoardSlotSchema,
  KioskLeaderboardSchema,
  KioskLayoutSchema,
  emptyKioskLayout,
  parseKioskLayoutLenient,
} from '../kiosk-config';
import {
  KIOSK_DEFAULT_LEADERBOARD_PERIOD,
  KIOSK_LAYOUT_VERSION,
  KIOSK_PRESETS,
  MAX_KIOSK_BOARDS,
  kioskPresetForBoardCount,
} from '../constants';

// Deterministic RFC-4122 UUIDs for fixtures (z.uuid() validates the format).
const BOARD_A = '11111111-1111-4111-8111-111111111111';
const BOARD_B = '22222222-2222-4222-8222-222222222222';
const BOARD_C = '33333333-3333-4333-8333-333333333333';
const BOARD_D = '44444444-4444-4444-8444-444444444444';
const BOARD_E = '55555555-5555-4555-8555-555555555555';

function slot(boardUuid: string) {
  return { boardUuid };
}

describe('kioskPresetForBoardCount', () => {
  it('maps 1–4 boards to single/dual/triple/quad', () => {
    expect(kioskPresetForBoardCount(1)).toBe('single');
    expect(kioskPresetForBoardCount(2)).toBe('dual');
    expect(kioskPresetForBoardCount(3)).toBe('triple');
    expect(kioskPresetForBoardCount(4)).toBe('quad');
    expect(KIOSK_PRESETS).toEqual(['single', 'dual', 'triple', 'quad']);
  });

  it('returns null for 0, out-of-range, and non-integer counts', () => {
    expect(kioskPresetForBoardCount(0)).toBeNull();
    expect(kioskPresetForBoardCount(5)).toBeNull();
    expect(kioskPresetForBoardCount(-1)).toBeNull();
    expect(kioskPresetForBoardCount(2.5)).toBeNull();
  });
});

describe('KioskBoardSlotSchema', () => {
  it('accepts a slot with a uuid', () => {
    expect(KioskBoardSlotSchema.safeParse(slot(BOARD_A)).success).toBe(true);
  });

  it('rejects a slot with a non-uuid boardUuid', () => {
    expect(KioskBoardSlotSchema.safeParse({ boardUuid: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects a slot missing boardUuid', () => {
    expect(KioskBoardSlotSchema.safeParse({}).success).toBe(false);
  });
});

describe('KioskLeaderboardSchema', () => {
  it('defaults boardUuid to null and period to the session default', () => {
    const parsed = KioskLeaderboardSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.boardUuid).toBeNull();
      expect(parsed.data.period).toBe(KIOSK_DEFAULT_LEADERBOARD_PERIOD);
      expect(parsed.data.period).toBe('session');
    }
  });

  it('accepts an explicit board scope and period', () => {
    const parsed = KioskLeaderboardSchema.safeParse({ boardUuid: BOARD_A, period: 'week' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.boardUuid).toBe(BOARD_A);
      expect(parsed.data.period).toBe('week');
    }
  });

  it('rejects an unknown period', () => {
    expect(KioskLeaderboardSchema.safeParse({ period: 'yearly' }).success).toBe(false);
  });

  it('rejects a non-uuid, non-null boardUuid', () => {
    expect(KioskLeaderboardSchema.safeParse({ boardUuid: 'nope' }).success).toBe(false);
  });
});

describe('KioskLayoutSchema (strict writer)', () => {
  it('accepts the empty layout', () => {
    expect(KioskLayoutSchema.safeParse(emptyKioskLayout()).success).toBe(true);
  });

  it('treats an empty boards array as valid (create-then-configure)', () => {
    const parsed = KioskLayoutSchema.safeParse({ version: KIOSK_LAYOUT_VERSION, boards: [], leaderboard: null });
    expect(parsed.success).toBe(true);
  });

  it('defaults leaderboard to null when omitted', () => {
    const parsed = KioskLayoutSchema.safeParse({ version: KIOSK_LAYOUT_VERSION, boards: [] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.leaderboard).toBeNull();
    }
  });

  it('accepts a full layout of MAX_KIOSK_BOARDS boards', () => {
    const boards = [BOARD_A, BOARD_B, BOARD_C, BOARD_D].map(slot);
    expect(boards).toHaveLength(MAX_KIOSK_BOARDS);
    const parsed = KioskLayoutSchema.safeParse({ version: KIOSK_LAYOUT_VERSION, boards, leaderboard: null });
    expect(parsed.success).toBe(true);
  });

  it('rejects more than MAX_KIOSK_BOARDS boards', () => {
    const boards = [BOARD_A, BOARD_B, BOARD_C, BOARD_D, BOARD_E].map(slot);
    expect(KioskLayoutSchema.safeParse({ version: KIOSK_LAYOUT_VERSION, boards, leaderboard: null }).success).toBe(
      false,
    );
  });

  it('rejects a wrong version literal', () => {
    expect(KioskLayoutSchema.safeParse({ version: 2, boards: [], leaderboard: null }).success).toBe(false);
  });

  it('accepts a rail scoped to all boards (boardUuid null)', () => {
    const parsed = KioskLayoutSchema.safeParse({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A), slot(BOARD_B)],
      leaderboard: { boardUuid: null, period: 'session' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a single-board rail pointing at a kiosk board', () => {
    const parsed = KioskLayoutSchema.safeParse({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A), slot(BOARD_B)],
      leaderboard: { boardUuid: BOARD_B, period: 'day' },
    });
    expect(parsed.success).toBe(true);
  });

  it('superRefine: rejects duplicate board slots', () => {
    const parsed = KioskLayoutSchema.safeParse({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A), slot(BOARD_A)],
      leaderboard: null,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'boards.1.boardUuid')).toBe(true);
    }
  });

  it('superRefine: rejects a single-board rail not among the kiosk boards', () => {
    const parsed = KioskLayoutSchema.safeParse({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A)],
      leaderboard: { boardUuid: BOARD_B, period: 'week' },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'leaderboard.boardUuid')).toBe(true);
    }
  });
});

describe('parseKioskLayoutLenient (forward-compat reader)', () => {
  it('returns the empty layout for an unknown top-level version', () => {
    const result = parseKioskLayoutLenient({ version: 999, boards: [slot(BOARD_A)], leaderboard: null });
    expect(result.layout).toEqual(emptyKioskLayout());
    expect(result.droppedBoardCount).toBe(0);
    expect(result.droppedLeaderboard).toBe(false);
  });

  it('returns the empty layout for null / undefined / non-object input', () => {
    for (const garbage of [null, undefined, 42, 'nope', []]) {
      const result = parseKioskLayoutLenient(garbage);
      expect(result.layout).toEqual(emptyKioskLayout());
      expect(result.droppedBoardCount).toBe(0);
      expect(result.droppedLeaderboard).toBe(false);
    }
  });

  it('keeps valid slots and drops malformed ones', () => {
    const result = parseKioskLayoutLenient({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A), { boardUuid: 'not-a-uuid' }, slot(BOARD_B)],
      leaderboard: null,
    });
    expect(result.layout.boards.map((each) => each.boardUuid)).toEqual([BOARD_A, BOARD_B]);
    expect(result.droppedBoardCount).toBe(1);
  });

  it('dedupes slots by boardUuid, keeping the first', () => {
    const result = parseKioskLayoutLenient({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A), slot(BOARD_A), slot(BOARD_B)],
      leaderboard: null,
    });
    expect(result.layout.boards.map((each) => each.boardUuid)).toEqual([BOARD_A, BOARD_B]);
    expect(result.droppedBoardCount).toBe(1);
  });

  it('caps at MAX_KIOSK_BOARDS when a writer bypassed the strict cap', () => {
    const overBy = 2;
    const boards = [BOARD_A, BOARD_B, BOARD_C, BOARD_D, BOARD_E, '66666666-6666-4666-8666-666666666666'].map(slot);
    expect(boards.length).toBe(MAX_KIOSK_BOARDS + overBy);
    const result = parseKioskLayoutLenient({ version: KIOSK_LAYOUT_VERSION, boards, leaderboard: null });
    expect(result.layout.boards).toHaveLength(MAX_KIOSK_BOARDS);
    expect(result.droppedBoardCount).toBe(overBy);
  });

  it('treats a non-array boards field as an empty board list', () => {
    const result = parseKioskLayoutLenient({ version: KIOSK_LAYOUT_VERSION, boards: 'oops', leaderboard: null });
    expect(result.layout.boards).toEqual([]);
    expect(result.droppedBoardCount).toBe(0);
  });

  it('drops a malformed leaderboard to null and flags it', () => {
    const result = parseKioskLayoutLenient({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A)],
      leaderboard: { period: 'from-the-future' },
    });
    expect(result.layout.leaderboard).toBeNull();
    expect(result.droppedLeaderboard).toBe(true);
  });

  it('keeps a valid rail scoped to all boards untouched', () => {
    const result = parseKioskLayoutLenient({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A)],
      leaderboard: { boardUuid: null, period: 'week' },
    });
    expect(result.layout.leaderboard).toEqual({ boardUuid: null, period: 'week' });
    expect(result.droppedLeaderboard).toBe(false);
  });

  it('widens a single-board rail to all boards when its board did not survive', () => {
    const result = parseKioskLayoutLenient({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A)],
      leaderboard: { boardUuid: BOARD_B, period: 'month' },
    });
    expect(result.layout.leaderboard).toEqual({ boardUuid: null, period: 'month' });
    expect(result.droppedLeaderboard).toBe(true);
  });

  it('keeps a single-board rail whose board is still present', () => {
    const result = parseKioskLayoutLenient({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A), slot(BOARD_B)],
      leaderboard: { boardUuid: BOARD_B, period: 'day' },
    });
    expect(result.layout.leaderboard).toEqual({ boardUuid: BOARD_B, period: 'day' });
    expect(result.droppedLeaderboard).toBe(false);
  });

  it('produces a layout the strict schema re-accepts', () => {
    const result = parseKioskLayoutLenient({
      version: KIOSK_LAYOUT_VERSION,
      boards: [slot(BOARD_A), slot(BOARD_A), { boardUuid: 'bad' }, slot(BOARD_B)],
      leaderboard: { boardUuid: BOARD_C, period: 'week' },
    });
    expect(KioskLayoutSchema.safeParse(result.layout).success).toBe(true);
  });
});
