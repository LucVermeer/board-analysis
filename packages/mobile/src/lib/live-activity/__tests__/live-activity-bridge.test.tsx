// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { LiveActivityBridge } from '../live-activity-bridge';

const queue = vi.hoisted(() => ({
  sessionId: 'session-1' as string | null,
  driverParticipantId: 'participant-other' as string | null,
  participantId: 'participant-self' as string | null,
  nextClimb: vi.fn(),
  previousClimb: vi.fn(),
  state: {
    queue: [] as ClimbQueueItem[],
    currentClimbQueueItem: null as ClimbQueueItem | null,
  },
}));

const widget = vi.hoisted(() => ({
  listener: null as null | ((event: { action: 'next' | 'previous' }) => void),
  useLiveActivity: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../providers/queue-provider', () => ({
  useQueue: () => ({
    state: queue.state,
    sessionId: queue.sessionId,
    driverParticipantId: queue.driverParticipantId,
    participantId: queue.participantId,
    nextClimb: queue.nextClimb,
    previousClimb: queue.previousClimb,
  }),
}));

vi.mock('../use-live-activity', () => ({
  useLiveActivity: (args: unknown) => widget.useLiveActivity(args),
}));

vi.mock('../live-activity-plugin', () => ({
  addWidgetQueueNavigateListener: (listener: (event: { action: 'next' | 'previous' }) => void) => {
    widget.listener = listener;
    return () => {
      widget.listener = null;
    };
  },
}));

function renderBridge() {
  return render(<LiveActivityBridge boardName="kilter" layoutId={1} sizeId={10} setIds="1,2" />);
}

describe('LiveActivityBridge wall-control gating', () => {
  beforeEach(() => {
    queue.sessionId = 'session-1';
    queue.driverParticipantId = 'participant-other';
    queue.participantId = 'participant-self';
    queue.nextClimb.mockClear();
    queue.previousClimb.mockClear();
    widget.listener = null;
    widget.useLiveActivity.mockClear();
  });

  it('ignores widget navigation for party non-drivers', () => {
    renderBridge();

    act(() => {
      widget.listener?.({ action: 'next' });
      widget.listener?.({ action: 'previous' });
    });

    expect(queue.nextClimb).not.toHaveBeenCalled();
    expect(queue.previousClimb).not.toHaveBeenCalled();
    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetNavigationAllowed: false,
        isPartySession: true,
      }),
    );
  });

  it('allows widget navigation for the current party driver', () => {
    queue.driverParticipantId = 'participant-self';
    renderBridge();

    act(() => {
      widget.listener?.({ action: 'next' });
      widget.listener?.({ action: 'previous' });
    });

    expect(queue.nextClimb).toHaveBeenCalledOnce();
    expect(queue.previousClimb).toHaveBeenCalledOnce();
    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetNavigationAllowed: true,
        isPartySession: true,
      }),
    );
  });

  it('allows widget navigation outside party sessions', () => {
    queue.sessionId = null;
    queue.driverParticipantId = null;
    renderBridge();

    act(() => {
      widget.listener?.({ action: 'next' });
    });

    expect(queue.nextClimb).toHaveBeenCalledOnce();
    expect(widget.useLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetNavigationAllowed: true,
        isPartySession: false,
      }),
    );
  });
});
