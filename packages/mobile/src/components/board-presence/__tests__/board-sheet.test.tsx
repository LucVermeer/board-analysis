// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, createRef, forwardRef, useImperativeHandle, type ReactNode, type Ref } from 'react';
import type { BoardPresenceClimb, BoardPresenceStats } from '@boardsesh/shared-schema';

const presence = vi.hoisted(() => ({
  currentClimb: null as BoardPresenceClimb | null,
  history: [] as BoardPresenceClimb[],
  stats: null as BoardPresenceStats | null,
}));

const presenceControls = vi.hoisted(() => ({
  boardId: 123 as number | null,
}));

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
}));

const sheetModal = vi.hoisted(() => ({ present: vi.fn(), dismiss: vi.fn() }));
const climbRows = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
const thumbnails = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

type ViewMockProps = { children?: ReactNode; style?: unknown };
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, hairlineWidth: 1 },
  View: ({ children }: ViewMockProps) => createElement('div', null, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: ViewMockProps & { onPress?: () => void; accessibilityLabel?: string }) =>
    createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children),
}));

vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModal: forwardRef(({ children }: { children?: ReactNode }, ref: Ref<unknown>) => {
    useImperativeHandle(ref, () => ({ present: sheetModal.present, dismiss: sheetModal.dismiss }));
    return createElement('div', { 'data-sheet': 'true' }, children);
  }),
  BottomSheetBackdrop: () => createElement('div', { 'data-backdrop': 'true' }),
  // Render the list inline so header + items + empty state appear in the DOM.
  BottomSheetFlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    keyExtractor,
  }: {
    data: BoardPresenceClimb[];
    renderItem: (info: { item: BoardPresenceClimb }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
    keyExtractor: (item: BoardPresenceClimb) => string;
  }) =>
    createElement(
      'div',
      { 'data-list': 'true' },
      ListHeaderComponent,
      data.length === 0
        ? ListEmptyComponent
        : data.map((item) => createElement('div', { key: keyExtractor(item) }, renderItem({ item }))),
    ),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${Object.values(opts).join(',')}` : key),
  }),
}));

vi.mock('@boardsesh/board-constants/grade-colors', () => ({
  getGradeColor: () => '#abcdef',
  DEFAULT_GRADE_COLOR: '#999999',
}));

vi.mock('@boardsesh/board-presence-react', () => ({
  useBoardPresenceCurrent: () => ({
    currentClimb: presence.currentClimb,
    previousClimb: null,
    undoTarget: null,
    isLive: true,
  }),
  useBoardPresenceFeed: () => ({ history: presence.history, stats: presence.stats }),
}));

vi.mock('../../../providers/board-presence-provider', () => ({
  useBoardPresenceControls: () => ({
    enabled: true,
    boardId: presenceControls.boardId,
    resolveAndBindBoard: vi.fn(async () => null),
  }),
}));

vi.mock('../../../lib/analytics', () => ({
  track: analytics.track,
}));

vi.mock('../../GlassSheetBackground', () => ({ GlassSheetBackground: () => createElement('div', null) }));
vi.mock('../../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', { 'data-text': 'true' }, children),
}));
vi.mock('../../Icon', () => ({ Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }) }));
vi.mock('../../ClimbListRow', () => ({
  ClimbListRow: (props: Record<string, unknown>) => {
    climbRows.props.push(props);
    const renderContent =
      typeof props.renderContent === 'function'
        ? (props.renderContent as (args: {
            climb: unknown;
            boardName: unknown;
            layoutId: unknown;
            sizeId: unknown;
            setIds: unknown;
            angle: unknown;
          }) => ReactNode)
        : null;
    const climb = props.climb as { uuid?: string; name?: string } | undefined;
    const content = renderContent
      ? renderContent({
          climb: props.climb,
          boardName: props.boardName,
          layoutId: props.layoutId,
          sizeId: props.sizeId,
          setIds: props.setIds,
          angle: props.angle,
        })
      : climb?.name;
    const climbUuid = climb?.uuid ?? 'unknown';
    return createElement(
      'div',
      { 'data-climb-row': climbUuid },
      createElement(
        'button',
        {
          'aria-label': `press ${climbUuid}`,
          onClick: () => {
            if (typeof props.onPress === 'function') props.onPress(props.climb);
          },
        },
        content,
      ),
      createElement(
        'button',
        {
          'aria-label': `queue ${climbUuid}`,
          onClick: () => {
            if (typeof props.onAddToQueue === 'function') props.onAddToQueue(props.climb);
          },
        },
        'queue',
      ),
      createElement(
        'button',
        {
          'aria-label': `playlist ${climbUuid}`,
          onClick: () => {
            if (typeof props.onOpenPlaylist === 'function') props.onOpenPlaylist(props.climb);
          },
        },
        'playlist',
      ),
      createElement(
        'button',
        {
          'aria-label': `actions ${climbUuid}`,
          onClick: () => {
            if (typeof props.onOpenActions === 'function') props.onOpenActions(props.climb);
          },
        },
        'actions',
      ),
    );
  },
}));
vi.mock('../../queue-control/AccessoryClimbThumbnail', () => ({
  AccessoryClimbThumbnail: (props: Record<string, unknown>) => {
    thumbnails.props.push(props);
    return createElement('div', { 'data-thumb': 'true', 'data-size': props.size ?? 40 });
  },
}));
vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: {
      label: '#000',
      secondaryLabel: '#666',
      tertiaryLabel: '#999',
      secondaryBackground: '#f2f2f7',
      separator: '#ccc',
    },
    brandColors: { warning: '#B45309', primary: '#6D28D9' },
    sheet: { scrimOpacity: 0.3, handleStyle: {} },
  }),
}));
vi.mock('../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (grade: string) => grade }),
}));
vi.mock('../../../theme/tokens', () => ({
  spacing: { 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 },
  borderRadius: { md: 8, lg: 12 },
}));

import { BoardSheet, type BoardSheetHandle } from '../BoardSheet';
import { SHARED_EVENTS } from '@boardsesh/analytics';

function makeClimb(climbUuid: string, seq: number, overrides: Partial<BoardPresenceClimb> = {}): BoardPresenceClimb {
  return {
    climbUuid,
    seq,
    sentAt: '2026-06-09T00:00:00.000Z',
    name: `Climb ${climbUuid}`,
    grade: 'V5',
    angle: 40,
    setter: 'Some Setter',
    sentByDisplayName: 'Marco',
    ...overrides,
  };
}

const noop = () => {};
const boardConfig = { boardName: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2', angle: 40 };

describe('BoardSheet', () => {
  beforeEach(() => {
    presence.currentClimb = null;
    presence.history = [];
    presence.stats = null;
    presenceControls.boardId = 123;
    analytics.track.mockClear();
    sheetModal.present.mockClear();
    sheetModal.dismiss.mockClear();
    climbRows.props = [];
    thumbnails.props = [];
  });

  it('presents and dismisses via the imperative ref', () => {
    const ref = createRef<BoardSheetHandle>();
    render(
      createElement(BoardSheet, {
        ref,
        boardLabel: 'Garage Wall • 45°',
        onClose: noop,
        boardConfig,
        onSwitchBoard: noop,
      }),
    );
    expect(sheetModal.present).not.toHaveBeenCalled();

    ref.current?.present();
    expect(sheetModal.present).toHaveBeenCalled();

    ref.current?.dismiss();
    expect(sheetModal.dismiss).toHaveBeenCalled();
  });

  it('tracks distinct now-on-the-wall climbs from the presence feed', () => {
    presence.currentClimb = makeClimb('c1', 3);

    render(
      createElement(BoardSheet, {
        boardLabel: 'Garage Wall',
        onClose: noop,
        boardConfig,
        onSwitchBoard: noop,
      }),
    );

    expect(analytics.track).toHaveBeenCalledWith(SHARED_EVENTS.BoardNowPlayingReceived, {
      boardId: 123,
      climbUuid: 'c1',
    });
  });

  it('tracks history views from the imperative present call', () => {
    presence.history = [makeClimb('c1', 3), makeClimb('c0', 2)];
    const ref = createRef<BoardSheetHandle>();
    render(
      createElement(BoardSheet, {
        ref,
        boardLabel: 'Garage Wall',
        onClose: noop,
        boardConfig,
        onSwitchBoard: noop,
      }),
    );

    ref.current?.present();

    expect(analytics.track).toHaveBeenCalledWith(SHARED_EVENTS.BoardHistoryViewed, {
      boardId: 123,
      itemCount: 2,
    });
    expect(sheetModal.present).toHaveBeenCalled();
  });

  it('renders the empty state when no climb is on the wall', () => {
    const { container } = render(
      createElement(BoardSheet, {
        boardLabel: 'Garage Wall',
        onClose: noop,
        onDismissed: noop,
        boardConfig,
        onSwitchBoard: noop,
      }),
    );
    expect(container.textContent).toContain('mobile.boardPresence.emptyTitle');
  });

  it('renders the hero, stats and virtualized history when there is wall activity', () => {
    presence.currentClimb = makeClimb('c1', 3);
    presence.history = [makeClimb('c1', 3), makeClimb('c0', 2, { name: 'Older Climb' })];
    presence.stats = {
      climbsSentCount: 14,
      distinctClimbersCount: 5,
      hardestGrade: 'V9',
      topGrade: 'V5',
      lastSentAt: null,
    };

    const { container } = render(
      createElement(BoardSheet, {
        boardLabel: 'Garage Wall',
        onClose: noop,
        onDismissed: noop,
        boardConfig,
        onSwitchBoard: noop,
      }),
    );

    // Hero climb name + history item name both render.
    expect(container.textContent).toContain('Climb c1');
    expect(container.textContent).toContain('Older Climb');
    // Stats tiles.
    expect(container.textContent).toContain('14');
    expect(container.textContent).toContain('mobile.boardPresence.historyHeader');
    // History list rendered one node per item.
    expect(container.querySelector('[data-list="true"]')).not.toBeNull();
  });

  it('wires the hero and lit-on-this-wall rows to the shared climb actions', () => {
    presence.currentClimb = makeClimb('hero-climb', 3, { frames: 'hero-frames', grade: 'V7' });
    presence.history = [makeClimb('old-climb', 2, { frames: 'old-frames', grade: 'V4', angle: 30 })];
    const onClose = vi.fn();
    const onClimbPress = vi.fn();
    const onAddToQueue = vi.fn();
    const onOpenPlaylist = vi.fn();
    const onOpenActions = vi.fn();

    const { getByLabelText } = render(
      createElement(BoardSheet, {
        boardLabel: 'Garage Wall',
        onClose,
        onDismissed: noop,
        boardConfig,
        onSwitchBoard: noop,
        onClimbPress,
        onAddToQueue,
        onOpenPlaylist,
        onOpenActions,
      }),
    );

    fireEvent.click(getByLabelText('press hero-climb'));
    expect(onClimbPress).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'hero-climb',
        name: 'Climb hero-climb',
        frames: 'hero-frames',
        difficulty: 'V7',
        setter_username: 'Some Setter',
        angle: 40,
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(getByLabelText('queue old-climb'));
    expect(onAddToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'old-climb', frames: 'old-frames', difficulty: 'V4', angle: 30 }),
    );

    fireEvent.click(getByLabelText('playlist old-climb'));
    expect(onOpenPlaylist).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'old-climb' }));

    fireEvent.click(getByLabelText('actions old-climb'));
    expect(onOpenActions).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'old-climb' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(thumbnails.props).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ climb: expect.objectContaining({ uuid: 'hero-climb' }), size: 52 }),
        expect.objectContaining({ climb: expect.objectContaining({ uuid: 'old-climb' }) }),
      ]),
    );
  });

  it('fires onSwitchBoard from the footer switch control', () => {
    const onSwitchBoard = vi.fn();
    const { container, getByLabelText } = render(
      createElement(BoardSheet, {
        boardLabel: 'Garage Wall',
        onClose: noop,
        onDismissed: noop,
        boardConfig,
        onSwitchBoard,
      }),
    );
    expect(container.querySelector('[data-icon="transfer"]')).not.toBeNull();
    expect(container.textContent).toContain('mobile.boardPresence.switchBoard');
    fireEvent.click(getByLabelText('mobile.boardPresence.switchBoardAria'));
    expect(onSwitchBoard).toHaveBeenCalledTimes(1);
  });

  it('fires onClose from the header chevron', () => {
    const onClose = vi.fn();
    const { container, getByLabelText } = render(
      createElement(BoardSheet, {
        boardLabel: 'Garage Wall',
        onClose,
        onDismissed: noop,
        boardConfig,
        onSwitchBoard: noop,
      }),
    );
    expect(container.querySelector('[data-icon="chevron.down"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="close"]')).toBeNull();
    fireEvent.click(getByLabelText('mobile.boardPresence.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
