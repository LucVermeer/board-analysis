// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { LiveActivityBridge } from '../live-activity-bridge';

type QueueNavigateEvent = {
  action: 'next' | 'previous';
  currentIndex: number;
  correlationId: string;
};

function makeItem(index: number): ClimbQueueItem {
  return {
    uuid: `queue-item-${index}`,
    climb: { uuid: `climb-${index}` },
  } as unknown as ClimbQueueItem;
}

const queue = vi.hoisted(() => ({
  sessionId: 'session-1' as string | null,
  dispatchWidgetNavigation: vi.fn(),
  state: {
    queue: [] as ClimbQueueItem[],
    currentClimbQueueItem: null as ClimbQueueItem | null,
  },
}));

const widget = vi.hoisted(() => ({
  listener: null as null | ((event: QueueNavigateEvent) => void),
  useLiveActivity: vi.fn(),
}));

const boardState = vi.hoisted(() => ({
  boardConnection: 'connectedByMe' as 'connectedByMe' | 'heldByPeer' | 'disconnected',
  holderDisplayName: null as string | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../providers/queue-provider', () => ({
  useQueue: () => ({
    state: queue.state,
    sessionId: queue.sessionId,
    dispatchWidgetNavigation: queue.dispatchWidgetNavigation,
  }),
}));

vi.mock('../../../components/ble/use-board-connection-state', () => ({
  useBoardConnectionState: () => ({
    bluetooth: null,
    localConnected: boardState.boardConnection === 'connectedByMe',
    pending: false,
    sessionId: queue.sessionId,
    boardConnection: boardState.boardConnection,
    lit: boardState.boardConnection !== 'disconnected',
    holderDisplayName: boardState.holderDisplayName,
  }),
}));

vi.mock('../use-live-activity', () => ({
  useLiveActivity: (args: unknown) => widget.useLiveActivity(args),
}));

vi.mock('../live-activity-plugin', () => ({
  addWidgetQueueNavigateListener: (listener: (event: QueueNavigateEvent) => void) => {
    widget.listener = listener;
    return () => {
      widget.listener = null;
    };
  },
}));

const climbItem = makeItem(0);

function renderBridge() {
  return render(<LiveActivityBridge boardName="kilter" layoutId={1} sizeId={10} setIds="1,2" />);
}

describe('LiveActivityBridge widget navigation (always-live)', () => {
  const threeItemQueue = [makeItem(0), makeItem(1), makeItem(2)];

  beforeEach(() => {
    queue.sessionId = 'session-1';
    queue.state = { queue: threeItemQueue, currentClimbQueueItem: threeItemQueue[0] };
    queue.dispatchWidgetNavigation.mockClear();
    widget.listener = null;
    widget.useLiveActivity.mockClear();
    boardState.boardConnection = 'connectedByMe';
    boardState.holderDisplayName = null;
  });

  it('passes connectedByMe + enables widget navigation when this device holds the board', () => {
    renderBridge();

    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        boardConnection: 'connectedByMe',
        widgetNavigationAllowed: true,
        holderDisplayName: null,
      }),
    );
  });

  it('hides widget navigation (and surfaces the holder) once a peer takes the board', () => {
    boardState.boardConnection = 'heldByPeer';
    boardState.holderDisplayName = 'Alex';
    renderBridge();

    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        boardConnection: 'heldByPeer',
        widgetNavigationAllowed: false,
        holderDisplayName: 'Alex',
      }),
    );
  });

  it('hides widget navigation when nobody is driving the board', () => {
    boardState.boardConnection = 'disconnected';
    renderBridge();

    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        boardConnection: 'disconnected',
        widgetNavigationAllowed: false,
      }),
    );
  });

  it('navigates to the absolute index the widget reports (not a relative step)', () => {
    renderBridge();

    act(() => {
      widget.listener?.({ action: 'next', currentIndex: 1, correlationId: 'widget-navigate' });
    });

    // Maps currentIndex → queue[currentIndex] and forwards the correlationId so
    // the racing CurrentClimbChanged echo is suppressed by the reducer.
    expect(queue.dispatchWidgetNavigation).toHaveBeenCalledTimes(1);
    expect(queue.dispatchWidgetNavigation).toHaveBeenCalledWith(threeItemQueue[1], 'widget-navigate');
  });

  it('does not double-advance: a single tap dispatches exactly one absolute move', () => {
    renderBridge();

    act(() => {
      widget.listener?.({ action: 'previous', currentIndex: 0, correlationId: 'widget-navigate' });
    });

    expect(queue.dispatchWidgetNavigation).toHaveBeenCalledTimes(1);
    expect(queue.dispatchWidgetNavigation).toHaveBeenCalledWith(threeItemQueue[0], 'widget-navigate');
  });

  it('ignores out-of-range indices instead of wrapping or crashing', () => {
    renderBridge();

    act(() => {
      widget.listener?.({ action: 'next', currentIndex: 99, correlationId: 'widget-navigate' });
      widget.listener?.({ action: 'previous', currentIndex: -1, correlationId: 'widget-navigate' });
    });

    expect(queue.dispatchWidgetNavigation).not.toHaveBeenCalled();
  });

  it('always allows widget navigation in a party session (no driver gate)', () => {
    renderBridge();

    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetNavigationAllowed: true,
        isPartySession: true,
      }),
    );
  });

  it('allows widget navigation outside sessions', () => {
    queue.sessionId = null;
    renderBridge();

    act(() => {
      widget.listener?.({ action: 'next', currentIndex: 1, correlationId: 'widget-navigate' });
    });

    expect(queue.dispatchWidgetNavigation).toHaveBeenCalledWith(threeItemQueue[1], 'widget-navigate');
    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetNavigationAllowed: true,
        isPartySession: false,
      }),
    );
  });
});

describe('LiveActivityBridge session-presence gating', () => {
  beforeEach(() => {
    queue.sessionId = 'session-1';
    queue.state = { queue: [], currentClimbQueueItem: null };
    widget.useLiveActivity.mockClear();
    boardState.boardConnection = 'connectedByMe';
    boardState.holderDisplayName = null;
  });

  it('keeps a solo queue (no session) out of session presence', () => {
    queue.sessionId = null;
    queue.state = { queue: [climbItem], currentClimbQueueItem: climbItem };
    renderBridge();

    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        isSessionActive: false,
      }),
    );
  });

  it('marks an explicit session active even before any climb is queued', () => {
    renderBridge();

    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        isSessionActive: true,
      }),
    );
  });
});
