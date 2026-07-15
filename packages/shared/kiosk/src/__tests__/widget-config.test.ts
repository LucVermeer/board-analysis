import { describe, expect, it } from 'vitest';
import {
  IframeUrlSchema,
  KioskLayoutSchema,
  KioskWidgetSchema,
  GridPositionSchema,
  parseKioskLayoutLenient,
  emptyKioskLayout,
  type KioskWidget,
} from '../widget-config';
import {
  KIOSK_LAYOUT_VERSION,
  MAX_BOARDS_PER_WIDGET,
  MAX_KIOSK_WIDGETS,
  UP_NEXT_DEFAULT_COUNT,
  RECENT_SENDS_DEFAULT_LIMIT,
  SESSION_LEADERBOARD_DEFAULT_WINDOW_MINUTES,
} from '../constants';

// Deterministic RFC-4122 UUIDs for fixtures (z.uuid() validates the format).
const WIDGET_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_A = '22222222-2222-4222-8222-222222222222';
const BOARD_B = '33333333-3333-4333-8333-333333333333';

const POSITION = { x: 0, y: 0, w: 4, h: 4 };

function nowOnTheWall(overrides: Partial<KioskWidget> = {}): unknown {
  return { id: WIDGET_ID, position: POSITION, type: 'now-on-the-wall', boardUuid: BOARD_A, ...overrides };
}

describe('GridPositionSchema', () => {
  it('accepts an in-bounds position', () => {
    expect(GridPositionSchema.safeParse({ x: 11, y: 7, w: 12, h: 8 }).success).toBe(true);
  });

  it('rejects x past the last column', () => {
    expect(GridPositionSchema.safeParse({ x: 12, y: 0, w: 1, h: 1 }).success).toBe(false);
  });

  it('rejects y past the last row', () => {
    expect(GridPositionSchema.safeParse({ x: 0, y: 8, w: 1, h: 1 }).success).toBe(false);
  });

  it('rejects a zero-width span', () => {
    expect(GridPositionSchema.safeParse({ x: 0, y: 0, w: 0, h: 1 }).success).toBe(false);
  });

  it('rejects a height taller than the grid', () => {
    expect(GridPositionSchema.safeParse({ x: 0, y: 0, w: 1, h: 9 }).success).toBe(false);
  });

  it('rejects non-integer coordinates', () => {
    expect(GridPositionSchema.safeParse({ x: 0.5, y: 0, w: 1, h: 1 }).success).toBe(false);
  });
});

describe('KioskWidgetSchema — valid layouts per type', () => {
  it('accepts now-on-the-wall', () => {
    expect(KioskWidgetSchema.safeParse(nowOnTheWall()).success).toBe(true);
  });

  it('accepts up-next and defaults count', () => {
    const parsed = KioskWidgetSchema.safeParse({
      id: WIDGET_ID,
      position: POSITION,
      type: 'up-next',
      boardUuid: BOARD_A,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'up-next') {
      expect(parsed.data.count).toBe(UP_NEXT_DEFAULT_COUNT);
    }
  });

  it('accepts session-leaderboard and defaults windowMinutes', () => {
    const parsed = KioskWidgetSchema.safeParse({
      id: WIDGET_ID,
      position: POSITION,
      type: 'session-leaderboard',
      boardUuids: [BOARD_A, BOARD_B],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'session-leaderboard') {
      expect(parsed.data.windowMinutes).toBe(SESSION_LEADERBOARD_DEFAULT_WINDOW_MINUTES);
    }
  });

  it('accepts recent-sends and defaults limit', () => {
    const parsed = KioskWidgetSchema.safeParse({
      id: WIDGET_ID,
      position: POSITION,
      type: 'recent-sends',
      boardUuids: [BOARD_A],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'recent-sends') {
      expect(parsed.data.limit).toBe(RECENT_SENDS_DEFAULT_LIMIT);
    }
  });

  it('accepts iframe with an https url', () => {
    expect(
      KioskWidgetSchema.safeParse({
        id: WIDGET_ID,
        position: POSITION,
        type: 'iframe',
        url: 'https://example.com/news',
        title: 'Gym news',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown widget type', () => {
    expect(KioskWidgetSchema.safeParse({ ...(nowOnTheWall() as object), type: 'weather' }).success).toBe(false);
  });

  it('rejects a widget with a non-uuid id', () => {
    expect(KioskWidgetSchema.safeParse(nowOnTheWall({ id: 'not-a-uuid' } as Partial<KioskWidget>)).success).toBe(false);
  });

  it('rejects session-leaderboard with an empty board list', () => {
    expect(
      KioskWidgetSchema.safeParse({
        id: WIDGET_ID,
        position: POSITION,
        type: 'session-leaderboard',
        boardUuids: [],
      }).success,
    ).toBe(false);
  });

  it('rejects up-next count above the max', () => {
    expect(
      KioskWidgetSchema.safeParse({
        id: WIDGET_ID,
        position: POSITION,
        type: 'up-next',
        boardUuid: BOARD_A,
        count: 11,
      }).success,
    ).toBe(false);
  });

  it('rejects recent-sends limit above the max', () => {
    expect(
      KioskWidgetSchema.safeParse({
        id: WIDGET_ID,
        position: POSITION,
        type: 'recent-sends',
        boardUuids: [BOARD_A],
        limit: 26,
      }).success,
    ).toBe(false);
  });

  it('rejects a multi-board widget with more than MAX_BOARDS_PER_WIDGET boards', () => {
    const tooManyBoards = Array.from({ length: MAX_BOARDS_PER_WIDGET + 1 }, () => BOARD_A);
    expect(
      KioskWidgetSchema.safeParse({
        id: WIDGET_ID,
        position: POSITION,
        type: 'session-leaderboard',
        boardUuids: tooManyBoards,
      }).success,
    ).toBe(false);
  });
});

describe('IframeUrlSchema refinements', () => {
  it('accepts an https url', () => {
    expect(IframeUrlSchema.safeParse('https://gym.example.com/news').success).toBe(true);
  });

  it('rejects http (non-https)', () => {
    expect(IframeUrlSchema.safeParse('http://gym.example.com/news').success).toBe(false);
  });

  it('rejects a url with userinfo credentials', () => {
    expect(IframeUrlSchema.safeParse('https://user:pass@gym.example.com/news').success).toBe(false);
  });

  it('rejects boardsesh.com', () => {
    expect(IframeUrlSchema.safeParse('https://boardsesh.com/anything').success).toBe(false);
  });

  it('rejects a boardsesh.com subdomain', () => {
    expect(IframeUrlSchema.safeParse('https://embed.boardsesh.com/x').success).toBe(false);
  });

  it('rejects a look-alike host that is not actually boardsesh.com', () => {
    // A suffix check must not be fooled by "notboardsesh.com" nor blanket-block
    // an unrelated host that merely contains the string.
    expect(IframeUrlSchema.safeParse('https://boardsesh.com.evil.example/x').success).toBe(true);
  });

  it('rejects a non-url string', () => {
    expect(IframeUrlSchema.safeParse('definitely not a url').success).toBe(false);
  });

  it('rejects a url longer than the cap', () => {
    const longUrl = `https://example.com/${'a'.repeat(2100)}`;
    expect(IframeUrlSchema.safeParse(longUrl).success).toBe(false);
  });
});

describe('KioskLayoutSchema (strict writer)', () => {
  it('accepts an empty layout', () => {
    expect(KioskLayoutSchema.safeParse(emptyKioskLayout()).success).toBe(true);
  });

  it('accepts a full layout of MAX_KIOSK_WIDGETS widgets', () => {
    const widgets = Array.from({ length: MAX_KIOSK_WIDGETS }, () => nowOnTheWall());
    const parsed = KioskLayoutSchema.safeParse({ version: KIOSK_LAYOUT_VERSION, widgets });
    expect(parsed.success).toBe(true);
  });

  it('rejects more than MAX_KIOSK_WIDGETS widgets', () => {
    const widgets = Array.from({ length: MAX_KIOSK_WIDGETS + 1 }, () => nowOnTheWall());
    expect(KioskLayoutSchema.safeParse({ version: KIOSK_LAYOUT_VERSION, widgets }).success).toBe(false);
  });

  it('rejects a wrong version literal', () => {
    expect(KioskLayoutSchema.safeParse({ version: 2, widgets: [] }).success).toBe(false);
  });
});

describe('parseKioskLayoutLenient (forward-compat reader)', () => {
  it('keeps valid widgets and drops unknown-type ones', () => {
    const input = {
      version: KIOSK_LAYOUT_VERSION,
      widgets: [
        nowOnTheWall(),
        { id: BOARD_B, position: POSITION, type: 'from-the-future', payload: 42 },
        { id: WIDGET_ID, position: POSITION, type: 'up-next', boardUuid: BOARD_A },
      ],
    };
    const { layout, droppedWidgetCount } = parseKioskLayoutLenient(input);
    expect(droppedWidgetCount).toBe(1);
    expect(layout.widgets).toHaveLength(2);
    expect(layout.widgets.map((widget) => widget.type)).toEqual(['now-on-the-wall', 'up-next']);
  });

  it('drops a malformed widget of a known type', () => {
    const input = {
      version: KIOSK_LAYOUT_VERSION,
      widgets: [nowOnTheWall(), { id: WIDGET_ID, position: POSITION, type: 'iframe', url: 'http://insecure.example' }],
    };
    const { layout, droppedWidgetCount } = parseKioskLayoutLenient(input);
    expect(droppedWidgetCount).toBe(1);
    expect(layout.widgets).toHaveLength(1);
  });

  it('returns an empty layout for an unknown top-level version', () => {
    const input = { version: 999, widgets: [nowOnTheWall()] };
    const { layout, droppedWidgetCount } = parseKioskLayoutLenient(input);
    expect(layout).toEqual(emptyKioskLayout());
    expect(droppedWidgetCount).toBe(0);
  });

  it('returns an empty layout for null / undefined / non-object input', () => {
    for (const garbage of [null, undefined, 42, 'nope', []]) {
      const { layout, droppedWidgetCount } = parseKioskLayoutLenient(garbage);
      expect(layout).toEqual(emptyKioskLayout());
      expect(droppedWidgetCount).toBe(0);
    }
  });

  it('returns an empty layout when widgets is not an array', () => {
    const { layout } = parseKioskLayoutLenient({ version: KIOSK_LAYOUT_VERSION, widgets: 'oops' });
    expect(layout).toEqual(emptyKioskLayout());
  });

  it('applies widget defaults on the way through', () => {
    const input = {
      version: KIOSK_LAYOUT_VERSION,
      widgets: [{ id: WIDGET_ID, position: POSITION, type: 'up-next', boardUuid: BOARD_A }],
    };
    const { layout } = parseKioskLayoutLenient(input);
    expect(layout.widgets[0]).toMatchObject({ type: 'up-next', count: UP_NEXT_DEFAULT_COUNT });
  });

  it('truncates to MAX_KIOSK_WIDGETS when a writer bypassed the strict cap', () => {
    const overBy = 3;
    const widgets = Array.from({ length: MAX_KIOSK_WIDGETS + overBy }, () => nowOnTheWall());
    const { layout, droppedWidgetCount } = parseKioskLayoutLenient({ version: KIOSK_LAYOUT_VERSION, widgets });
    expect(layout.widgets).toHaveLength(MAX_KIOSK_WIDGETS);
    expect(droppedWidgetCount).toBe(overBy);
  });
});
