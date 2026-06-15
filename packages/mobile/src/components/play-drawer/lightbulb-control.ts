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
 * *in this user's session* is. Shared by the header toolbar bulb and the
 * play-drawer bulb so both light identically.
 *
 * The lit signal is session-scoped, but the board-presence holder is board-scoped
 * (anyone physically on the same board feed can be the holder — a stranger when
 * you're solo, or a non-member when you're in a session). So we don't light from
 * the bare holder; we light from a holder we can tie to the session:
 *  - `sessionHolderPresent` — a board-presence holder whose userId matches a
 *    member of my session (incl. me). Authoritative: the holder is server-owned,
 *    seq-gated, with a reliable compare-and-delete broadcast on disconnect and a
 *    WS-drop backstop, so it clears reliably. This is what stops the bulb getting
 *    stuck lit on a phone that handed off control.
 *  - `isSessionWallLit` is a best-effort session UI flag toggled by
 *    WallConfirmedClimb / WallDisconnected with no reconciliation — a missed or
 *    late "disconnected" event leaves it stuck `true`. It's only consulted as a
 *    fallback for an *anonymous* holder (no userId to id-match) while in a session,
 *    or for a session member who never bound the board feed (no holder to read).
 *
 * Net effect: a board holder who isn't part of my session (or any holder while I'm
 * solo) no longer lights my bulb, while the holder's avatar still shows separately.
 */
export function deriveLightbulbLit(args: {
  localConnected: boolean;
  isSubscribedToBoardFeed: boolean;
  /** A board-presence holder whose userId matches a member of my session (incl. me). */
  sessionHolderPresent: boolean;
  /** The current holder is anonymous (exists, userId == null) AND I'm in a session. */
  holderIsAnonymous: boolean;
  /** Best-effort session "a member lit a climb" flag. */
  isSessionWallLit: boolean;
}): boolean {
  if (args.localConnected) return true;
  // No board feed bound: no holder to trust; fall back to the session flag
  // (only ever true inside a session).
  if (!args.isSubscribedToBoardFeed) return args.isSessionWallLit;
  // Subscribed: trust the authoritative holder, but only a session member's.
  if (args.sessionHolderPresent) return true;
  // Anonymous holder can't be id-matched; fall back to the session flag, but only
  // while a holder actually exists (a cleared holder + stuck flag still reads off).
  return args.holderIsAnonymous && args.isSessionWallLit;
}

export function buildPlayDrawerBoardLayout(args: { boardName: string; layoutId: number; sizeId: number }): string {
  return `${args.boardName}:${args.layoutId}:${args.sizeId}`;
}
