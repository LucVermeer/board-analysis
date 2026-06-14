import { describe, expect, it } from 'vitest';
import {
  buildPlayDrawerBoardLayout,
  derivePlayDrawerLightbulbPressAction,
  derivePlayDrawerLightbulbState,
} from '../lightbulb-control';

describe('play drawer lightbulb control', () => {
  it('lights the lightbulb iff the board is connected', () => {
    expect(derivePlayDrawerLightbulbState({ isBluetoothConnected: false, isBluetoothLoading: false })).toEqual({
      lightbulbActive: false,
      lightbulbPending: false,
    });

    expect(derivePlayDrawerLightbulbState({ isBluetoothConnected: true, isBluetoothLoading: false })).toEqual({
      lightbulbActive: true,
      lightbulbPending: false,
    });
  });

  it('treats Bluetooth loading as pending', () => {
    expect(derivePlayDrawerLightbulbState({ isBluetoothConnected: false, isBluetoothLoading: true })).toEqual({
      lightbulbActive: false,
      lightbulbPending: true,
    });

    // Connected and still loading (e.g. a reconnect re-push) stays lit + pending.
    expect(derivePlayDrawerLightbulbState({ isBluetoothConnected: true, isBluetoothLoading: true })).toEqual({
      lightbulbActive: true,
      lightbulbPending: true,
    });
  });

  it('derives the connect/disconnect tap action', () => {
    // No board selected on this client at all — nothing to toggle.
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: false,
        isBluetoothConnected: false,
        isBluetoothLoading: false,
      }),
    ).toBe('noop');

    // A connect/disconnect already in flight — ignore the tap.
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        isBluetoothConnected: false,
        isBluetoothLoading: true,
      }),
    ).toBe('noop');

    // Not connected → connect.
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        isBluetoothConnected: false,
        isBluetoothLoading: false,
      }),
    ).toBe('connect');

    // Connected → disconnect.
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        isBluetoothConnected: true,
        isBluetoothLoading: false,
      }),
    ).toBe('disconnect');
  });

  it('builds the analytics board-layout key', () => {
    expect(buildPlayDrawerBoardLayout({ boardName: 'kilter', layoutId: 1, sizeId: 10 })).toBe('kilter:1:10');
  });
});
