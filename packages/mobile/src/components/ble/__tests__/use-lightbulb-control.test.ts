// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { BoardPresenceCurrentContext, type BoardPresenceCurrentState } from '@boardsesh/board-presence-react';

type BluetoothCtx = {
  isConnected: boolean;
  loading: boolean;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  armUndoWallChangeToast: ReturnType<typeof vi.fn>;
  reconnectSerialForCurrentBoard: string | null;
} | null;

const ctrl = vi.hoisted(() => ({
  bluetooth: null as BluetoothCtx,
  boardId: null as number | null,
  isSessionWallLit: false,
  sessionId: null as string | null,
  // Holder rides the per-climb BoardPresenceCurrentContext; null = wall free.
  presence: undefined as BoardPresenceCurrentState | undefined,
}));
const trackMock = vi.hoisted(() => vi.fn());

vi.mock('../../../providers/bluetooth-provider', () => ({ useOptionalBluetoothContext: () => ctrl.bluetooth }));
vi.mock('../../../providers/board-presence-provider', () => ({
  useBoardPresenceControls: () => ({ boardId: ctrl.boardId }),
}));
vi.mock('../../../providers/queue-provider', () => ({
  useQueueSessionControls: () => ({ isSessionWallLit: ctrl.isSessionWallLit, sessionId: ctrl.sessionId }),
}));
vi.mock('../../../lib/analytics', () => ({ track: trackMock }));

import { useLightbulbControl } from '../use-lightbulb-control';

function makeBluetooth(over: Partial<NonNullable<BluetoothCtx>> = {}): NonNullable<BluetoothCtx> {
  return {
    isConnected: false,
    loading: false,
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    armUndoWallChangeToast: vi.fn(),
    reconnectSerialForCurrentBoard: null,
    ...over,
  };
}

// Minimal holder — every BoardConnectionHolder field is optional (anonymous).
const presenceWithHolder = { holder: {}, currentClimb: null } as unknown as BoardPresenceCurrentState;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(BoardPresenceCurrentContext.Provider, { value: ctrl.presence }, children);

function renderControl(source: 'lightbulb_toolbar' | 'lightbulb_drawer' = 'lightbulb_toolbar') {
  return renderHook(() => useLightbulbControl({ source }), { wrapper });
}

beforeEach(() => {
  ctrl.bluetooth = makeBluetooth();
  ctrl.boardId = null;
  ctrl.isSessionWallLit = false;
  ctrl.sessionId = null;
  ctrl.presence = undefined;
  trackMock.mockClear();
});

describe('useLightbulbControl lit state', () => {
  it('lights from this device when its BLE link is connected', () => {
    ctrl.bluetooth = makeBluetooth({ isConnected: true });
    const { result } = renderControl();
    expect(result.current.lit).toBe(true);
    expect(result.current.localConnected).toBe(true);
  });

  it('stays lit and locally connected when this device holds the wall and is subscribed', () => {
    // This device drives the wall (isConnected) AND is subscribed to the board
    // feed (boardId bound). Local connection short-circuits lit before the
    // holder/session checks, so both read true.
    ctrl.bluetooth = makeBluetooth({ isConnected: true });
    ctrl.boardId = 42;
    const { result } = renderControl();
    expect(result.current.lit).toBe(true);
    expect(result.current.localConnected).toBe(true);
  });

  it('lights from a session peer holding the wall, without claiming local connection', () => {
    // The headline behaviour: subscribed to the board feed (boardId bound), a
    // peer holds it, this device is not connected — the bulb reads lit but the
    // tap still connects/takes over (localConnected stays false).
    ctrl.boardId = 42;
    ctrl.presence = presenceWithHolder;
    const { result } = renderControl();
    expect(result.current.lit).toBe(true);
    expect(result.current.localConnected).toBe(false);
  });

  it('reads off once subscribed and the holder has cleared, even if the session flag is stuck', () => {
    // The regression guard: holder authoritatively cleared, but the best-effort
    // session flag is stuck true. Subscribed clients trust the holder → off.
    ctrl.boardId = 42;
    ctrl.presence = undefined; // holder cleared
    ctrl.isSessionWallLit = true;
    const { result } = renderControl();
    expect(result.current.lit).toBe(false);
  });

  it('falls back to the session flag when no board is bound', () => {
    ctrl.boardId = null;
    ctrl.isSessionWallLit = true;
    const { result } = renderControl();
    expect(result.current.lit).toBe(true);
  });
});

describe('useLightbulbControl press action', () => {
  it('connects, arms the undo toast, and tracks when disconnected', () => {
    ctrl.bluetooth = makeBluetooth({ isConnected: false, reconnectSerialForCurrentBoard: 'serial-1' });
    const { result } = renderControl();
    result.current.onPress();
    expect(ctrl.bluetooth?.armUndoWallChangeToast).toHaveBeenCalledOnce();
    expect(ctrl.bluetooth?.connect).toHaveBeenCalledWith(undefined, undefined, 'serial-1');
    expect(ctrl.bluetooth?.disconnect).not.toHaveBeenCalled();
    expect(trackMock).toHaveBeenCalledWith(
      'Board Lightbulb Connect',
      expect.objectContaining({ source: 'lightbulb_toolbar' }),
    );
  });

  it('disconnects (no connect, no track) when already connected', () => {
    ctrl.bluetooth = makeBluetooth({ isConnected: true });
    const { result } = renderControl();
    result.current.onPress();
    expect(ctrl.bluetooth?.disconnect).toHaveBeenCalledOnce();
    expect(ctrl.bluetooth?.connect).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('no-ops a tap while a connect/disconnect is in flight', () => {
    ctrl.bluetooth = makeBluetooth({ isConnected: false, loading: true });
    const { result } = renderControl();
    result.current.onPress();
    expect(ctrl.bluetooth?.connect).not.toHaveBeenCalled();
    expect(ctrl.bluetooth?.disconnect).not.toHaveBeenCalled();
  });
});
