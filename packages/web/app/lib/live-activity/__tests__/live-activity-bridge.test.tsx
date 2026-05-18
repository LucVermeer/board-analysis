import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import React, { act } from 'react';
import type { ClimbQueueItem } from '@/app/components/queue-control/types';
import type { BoardDetails } from '../../types';

// Pretend we're on iOS native so the bridge attaches its plugin listener.
const mockIsNativeApp = vi.fn(() => true);
const mockGetPlatform = vi.fn<() => 'ios' | 'android' | 'web'>(() => 'ios');

vi.mock('../../ble/capacitor-utils', () => ({
  isNativeApp: () => mockIsNativeApp(),
  getPlatform: () => mockGetPlatform(),
}));

// useLiveActivity is unused by these tests but the bridge imports it; stub
// the plugin shims so it doesn't try to talk to the real Capacitor bridge.
vi.mock('../live-activity-plugin', () => ({
  isLiveActivityAvailable: () => Promise.resolve(false),
  startLiveActivitySession: () => Promise.resolve(),
  endLiveActivitySession: () => Promise.resolve(),
  updateLiveActivity: () => Promise.resolve(),
  updateLiveActivityClimb: () => Promise.resolve(),
}));

vi.mock('@/app/hooks/use-ws-auth-token', () => ({
  useWsAuthToken: () => ({ token: null, isAuthenticated: false, isLoading: false, error: null }),
}));

vi.mock('../../backend-url', () => ({
  getBackendWsUrl: () => 'ws://localhost:8080/graphql',
  getGraphQLHttpUrl: () => 'http://localhost:8080/graphql',
}));

// Capture the listener the bridge registers so each test can fire it directly.
let registeredQueueNavigateHandler: ((data: Record<string, unknown>) => void) | null = null;
const removeListenerSpy = vi.fn();

beforeEach(() => {
  registeredQueueNavigateHandler = null;
  removeListenerSpy.mockClear();

  const mockPlugin = {
    addListener: vi.fn((event: string, handler: (data: Record<string, unknown>) => void) => {
      if (event === 'queueNavigate') registeredQueueNavigateHandler = handler;
      return { remove: removeListenerSpy };
    }),
  };

  (window as unknown as { Capacitor: unknown }).Capacitor = {
    Plugins: { LiveActivity: mockPlugin },
  };
});

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

// Import after mocks
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import after mock setup
const { default: LiveActivityBridge } = await import('../live-activity-bridge');

function makeQueueItem(id: string): ClimbQueueItem {
  return {
    uuid: id,
    climb: {
      uuid: `climb-${id}`,
      name: `Climb ${id}`,
      difficulty: 'V4',
      frames: 'p1r12',
      angle: 40,
      setter_username: 'tester',
      ascensionist_count: 1,
      quality_average: '3',
      stars: 3,
      difficulty_error: '0',
      benchmark_difficulty: null,
      mirrored: false,
    },
  };
}

function makeBoardDetails(): BoardDetails {
  return {
    images_to_holds: {},
    holdsData: {},
    edge_left: 0,
    edge_right: 100,
    edge_bottom: 0,
    edge_top: 100,
    boardHeight: 100,
    boardWidth: 100,
    board_name: 'kilter',
    layout_id: 1,
    size_id: 1,
    set_ids: [1, 2],
  } as BoardDetails;
}

type BridgeProps = React.ComponentProps<typeof LiveActivityBridge>;

async function mountBridge(props: BridgeProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const ReactDOM = await import('react-dom/client');
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(React.createElement(LiveActivityBridge, props));
  });
  return {
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('LiveActivityBridge queueNavigate handler', () => {
  const queue = [makeQueueItem('a'), makeQueueItem('b'), makeQueueItem('c')];

  it('routes to onWidgetNavigate when correlationId and the handler are both present (on-board)', async () => {
    const onSetCurrentClimb = vi.fn();
    const onWidgetNavigate = vi.fn();

    const view = await mountBridge({
      queue,
      currentClimbQueueItem: queue[0],
      boardDetails: makeBoardDetails(),
      sessionId: 'session-1',
      isSessionActive: true,
      onSetCurrentClimb,
      onWidgetNavigate,
    });

    expect(registeredQueueNavigateHandler).not.toBeNull();
    registeredQueueNavigateHandler!({ currentIndex: 1, correlationId: 'widget-navigate' });

    expect(onWidgetNavigate).toHaveBeenCalledTimes(1);
    expect(onWidgetNavigate).toHaveBeenCalledWith(queue[1], 'widget-navigate');
    expect(onSetCurrentClimb).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('falls back to onSetCurrentClimb when onWidgetNavigate is undefined (off-board adapter mode)', async () => {
    const onSetCurrentClimb = vi.fn();

    const view = await mountBridge({
      queue,
      currentClimbQueueItem: queue[0],
      boardDetails: makeBoardDetails(),
      sessionId: 'session-1',
      isSessionActive: true,
      onSetCurrentClimb,
      // No onWidgetNavigate — simulates adapter mode where the off-board
      // QueueBridge doesn't inject the optimistic dispatcher.
    });

    registeredQueueNavigateHandler!({ currentIndex: 2, correlationId: 'widget-navigate' });

    expect(onSetCurrentClimb).toHaveBeenCalledTimes(1);
    expect(onSetCurrentClimb).toHaveBeenCalledWith(queue[2]);

    await view.unmount();
  });

  it('falls back to onSetCurrentClimb when no correlationId is supplied (legacy intent path)', async () => {
    const onSetCurrentClimb = vi.fn();
    const onWidgetNavigate = vi.fn();

    const view = await mountBridge({
      queue,
      currentClimbQueueItem: queue[0],
      boardDetails: makeBoardDetails(),
      sessionId: 'session-1',
      isSessionActive: true,
      onSetCurrentClimb,
      onWidgetNavigate,
    });

    registeredQueueNavigateHandler!({ currentIndex: 1 });

    expect(onSetCurrentClimb).toHaveBeenCalledTimes(1);
    expect(onSetCurrentClimb).toHaveBeenCalledWith(queue[1]);
    expect(onWidgetNavigate).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('ignores out-of-bounds currentIndex values', async () => {
    const onSetCurrentClimb = vi.fn();
    const onWidgetNavigate = vi.fn();

    const view = await mountBridge({
      queue,
      currentClimbQueueItem: queue[0],
      boardDetails: makeBoardDetails(),
      sessionId: 'session-1',
      isSessionActive: true,
      onSetCurrentClimb,
      onWidgetNavigate,
    });

    registeredQueueNavigateHandler!({ currentIndex: 99, correlationId: 'widget-navigate' });
    registeredQueueNavigateHandler!({ currentIndex: -1, correlationId: 'widget-navigate' });

    expect(onWidgetNavigate).not.toHaveBeenCalled();
    expect(onSetCurrentClimb).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('uses the latest queue snapshot when the listener fires after a queue update', async () => {
    const onWidgetNavigate = vi.fn();

    const view = await mountBridge({
      queue,
      currentClimbQueueItem: queue[0],
      boardDetails: makeBoardDetails(),
      sessionId: 'session-1',
      isSessionActive: true,
      onWidgetNavigate,
    });

    // Re-render with a different queue ordering; ref should track latest.
    const ReactDOM = await import('react-dom/client');
    const container = document.querySelector('div')!;
    const root = ReactDOM.createRoot(container);
    const newQueue = [queue[2], queue[0], queue[1]];
    await act(async () => {
      root.render(
        React.createElement(LiveActivityBridge, {
          queue: newQueue,
          currentClimbQueueItem: newQueue[0],
          boardDetails: makeBoardDetails(),
          sessionId: 'session-1',
          isSessionActive: true,
          onWidgetNavigate,
        }),
      );
    });

    registeredQueueNavigateHandler!({ currentIndex: 1, correlationId: 'widget-navigate' });
    expect(onWidgetNavigate).toHaveBeenCalledWith(newQueue[1], 'widget-navigate');

    await view.unmount();
  });
});
