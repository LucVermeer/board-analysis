import { describe, expect, it } from 'vitest';
import {
  buildPlayDrawerBoardLayout,
  deriveLightbulbLit,
  derivePlayDrawerLightbulbPressAction,
} from '../lightbulb-control';

describe('play drawer lightbulb control', () => {
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

describe('deriveLightbulbLit', () => {
  it('lights whenever this device holds the BLE link', () => {
    expect(
      deriveLightbulbLit({
        localConnected: true,
        isSubscribedToBoardFeed: false,
        peerHolderPresent: false,
        isSessionWallLit: false,
      }),
    ).toBe(true);
  });

  it('lights when subscribed and a peer holds the wall', () => {
    expect(
      deriveLightbulbLit({
        localConnected: false,
        isSubscribedToBoardFeed: true,
        peerHolderPresent: true,
        isSessionWallLit: false,
      }),
    ).toBe(true);
  });

  it('ignores a stuck session flag once subscribed to the authoritative feed', () => {
    // The regression: the holder has cleared (peer disconnected) but the
    // best-effort session flag is stuck true. Subscribed clients trust the
    // holder, so the bulb correctly reads off — the phone can take control back.
    expect(
      deriveLightbulbLit({
        localConnected: false,
        isSubscribedToBoardFeed: true,
        peerHolderPresent: false,
        isSessionWallLit: true,
      }),
    ).toBe(false);
  });

  it('falls back to the session flag for a member that never bound the board', () => {
    expect(
      deriveLightbulbLit({
        localConnected: false,
        isSubscribedToBoardFeed: false,
        peerHolderPresent: false,
        isSessionWallLit: true,
      }),
    ).toBe(true);

    expect(
      deriveLightbulbLit({
        localConnected: false,
        isSubscribedToBoardFeed: false,
        peerHolderPresent: false,
        isSessionWallLit: false,
      }),
    ).toBe(false);
  });
});
