// @vitest-environment jsdom
import { render, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbQueueItem } from '@boardsesh/queue';

// The hook only touches Platform from react-native; the real entry throws under
// vitest's node/jsdom env (untransformed RN-native source), so stub it.
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

vi.mock('../../auth-store', () => ({
  getAuthToken: vi.fn().mockResolvedValue('token-123'),
}));

vi.mock('../../env', () => ({
  BACKEND_URL: 'https://backend.test',
  WEB_BASE_URL: 'https://web.test',
}));

const plugin = vi.hoisted(() => ({
  isLiveActivityAvailable: vi.fn(),
  startLiveActivitySession: vi.fn(),
  endLiveActivitySession: vi.fn(),
  updateLiveActivity: vi.fn(),
  updateLiveActivityClimb: vi.fn(),
}));

vi.mock('../live-activity-plugin', () => plugin);

import { useLiveActivity } from '../use-live-activity';

const queueItem = {
  uuid: 'queue-item-1',
  climb: {
    uuid: 'climb-1',
    name: 'Test Climb',
    difficulty: 'V4',
    angle: 40,
    frames: 'p1r1',
    setter_username: 'setter',
    mirrored: false,
  },
} as unknown as ClimbQueueItem;

type HookProps = Parameters<typeof useLiveActivity>[0];

function activeProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    queue: [queueItem],
    currentClimbQueueItem: queueItem,
    board: { boardName: 'kilter', layoutId: 1, sizeId: 10, setIds: '1,2' },
    sessionId: 'session-1',
    isSessionActive: true,
    widgetNavigationAllowed: true,
    isPartySession: false,
    ...overrides,
  };
}

function Harness(props: HookProps) {
  useLiveActivity(props);
  return null;
}

describe('useLiveActivity start-failure contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plugin.isLiveActivityAvailable.mockResolvedValue(true);
    plugin.updateLiveActivity.mockResolvedValue(undefined);
    plugin.updateLiveActivityClimb.mockResolvedValue(undefined);
    plugin.endLiveActivitySession.mockResolvedValue(undefined);
    // Quiet the expected "[LiveActivity] startSession failed" warning.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the initial update once the session starts', async () => {
    plugin.startLiveActivitySession.mockResolvedValue(undefined);

    render(<Harness {...activeProps()} />);

    await waitFor(() => expect(plugin.startLiveActivitySession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(plugin.updateLiveActivity).toHaveBeenCalledTimes(1));
    expect(plugin.updateLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ climbName: 'Test Climb', currentIndex: 0, totalClimbs: 1 }),
    );
  });

  it('does not leak updates when the session fails to start', async () => {
    // e.g. Android threw MissingBluetoothPermissionException — the native session
    // never activated, so the hook must not behave as if it did.
    plugin.startLiveActivitySession.mockRejectedValue(new Error('permission denied'));

    render(<Harness {...activeProps()} />);

    await waitFor(() => expect(plugin.startLiveActivitySession).toHaveBeenCalledTimes(1));
    // Let the rejection + any follow-on effects settle.
    await act(async () => {
      await Promise.resolve();
    });

    expect(plugin.updateLiveActivity).not.toHaveBeenCalled();
    expect(plugin.updateLiveActivityClimb).not.toHaveBeenCalled();
  });

  it('retries the start on a later activation after a failure', async () => {
    plugin.startLiveActivitySession.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValue(undefined);

    const { rerender } = render(<Harness {...activeProps()} />);
    await waitFor(() => expect(plugin.startLiveActivitySession).toHaveBeenCalledTimes(1));

    // Session deactivates, then activates again — the hook should attempt a fresh
    // start rather than stay stuck after the earlier failure.
    rerender(<Harness {...activeProps({ isSessionActive: false })} />);
    await act(async () => {
      await Promise.resolve();
    });
    rerender(<Harness {...activeProps()} />);

    await waitFor(() => expect(plugin.startLiveActivitySession).toHaveBeenCalledTimes(2));
  });
});
