import { describe, it, expect } from 'vite-plus/test';
import {
  buildFeedbackEnrichment,
  clip,
  clipBoardName,
  compactContext,
  type BuildFeedbackEnrichmentArgs,
} from '../use-submit-app-feedback';
import type { BoardDetails } from '@/app/lib/types';
import type { ClimbQueueItem } from '@/app/components/queue-control/types';

// Minimal BoardDetails — buildFeedbackEnrichment only reads identity fields.
function makeBoard(overrides: Partial<BoardDetails> = {}): BoardDetails {
  return {
    images_to_holds: {},
    holdsData: {},
    edge_left: 0,
    edge_right: 0,
    edge_bottom: 0,
    edge_top: 0,
    boardHeight: 0,
    boardWidth: 0,
    board_name: 'kilter',
    layout_id: 1,
    size_id: 5,
    set_ids: [1, 2],
    ...overrides,
  } as BoardDetails;
}

function makeClimbItem(name: string, overrides: Partial<ClimbQueueItem['climb']> = {}): ClimbQueueItem {
  return {
    uuid: `q-${name}`,
    addedBy: null,
    suggested: false,
    climb: {
      uuid: `c-${name}`,
      name,
      difficulty: 'V5',
      angle: 40,
      // The rest are not read by buildFeedbackEnrichment, so cast through.
      ...overrides,
    } as ClimbQueueItem['climb'],
  };
}

const baseArgs = (): BuildFeedbackEnrichmentArgs => ({
  boardDetails: null,
  angle: 0,
  activeSession: null,
  currentClimbQueueItem: null,
  url: undefined,
  userAgent: undefined,
});

describe('clip', () => {
  it('returns undefined for empty / null / undefined input', () => {
    expect(clip(undefined, 10)).toBeUndefined();
    expect(clip(null, 10)).toBeUndefined();
    expect(clip('', 10)).toBeUndefined();
  });

  it('returns the input untouched when within the max length', () => {
    expect(clip('hello', 10)).toBe('hello');
    // Boundary: exactly max length is unchanged.
    expect(clip('exactly10!', 10)).toBe('exactly10!');
  });

  it('truncates inputs longer than max to the first max characters', () => {
    expect(clip('abcdefghijk', 10)).toBe('abcdefghij');
  });
});

describe('clipBoardName', () => {
  it('returns null for missing / empty input so the DB stores NULL not ""', () => {
    expect(clipBoardName(undefined)).toBeNull();
    expect(clipBoardName(null)).toBeNull();
    expect(clipBoardName('')).toBeNull();
  });

  it('passes through any non-empty board identifier — no enum gating', () => {
    expect(clipBoardName('kilter')).toBe('kilter');
    expect(clipBoardName('tension')).toBe('tension');
    expect(clipBoardName('moonboard')).toBe('moonboard');
    // Future board names work without a code change.
    expect(clipBoardName('grasshopper')).toBe('grasshopper');
  });

  it('caps board names at 100 characters', () => {
    const long = 'x'.repeat(150);
    const clipped = clipBoardName(long);
    expect(clipped).toHaveLength(100);
  });
});

describe('compactContext', () => {
  it('returns null when every field is empty / undefined', () => {
    expect(compactContext({})).toBeNull();
    expect(compactContext({ url: undefined, userAgent: undefined })).toBeNull();
    expect(compactContext({ url: '', userAgent: '' })).toBeNull();
  });

  it('drops empty / undefined fields but keeps populated ones', () => {
    expect(
      compactContext({
        climbName: 'Project',
        climbUuid: undefined,
        url: '/kilter/1/5/1,2/40',
        userAgent: '',
      }),
    ).toEqual({
      climbName: 'Project',
      url: '/kilter/1/5/1,2/40',
    });
  });
});

describe('buildFeedbackEnrichment', () => {
  it('falls back to the bridge board when no party session is active', () => {
    const currentClimb = makeClimbItem('Solo');
    const result = buildFeedbackEnrichment({
      ...baseArgs(),
      boardDetails: makeBoard({ board_name: 'kilter', layout_id: 1, size_id: 5, set_ids: [1, 2] }),
      angle: 40,
      activeSession: null,
      currentClimbQueueItem: currentClimb,
    });
    expect(result.boardName).toBe('kilter');
    expect(result.layoutId).toBe(1);
    expect(result.sizeId).toBe(5);
    expect(result.setIds).toEqual([1, 2]);
    expect(result.angle).toBe(40);
    expect(result.context?.climbName).toBe('Solo');
    expect(result.context?.climbUuid).toBe('c-Solo');
  });

  it('prefers the active session board over the bridge board (mirrors sesh-settings-drawer)', () => {
    // `currentClimbQueueItem` is root-owned (single source, W6) — the caller
    // resolves it once, regardless of party/solo mode, so this only needs to
    // pin BOARD precedence (session over bridge). Climb selection is no
    // longer this function's concern.
    const currentClimb = makeClimbItem('Party');
    const result = buildFeedbackEnrichment({
      ...baseArgs(),
      // Bridge says kilter — but the party session overrides to tension.
      boardDetails: makeBoard({ board_name: 'kilter', layout_id: 1 }),
      angle: 40,
      activeSession: {
        sessionId: 'sess-1',
        sessionName: 'Friday Sesh',
        boardDetails: makeBoard({ board_name: 'tension', layout_id: 9, size_id: 3, set_ids: [7] }),
      },
      currentClimbQueueItem: currentClimb,
    });
    expect(result.boardName).toBe('tension');
    expect(result.layoutId).toBe(9);
    expect(result.sizeId).toBe(3);
    expect(result.setIds).toEqual([7]);
    expect(result.context?.sessionId).toBe('sess-1');
    expect(result.context?.sessionName).toBe('Friday Sesh');
    expect(result.context?.climbName).toBe('Party');
  });

  it('returns null board fields and null angle when no board is available anywhere', () => {
    const result = buildFeedbackEnrichment({
      ...baseArgs(),
      angle: 40, // even with a bridge angle, no board => angle is suppressed
    });
    expect(result.boardName).toBeNull();
    expect(result.layoutId).toBeNull();
    expect(result.sizeId).toBeNull();
    expect(result.setIds).toBeNull();
    expect(result.angle).toBeNull();
  });

  it('returns context: null when no climb / session / url / ua are available', () => {
    const result = buildFeedbackEnrichment({
      ...baseArgs(),
      boardDetails: makeBoard(),
      angle: 40,
    });
    expect(result.context).toBeNull();
  });

  it('clips long URLs and user agents to their respective maxes', () => {
    const longUrl = '/' + 'a'.repeat(2000);
    const longUa = 'UA/' + 'b'.repeat(2000);
    const result = buildFeedbackEnrichment({
      ...baseArgs(),
      boardDetails: makeBoard(),
      angle: 40,
      url: longUrl,
      userAgent: longUa,
    });
    // URL_MAX = 1000, UA_MAX = 512 in the implementation.
    expect(result.context?.url?.length).toBe(1000);
    expect(result.context?.userAgent?.length).toBe(512);
  });

  it('caps the resolved board name at 100 chars even if a board reports a longer identifier', () => {
    const result = buildFeedbackEnrichment({
      ...baseArgs(),
      boardDetails: makeBoard({ board_name: 'x'.repeat(200) as 'kilter' }),
      angle: 40,
    });
    expect(result.boardName?.length).toBe(100);
  });
});
