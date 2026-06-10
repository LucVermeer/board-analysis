// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { LiveActivityBridge } from '../live-activity-bridge';

const queue = vi.hoisted(() => ({
  sessionId: 'session-1' as string | null,
  isPartyPreviewOnly: false,
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
    nextClimb: queue.nextClimb,
    previousClimb: queue.previousClimb,
  }),
  useIsPartyPreviewOnly: () => queue.isPartyPreviewOnly,
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

const climbItem = {
  uuid: 'queue-item-1',
  climb: { uuid: 'climb-1' },
} as unknown as ClimbQueueItem;

function renderBridge() {
  return render(<LiveActivityBridge boardName="kilter" layoutId={1} sizeId={10} setIds="1,2" />);
}

describe('LiveActivityBridge wall-control gating', () => {
  beforeEach(() => {
    queue.sessionId = 'session-1';
    queue.isPartyPreviewOnly = false;
    queue.state = { queue: [], currentClimbQueueItem: null };
    queue.nextClimb.mockClear();
    queue.previousClimb.mockClear();
    widget.listener = null;
    widget.useLiveActivity.mockClear();
  });

  it('ignores widget navigation when preview-only (party non-driver)', () => {
    queue.isPartyPreviewOnly = true;
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

  it('allows widget navigation when not preview-only (driver or solo occupant)', () => {
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

  it('allows widget navigation outside sessions', () => {
    queue.sessionId = null;
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

describe('LiveActivityBridge session-presence gating', () => {
  beforeEach(() => {
    queue.sessionId = 'session-1';
    queue.isPartyPreviewOnly = false;
    queue.state = { queue: [], currentClimbQueueItem: null };
    widget.useLiveActivity.mockClear();
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
