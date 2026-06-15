export type PlayDrawerLightbulbPressAction = 'noop' | 'connect' | 'disconnect';

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

/**
 * Whether the lightbulb reads lit: this device is driving the wall, or someone
 * in the session is. Shared by the header toolbar bulb and the play-drawer bulb
 * so both light identically.
 *
 * The cross-phone "a peer holds the wall" signal has two possible sources, and
 * they are NOT equivalent:
 *  - `peerHolderPresent` (board-presence holder) is authoritative: server-owned,
 *    seq-gated, with a reliable compare-and-delete broadcast on disconnect and a
 *    WS-drop backstop, so it clears reliably.
 *  - `isSessionWallLit` is a best-effort session UI flag toggled by
 *    WallConfirmedClimb / WallDisconnected with no reconciliation — a missed or
 *    late "disconnected" event leaves it stuck `true`.
 *
 * So when this device is subscribed to the board feed (it has bound a board),
 * trust the holder and ignore the fragile session flag — this is what stops the
 * bulb getting stuck lit on a phone that handed off control. Fall back to the
 * session flag only for a member who never bound the board (no feed to read).
 */
export function deriveLightbulbLit(args: {
  localConnected: boolean;
  isSubscribedToBoardFeed: boolean;
  peerHolderPresent: boolean;
  isSessionWallLit: boolean;
}): boolean {
  if (args.localConnected) return true;
  return args.isSubscribedToBoardFeed ? args.peerHolderPresent : args.isSessionWallLit;
}

export function buildPlayDrawerBoardLayout(args: { boardName: string; layoutId: number; sizeId: number }): string {
  return `${args.boardName}:${args.layoutId}:${args.sizeId}`;
}
