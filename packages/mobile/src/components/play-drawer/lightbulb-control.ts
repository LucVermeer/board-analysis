export type PlayDrawerLightbulbState = {
  lightbulbActive: boolean;
  lightbulbPending: boolean;
};

export type PlayDrawerLightbulbPressAction = 'noop' | 'connect' | 'disconnect';

export function derivePlayDrawerLightbulbState(args: {
  isBluetoothConnected: boolean;
  isBluetoothLoading: boolean;
}): PlayDrawerLightbulbState {
  return {
    // The drawer lightbulb is a pure connect/disconnect BLE toggle: lit iff the
    // board is connected (the holder is whoever last pushed a climb, tracked by
    // board presence — not a party "driver").
    lightbulbActive: args.isBluetoothConnected,
    lightbulbPending: args.isBluetoothLoading,
  };
}

export function derivePlayDrawerLightbulbPressAction(args: {
  hasBluetooth: boolean;
  isBluetoothConnected: boolean;
  isBluetoothLoading: boolean;
}): PlayDrawerLightbulbPressAction {
  // No board selected yet, or a connect/disconnect already in flight — ignore.
  if (!args.hasBluetooth || args.isBluetoothLoading) return 'noop';
  if (args.isBluetoothConnected) return 'disconnect';
  return 'connect';
}

export function buildPlayDrawerBoardLayout(args: { boardName: string; layoutId: number; sizeId: number }): string {
  return `${args.boardName}:${args.layoutId}:${args.sizeId}`;
}
