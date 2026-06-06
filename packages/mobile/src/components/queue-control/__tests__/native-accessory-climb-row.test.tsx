// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, type ReactNode, type CSSProperties } from 'react';
import type { Climb, ClimbQueueItem } from '@boardsesh/queue';
import type { BoardConfig } from '../../../providers/drawer-host-provider';

const queue = vi.hoisted(() => ({
  state: {
    currentClimbQueueItem: null as ClimbQueueItem | null,
    queue: [] as ClimbQueueItem[],
  },
  nextClimb: vi.fn(),
  previousClimb: vi.fn(),
}));

const drawer = vi.hoisted(() => ({
  boardConfig: null as BoardConfig | null,
  openPlayDrawer: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PlatformColor: (name: string) => name,
  View: ({
    children,
    style,
    accessibilityRole,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    style?: unknown;
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }) => {
    const styles = Array.isArray(style) ? style : [style];
    const height = styles.reduce<unknown>((foundHeight, styleEntry) => {
      if (foundHeight != null) return foundHeight;
      return styleEntry != null && typeof styleEntry === 'object' && 'height' in styleEntry
        ? (styleEntry as { height?: unknown }).height
        : null;
    }, null);
    const paddingRight = styles.reduce<unknown>((foundPaddingRight, styleEntry) => {
      if (foundPaddingRight != null) return foundPaddingRight;
      return styleEntry != null && typeof styleEntry === 'object' && 'paddingRight' in styleEntry
        ? (styleEntry as { paddingRight?: unknown }).paddingRight
        : null;
    }, null);
    return createElement(
      'div',
      {
        'data-height': height == null ? '' : String(height),
        'data-padding-right': paddingRight == null ? '' : String(paddingRight),
        'data-role': accessibilityRole ?? '',
        'data-label': accessibilityLabel ?? '',
      },
      children,
    );
  },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement('div', null, children) },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: () => ({}),
  useDerivedValue: () => ({ value: 0 }),
}));

vi.mock('react-native-gesture-handler', () => {
  const chainable: Record<string, () => unknown> = {};
  const builder = new Proxy(chainable, { get: () => () => builder });
  return {
    GestureDetector: ({ children }: { children?: ReactNode }) =>
      createElement('div', { 'data-gesture': 'true' }, children),
    Gesture: { Tap: () => builder, Pan: () => builder, Race: () => builder },
  };
});

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock('@boardsesh/play-view', () => ({ computePeekOffset: () => 0 }));

type TextMockProps = {
  children?: ReactNode;
  color?: string;
  style?: CSSProperties | Array<CSSProperties | undefined | false | null>;
};

function readColor(props: TextMockProps): string {
  if (props.color != null) return props.color;
  const styles = Array.isArray(props.style) ? props.style : [props.style];
  for (let styleIndex = styles.length - 1; styleIndex >= 0; styleIndex -= 1) {
    const styleEntry = styles[styleIndex];
    if (styleEntry && typeof styleEntry === 'object' && 'color' in styleEntry && styleEntry.color != null) {
      return String((styleEntry as { color: unknown }).color);
    }
  }
  return '';
}

vi.mock('../../Text', () => ({
  Text: (props: TextMockProps) =>
    createElement('span', { 'data-text': 'true', 'data-color': readColor(props) }, props.children),
}));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: { label: '#111111' },
  }),
}));

vi.mock('../../../providers/queue-provider', () => ({
  useQueue: () => ({
    state: queue.state,
    nextClimb: queue.nextClimb,
    previousClimb: queue.previousClimb,
  }),
}));

vi.mock('../../../providers/drawer-host-provider', () => ({
  useDrawerHost: () => ({ boardConfig: drawer.boardConfig, openPlayDrawer: drawer.openPlayDrawer }),
}));

vi.mock('../../../hooks/use-grade-format', () => ({
  useGradeFormat: () => ({ formatGrade: (difficulty: string | null | undefined) => difficulty }),
}));

vi.mock('../../../hooks/use-reduce-motion', () => ({ useReduceMotion: () => false }));

vi.mock('../../../lib/haptics', () => ({ hapticLight: vi.fn(), hapticSelection: vi.fn() }));

vi.mock('../../../theme/tokens', () => ({
  spacing: { 1: 4, 2: 8, 3: 12, 10: 40 },
  borderRadius: { md: 8 },
}));

vi.mock('../../../theme/layout', () => ({
  glassSize: { standard: 56, inline: 44 },
}));

vi.mock('../../../lib/board-details', () => ({
  getBoardRenderData: () => ({
    boardWidth: 1080,
    boardHeight: 1920,
    imageUrls: ['https://example.test/board.webp'],
    holdsData: [],
  }),
}));

vi.mock('../../board-renderer/BoardRenderer', () => ({
  BoardRenderer: ({ frames, fillContainer }: { frames: string; fillContainer?: boolean }) =>
    createElement('div', {
      'data-thumbnail': frames,
      'data-fill-container': fillContainer ? 'true' : 'false',
    }),
}));

vi.mock('../../play-drawer/use-carousel-gesture', () => ({
  useCarouselGesture: () => ({ gesture: {}, translateX: { value: 0 } }),
}));

vi.mock('../LogAscentToolbarButton', () => ({
  LogAscentToolbarButton: ({ size, iconSize }: { size?: number; iconSize?: number }) =>
    createElement('button', {
      'data-tick': 'true',
      'data-tick-size': String(size),
      'data-icon-size': String(iconSize),
    }),
}));

import { NativeAccessoryClimbRow } from '../NativeAccessoryClimbRow';

function makeClimb(overrides: Partial<Climb> = {}): Climb {
  return {
    uuid: 'climb-1',
    setter_username: 'setter',
    name: "Alvin's Nuts",
    frames: 'p1r12',
    angle: 40,
    ascensionist_count: 8,
    difficulty: 'V6',
    quality_average: '3',
    stars: 3,
    difficulty_error: '0',
    benchmark_difficulty: null,
    ...overrides,
  };
}

function makeItem(climb: Climb): ClimbQueueItem {
  return { uuid: climb.uuid, climb };
}

function makeBoardConfig(): BoardConfig {
  return { boardName: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,20', angle: 40 };
}

describe('NativeAccessoryClimbRow', () => {
  beforeEach(() => {
    const currentItem = makeItem(makeClimb());
    queue.state.currentClimbQueueItem = currentItem;
    queue.state.queue = [currentItem];
    drawer.boardConfig = makeBoardConfig();
    queue.nextClimb.mockClear();
    queue.previousClimb.mockClear();
    drawer.openPlayDrawer.mockClear();
  });

  it('renders a regular now-climbing row with thumbnail, grade, and integrated tick', () => {
    const { container } = render(<NativeAccessoryClimbRow placement="regular" width={344} />);

    expect(container.textContent).toContain("Alvin's Nuts");
    expect(container.textContent).toContain('V6');
    expect(container.querySelector('[data-thumbnail="p1r12"]')).not.toBeNull();
    expect(container.querySelector('[data-fill-container="true"]')).not.toBeNull();
    expect(container.querySelector('[data-tick-size="44"]')).not.toBeNull();
    expect(container.querySelector('[data-icon-size="24"]')).not.toBeNull();
    expect(container.querySelector('[data-height="56"]')).not.toBeNull();
    expect(container.querySelector('[data-height="40"]')).not.toBeNull();
    expect(container.querySelector('[data-height="28"]')).not.toBeNull();
    expect(container.querySelector('[data-padding-right="12"]')).not.toBeNull();
    const gradeText = Array.from(container.querySelectorAll('[data-text]')).find(
      (textNode) => textNode.textContent === 'V6',
    );
    expect(gradeText?.getAttribute('data-color')).toBe('#111111');
  });

  it('keeps the thumbnail out of inline placement', () => {
    const { container } = render(<NativeAccessoryClimbRow placement="inline" width={344} />);

    expect(container.textContent).toContain("Alvin's Nuts");
    expect(container.querySelector('[data-thumbnail]')).toBeNull();
    expect(container.querySelector('[data-tick-size="44"]')).not.toBeNull();
    expect(container.querySelector('[data-height="44"]')).not.toBeNull();
  });

  it('omits the thumbnail when board config is unavailable', () => {
    drawer.boardConfig = null;
    const { container } = render(<NativeAccessoryClimbRow placement="regular" width={344} />);

    expect(container.textContent).toContain("Alvin's Nuts");
    expect(container.querySelector('[data-thumbnail]')).toBeNull();
    expect(container.querySelector('[data-tick-size="44"]')).not.toBeNull();
  });

  it('keeps the tick outside the climb gesture target', () => {
    const { container } = render(<NativeAccessoryClimbRow placement="regular" width={344} />);
    const tick = container.querySelector('[data-tick="true"]');

    expect(tick).not.toBeNull();
    expect(tick?.closest('[data-gesture="true"]')).toBeNull();
  });
});
