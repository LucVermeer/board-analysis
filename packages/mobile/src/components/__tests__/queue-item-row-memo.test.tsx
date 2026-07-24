// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement, useRef, type ReactNode } from 'react';
import type { ClimbQueueItem } from '@boardsesh/queue';
import type { QueueItemRowBoard } from '../QueueItemRow';
import type { QueueDragControls } from '../play-drawer/use-queue-drag';

// Count how many times the inner component body actually renders. The body
// renders `ClimbListItemContent` once per render, so a render counter there is a
// faithful proxy for "QueueItemRow's body ran". If React.memo is working, an
// identical-props re-render must NOT bump this counter.
const renderCounter = vi.hoisted(() => ({ count: 0 }));

// Capture the latest callback handed to the row's tap gesture, long-press gesture,
// trailing tick button, and delete button so a test can assert identity across
// re-renders. `rowPress`/`longPress` come from `Gesture.Tap()`/`Gesture.LongPress()`'s
// `.onStart(...)` (the row moved off RN core Pressable's onPress/onLongPress onto RNGH
// gestures — see QueueItemRow.tsx). `tapRef`/`longPressRef` capture the `.withRef(...)`
// arguments so a test can confirm the drag handle's Pan blocks exactly those refs.
const captured = vi.hoisted(() => ({
  rowPress: null as null | (() => void),
  longPress: null as null | (() => void),
  tickPress: null as null | (() => void),
  deletePress: null as null | (() => void),
  tapRef: null as unknown,
  longPressRef: null as unknown,
}));

// Per-instance call logs for gestures created via the RNGH mock below, keyed by
// factory. One array is pushed per `Gesture.Pan()`/`Gesture.Tap()`/`Gesture.LongPress()`
// call, in creation order — lets a test inspect exactly what was chained onto a
// specific gesture (e.g. "the swipe Pan never gets an exclusivity relationship wired
// onto it by a future edit").
const gestureCalls = vi.hoisted(() => ({
  panLogs: [] as { method: string; args: unknown[] }[][],
  tapLogs: [] as { method: string; args: unknown[] }[][],
  longPressLogs: [] as { method: string; args: unknown[] }[][],
}));

vi.mock('react-native', () => {
  const passthrough =
    (tag: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement(tag, null, children);
  return {
    Platform: { OS: 'ios' },
    PlatformColor: (name: string) => name,
    View: passthrough('div'),
    // Capture by testID so any future Pressable addition doesn't silently
    // overwrite the wrong slot.
    Pressable: ({ children, onPress, testID }: { children?: ReactNode; onPress?: () => void; testID?: string }) => {
      if (testID === 'tick-button' && onPress) captured.tickPress = onPress;
      if (testID === 'delete-button' && onPress) captured.deletePress = onPress;
      return createElement('button', null, children);
    },
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
      hairlineWidth: 1,
    },
  };
});

vi.mock('react-native-reanimated', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    default: { View: passthrough },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    // Real reanimated returns a stable ref across renders; mirror that so the
    // callback-stability test reflects production behaviour (a fresh object each
    // render would churn every callback that reads a shared value).
    useSharedValue: (initial: unknown) => {
      const ref = useRef({ value: initial });
      return ref.current;
    },
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    runOnJS:
      (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args),
  };
});

vi.mock('react-native-gesture-handler', () => {
  // A chainable gesture builder: every method call is logged into `log` (so a test
  // can inspect exactly what was configured) and, when given, `onCapture` also gets
  // a chance to stash a specific call's argument (e.g. the `.onStart` callback or a
  // `.withRef` ref) into the shared `captured` bag. Every method returns the same
  // proxy so chains like `.minDuration(400).onStart(fn)` resolve.
  const makeBuilder = (
    log: { method: string; args: unknown[] }[],
    onCapture?: (method: string, arg: unknown) => void,
  ) => {
    const builder: Record<string, (...args: unknown[]) => unknown> = {};
    const proxy: typeof builder = new Proxy(builder, {
      get:
        (_target, prop: string) =>
        (...args: unknown[]) => {
          log.push({ method: prop, args });
          onCapture?.(prop, args[0]);
          return proxy;
        },
    });
    return proxy;
  };

  return {
    GestureDetector: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    Gesture: {
      Pan: () => {
        const log: { method: string; args: unknown[] }[] = [];
        gestureCalls.panLogs.push(log);
        return makeBuilder(log);
      },
      Tap: () => {
        const log: { method: string; args: unknown[] }[] = [];
        gestureCalls.tapLogs.push(log);
        return makeBuilder(log, (method, arg) => {
          if (method === 'onStart' && typeof arg === 'function') captured.rowPress = arg as () => void;
          if (method === 'withRef') captured.tapRef = arg;
        });
      },
      LongPress: () => {
        const log: { method: string; args: unknown[] }[] = [];
        gestureCalls.longPressLogs.push(log);
        return makeBuilder(log, (method, arg) => {
          if (method === 'onStart' && typeof arg === 'function') captured.longPress = arg as () => void;
          if (method === 'withRef') captured.longPressRef = arg;
        });
      },
      // The composed tap/long-press gesture — nothing is chained onto it directly,
      // it's just handed to <GestureDetector>, so no call-logging needed here.
      Exclusive: () => ({}),
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../providers/theme-provider', () => ({
  useTheme: () => ({
    systemColors: { secondaryBackground: '#fff', separator: '#ccc' },
    brandColors: { primary: '#6D28D9', success: '#0a0', error: '#a00' },
  }),
}));

vi.mock('../../lib/haptics', () => ({ hapticSelection: vi.fn(), hapticMedium: vi.fn() }));

vi.mock('../Text', () => ({
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../Icon', () => ({
  Icon: () => createElement('span', { 'data-icon': 'true' }),
}));

vi.mock('../ClimbListItemContent', () => ({
  ClimbListItemContent: ({ climb }: { climb?: { name?: string } }) => {
    renderCounter.count += 1;
    return createElement('span', { 'data-climb-name': climb?.name ?? '' });
  },
}));

vi.mock('../ClimbListThumbnail', () => ({ THUMBNAIL_WIDTH: 96 }));

vi.mock('../../theme/tokens', () => ({ spacing: { 1: 4, 2: 8, 3: 12 } }));

vi.mock('../../theme/animations', () => ({ springs: { interactive: {} } }));

vi.mock('../play-drawer/queue-drag-math', () => ({ rowReorderShift: () => 0 }));

import { QueueItemRow } from '../QueueItemRow';

const board: QueueItemRowBoard = {
  boardName: 'kilter',
  layoutId: 1,
  sizeId: 10,
  setIds: '1,2',
  angle: 40,
};

function makeItem(uuid: string, name: string): ClimbQueueItem {
  return {
    uuid,
    climb: { uuid: `climb-${uuid}`, name } as ClimbQueueItem['climb'],
    addedBy: null,
    source: null,
  } as ClimbQueueItem;
}

// Stable callbacks — the production callers (QueueSheet / drawer-host) pass
// useCallback/useMemo-stable handlers, so the memo compare sees equal props.
const onPress = vi.fn();
const onRemove = vi.fn();
const onToggleSelect = vi.fn();

describe('QueueItemRow React.memo', () => {
  beforeEach(() => {
    renderCounter.count = 0;
    captured.rowPress = null;
    captured.longPress = null;
    captured.tickPress = null;
    captured.deletePress = null;
    captured.tapRef = null;
    captured.longPressRef = null;
    gestureCalls.panLogs = [];
    gestureCalls.tapLogs = [];
    gestureCalls.longPressLogs = [];
    vi.clearAllMocks();
  });

  it('skips re-render when given referentially-equal props', () => {
    const item = makeItem('a', 'Crimp Master');
    const element = (
      <QueueItemRow
        item={item}
        position={1}
        board={board}
        isCurrentClimb={false}
        onPress={onPress}
        onRemove={onRemove}
        onToggleSelect={onToggleSelect}
      />
    );

    const { rerender } = render(element);
    expect(renderCounter.count).toBe(1);

    // Re-render the SAME element (identical props). A working memo skips the body.
    rerender(element);
    expect(renderCounter.count).toBe(1);
  });

  it('re-renders when a prop actually changes (selection toggles)', () => {
    const item = makeItem('a', 'Crimp Master');
    const { rerender } = render(
      <QueueItemRow
        item={item}
        position={1}
        board={board}
        isCurrentClimb={false}
        isEditMode
        isSelected={false}
        onPress={onPress}
        onRemove={onRemove}
        onToggleSelect={onToggleSelect}
      />,
    );
    expect(renderCounter.count).toBe(1);

    rerender(
      <QueueItemRow
        item={item}
        position={1}
        board={board}
        isCurrentClimb={false}
        isEditMode
        isSelected
        onPress={onPress}
        onRemove={onRemove}
        onToggleSelect={onToggleSelect}
      />,
    );
    expect(renderCounter.count).toBe(2);
  });

  it('keeps press callbacks stable when item identity changes but its data is equal', () => {
    const onTickHistory = vi.fn();
    const onOpenActions = vi.fn();
    const rowProps = {
      position: 1,
      board,
      isCurrentClimb: false,
      isHistoryItem: true,
      onPress,
      onRemove,
      onToggleSelect,
      onTickHistory,
      onOpenActions,
    };

    const first = makeItem('a', 'Crimp Master');
    const { rerender } = render(<QueueItemRow item={first} {...rowProps} />);

    const rowPress = captured.rowPress;
    const longPress = captured.longPress;
    const tickPress = captured.tickPress;
    expect(rowPress).toBeTypeOf('function');
    expect(longPress).toBeTypeOf('function');
    expect(tickPress).toBeTypeOf('function');

    // A fresh item object with the same uuid + data — exactly what the queue
    // reducer produces when it rebuilds the array on an unrelated update. The
    // callbacks must keep their identity (they read the live item via a ref and
    // dep only on `item.uuid`), or the row's gestures/pressables churn and defeat
    // memo. `longPress` sits in the same dep chain as `tapGesture`
    // (handleLongPress → longPressGesture → tapGesture), so an unstable
    // `longPressGesture` would churn the row's gesture composition just as surely
    // as an unstable tap.
    const second = makeItem('a', 'Crimp Master');
    expect(second).not.toBe(first);
    rerender(<QueueItemRow item={second} {...rowProps} />);

    expect(captured.rowPress).toBe(rowPress);
    expect(captured.longPress).toBe(longPress);
    expect(captured.tickPress).toBe(tickPress);
  });

  it('keeps handleDeletePress stable when item identity changes but its data is equal', () => {
    const rowProps = {
      position: 1,
      board,
      isCurrentClimb: false,
      onPress,
      onRemove,
      onToggleSelect,
    };

    const first = makeItem('a', 'Crimp Master');
    const { rerender } = render(<QueueItemRow item={first} {...rowProps} />);

    const deletePress = captured.deletePress;
    expect(deletePress).toBeTypeOf('function');

    // A fresh item object with the same uuid — same case as the tick-press test.
    const second = makeItem('a', 'Crimp Master');
    expect(second).not.toBe(first);
    rerender(<QueueItemRow item={second} {...rowProps} />);

    expect(captured.deletePress).toBe(deletePress);
  });

  // Regression guard for #3683: the drag handle used to sit inside a plain RN
  // Pressable that grew an onLongPress, and on iOS the Pressable's long-press could
  // win the race against the nested handle's Pan, opening the reaction menu instead
  // of letting the drag start. The fix makes the row's tap/long-press RNGH gestures
  // and has the drag handle's Pan `blocksExternalGesture` them, so a touch that
  // starts on the handle is claimed by the drag and never reaches the row gestures.
  it('wires the drag handle to block the row tap/long-press gestures', () => {
    const handleGestureCalls: { method: string; args: unknown[] }[] = [];
    const handleGesture: Record<string, (...args: unknown[]) => unknown> = {};
    const handleGestureProxy = new Proxy(handleGesture, {
      get:
        (_target, prop: string) =>
        (...args: unknown[]) => {
          handleGestureCalls.push({ method: prop, args });
          return handleGestureProxy;
        },
    });

    const dragShared: QueueDragControls['shared'] = {
      activeUuid: { value: null },
      dragTranslateY: { value: 0 },
      activeRowIndex: { value: -1 },
      targetRowIndex: { value: -1 },
      rowHeight: { value: 120 },
    } as unknown as QueueDragControls['shared'];

    const makeHandleGesture = vi.fn(
      () => handleGestureProxy as unknown as ReturnType<QueueDragControls['makeHandleGesture']>,
    );
    const drag: QueueDragControls = {
      shared: dragShared,
      onRowHeight: vi.fn(),
      makeHandleGesture,
    };

    const item = makeItem('a', 'Crimp Master');
    render(
      <QueueItemRow
        item={item}
        position={1}
        board={board}
        isCurrentClimb={false}
        onPress={onPress}
        onRemove={onRemove}
        onToggleSelect={onToggleSelect}
        drag={drag}
        isDraggable
        rowIndex={0}
        queueIndex={0}
      />,
    );

    expect(makeHandleGesture).toHaveBeenCalledWith(0, 'a', 0);
    expect(captured.tapRef).not.toBeNull();
    expect(captured.longPressRef).not.toBeNull();

    const blocksCall = handleGestureCalls.find((call) => call.method === 'blocksExternalGesture');
    expect(blocksCall).toBeDefined();
    expect(blocksCall?.args).toEqual([captured.tapRef, captured.longPressRef]);
  });

  // Regression guard for the swipe-to-delete side of #3683: this fix moved the row's
  // press/long-press off RN core Pressable onto RNGH gestures living in the same
  // arena as the pre-existing swipe Pan. The swipe Pan must stay a plain,
  // movement-gated gesture — no exclusivity/blocking relationship wired onto it —
  // so a future edit doesn't accidentally couple it to the new tap/long-press
  // gestures and break either swipe-to-delete or tap-to-navigate. (The real
  // cross-gesture arbitration only exists in the native runtime and isn't something
  // this jsdom-level mock can exercise — see the iOS QA matrix in the PR body.)
  it('keeps the swipe-to-delete Pan gesture free of any exclusivity/blocking wiring', () => {
    const item = makeItem('a', 'Crimp Master');
    render(
      <QueueItemRow
        item={item}
        position={1}
        board={board}
        isCurrentClimb={false}
        onPress={onPress}
        onRemove={onRemove}
        onToggleSelect={onToggleSelect}
      />,
    );

    // No `drag` prop, so the only Gesture.Pan() created is the row's swipe gesture.
    expect(gestureCalls.panLogs).toHaveLength(1);
    const swipeCalls = gestureCalls.panLogs[0].map((call) => call.method);
    expect(swipeCalls).toEqual(
      expect.arrayContaining(['enabled', 'activeOffsetX', 'failOffsetY', 'onUpdate', 'onEnd']),
    );
    expect(swipeCalls).not.toContain('blocksExternalGesture');
    expect(swipeCalls).not.toContain('requireExternalGestureToFail');
    expect(swipeCalls).not.toContain('simultaneousWithExternalGesture');

    // The row's tap/long-press gestures themselves also stay free of any wiring
    // toward the swipe Pan — only the drag handle blocks them (see the test above).
    expect(gestureCalls.tapLogs).toHaveLength(1);
    expect(gestureCalls.tapLogs[0].map((call) => call.method)).not.toContain('blocksExternalGesture');
    expect(gestureCalls.longPressLogs).toHaveLength(1);
    expect(gestureCalls.longPressLogs[0].map((call) => call.method)).not.toContain('blocksExternalGesture');
  });

  // Regression guard for #3295: the swipe-to-remove Pan bailed on a ±5px vertical
  // wobble (`.failOffsetY([-5, 5])`) before its ±10px horizontal activation, so a
  // natural horizontal swipe failed the Pan and the row's tap fell through and just
  // selected the climb instead of revealing Delete. The Y bail must stay wider than
  // the X activation so the swipe survives normal wobble (mirrors SwipeableRow,
  // extracted from this component, which already widened this exact value). The real
  // cross-gesture arbitration only exists in the native runtime — see the on-device
  // QA matrix in the PR body — but the threshold itself is guarded here.
  it('gives the swipe-to-remove Pan a vertical bail wide enough to survive swipe wobble', () => {
    const item = makeItem('a', 'Crimp Master');
    render(
      <QueueItemRow
        item={item}
        position={1}
        board={board}
        isCurrentClimb={false}
        onPress={onPress}
        onRemove={onRemove}
        onToggleSelect={onToggleSelect}
      />,
    );

    // No `drag` prop, so the only Gesture.Pan() created is the row's swipe gesture.
    expect(gestureCalls.panLogs).toHaveLength(1);
    const swipeCalls = gestureCalls.panLogs[0];

    const activeOffsetX = swipeCalls.find((call) => call.method === 'activeOffsetX');
    const failOffsetY = swipeCalls.find((call) => call.method === 'failOffsetY');
    expect(activeOffsetX?.args).toEqual([[-10, 10]]);
    expect(failOffsetY?.args).toEqual([[-14, 14]]);
  });
});
