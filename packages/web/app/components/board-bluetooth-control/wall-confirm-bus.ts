'use client';

/**
 * Module-level bus for wall-confirm signals.
 *
 * The queue-control-bar pivot's drawer lightbulb starts a 2-second timer when
 * pressed. If the wall actually receives the climb within that window, the
 * timer is dismissed; otherwise a fallback (auto-connect or device picker)
 * runs. This module is the rendezvous point for the "wall received it" signal
 * across both transports:
 *
 *  - **Solo** (no party session): `BluetoothAutoSender` emits locally after a
 *    successful BLE write, because solo has no backend session to broadcast
 *    through and no other clients to inform.
 *  - **Party**: `BluetoothAutoSender` *also* emits locally on the BLE-paired
 *    phone (so its own drawer dismisses the timer immediately) and additionally
 *    fires the `confirmClimbOnWall` mutation. Other party participants receive
 *    the broadcast `WallConfirmedClimb` event through their session-event
 *    subscription and republish it onto the same bus.
 *
 * Drawer code therefore subscribes once and gets both transports for free —
 * no separate party-vs-solo branch at the call site.
 */

const listeners = new Set<(climbUuid: string) => void>();

/** Subscribe to wall-confirm signals. Returns an unsubscribe function. */
export function subscribeToWallConfirm(callback: (climbUuid: string) => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Emit a wall-confirm signal for `climbUuid`. */
export function emitWallConfirm(climbUuid: string): void {
  for (const listener of listeners) {
    try {
      listener(climbUuid);
    } catch (error) {
      // A buggy listener shouldn't break the others.
      console.error('wall-confirm listener threw:', error);
    }
  }
}
