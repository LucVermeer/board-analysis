/**
 * Shared controller for the wall-confirm fallback flow used by web and mobile.
 *
 * This logic was extracted from the original web hook and made
 * platform-neutral for React Native by injecting BLE, native-shell, timer, and
 * event-bus dependencies. When a user claims the wall, both platforms wait
 * briefly for a WallConfirmedClimb event. If no confirm arrives, this
 * controller decides whether to skip fallback, auto-connect to the last board,
 * or open the board picker so web and mobile do not each carry their own
 * timer/listener/fallback implementation.
 */
/**
 * How long the pulse waits for the board to confirm the climb lit up before it
 * renders a verdict (clears the pulse / runs the connect fallback). This is the
 * user-facing feedback deadline.
 *
 * Successful confirm latency (PostHog, un-truncated) runs p95 ~1.5s / p99 ~1.9s;
 * the previous 2000ms cap sat right on top of that tail and *truncated* it, so
 * legitimately-confirmed-but-slow sends were logged as timeouts. 3000ms clears
 * the observed tail with headroom; anything slower still lands via the reconcile
 * window below rather than being dropped.
 */
export const WALL_CONFIRM_TIMEOUT_MS = 3000;

/**
 * Total window (from arm) during which a late `WallConfirmedClimb` still
 * reconciles the earlier timeout into an honest confirm instead of being
 * dropped. After WALL_CONFIRM_TIMEOUT_MS the pulse/fallback verdict has already
 * landed (so the user waits no longer for feedback); the watcher then keeps
 * listening quietly until this backstop so a slow board ack — or a cold connect
 * that only lands after the deadline — is recorded truthfully.
 *
 * Kept in step with the BLE reconnect grace: a reconnect-by-serial keeps
 * scanning for `SERIAL_RECONNECT_GRACE_MS` (`@boardsesh/ble-protocol/scan-constants`,
 * currently 10_000ms) before it surfaces the picker, so a cold-connect confirm
 * can legitimately land that late. If that grace changes, revisit this backstop —
 * the two are intentionally the same value.
 */
export const WALL_CONFIRM_RECONCILE_MS = 10_000;

export type WallConfirmMode = 'party' | 'solo';
export type WallConfirmFallback = 'already_connected' | 'unsupported' | 'auto_connect' | 'picker' | 'pulse_only';

export type WallConfirmArmArgs = {
  climbUuid: string;
  mode: WallConfirmMode;
  boardLayout: string;
  /**
   * Drive the pulse/confirm UI but never connect on timeout. Set this when the
   * caller has *itself* just initiated a connect (the always-live lightbulb tap
   * does this): re-connecting 2s later is at best redundant (a successful
   * connect already short-circuits via `already_connected`) and at worst a
   * second native scan started while the first picker is still open — which
   * trips "Already scanning. Stopping now." on the iOS shell. The watcher still
   * waits for `WallConfirmedClimb` and fires `onConfirmed` / `onTimeout` to
   * clear the pulse; only the connect fallback is suppressed.
   */
  pulseOnly?: boolean;
};

type WallConfirmTimeoutId = ReturnType<typeof setTimeout>;

export type WallConfirmControllerDeps = {
  isBluetoothConnected: () => boolean;
  isBluetoothSupported: () => boolean;
  lastConnectedBoardSerial: () => string | null;
  isPersistentSessionActive: () => boolean;
  bluetoothConnect: (frames?: string, mirrored?: boolean, targetSerial?: string) => Promise<boolean>;
  isNativeApp: () => boolean;
  subscribeToWallConfirm: (callback: (climbUuid: string) => void) => () => void;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => WallConfirmTimeoutId;
  clearTimeout?: (timeoutId: WallConfirmTimeoutId) => void;
};

export type WallConfirmControllerCallbacks = {
  onConfirmed?: (info: { climbUuid: string; latencyMs: number; confirmedByRole: 'self' | 'other' }) => void;
  onTimeout?: (info: { climbUuid: string }) => void;
  /**
   * Fired when a `WallConfirmedClimb` arrives *after* the timeout verdict has
   * already run but still inside WALL_CONFIRM_RECONCILE_MS. The wall did light —
   * just slowly — so the earlier timeout was a false negative. `latencyMs` is the
   * true elapsed time from arm.
   */
  onReconciled?: (info: { climbUuid: string; latencyMs: number; confirmedByRole: 'self' | 'other' }) => void;
  onTrackConfirmed?: (info: {
    climbUuid: string;
    latencyMs: number;
    confirmedByRole: 'self' | 'other';
    mode: WallConfirmMode;
    boardLayout: string;
  }) => void;
  onTrackTimeout?: (info: { mode: WallConfirmMode; fallback: WallConfirmFallback; boardLayout: string }) => void;
  /**
   * Telemetry hook for a reconciled confirm. `previousFallback` is the timeout
   * classification that was recorded at the deadline, so a consumer can net the
   * two out (a reconciled confirm means the paired timeout was not a real
   * board-ack failure).
   */
  onTrackReconciled?: (info: {
    climbUuid: string;
    latencyMs: number;
    confirmedByRole: 'self' | 'other';
    mode: WallConfirmMode;
    boardLayout: string;
    previousFallback: WallConfirmFallback;
  }) => void;
};

type WatcherPhase = 'pending' | 'reconciling';
type Watcher = { token: object; phase: WatcherPhase; timeoutId: WallConfirmTimeoutId; unsubscribe: () => void };

export type WallConfirmFallbackController = {
  armWatcher: (args: WallConfirmArmArgs) => void;
  cancelWatcher: () => void;
  handleSessionActiveChange: () => void;
};

export function createWallConfirmFallbackController(
  deps: WallConfirmControllerDeps,
  callbacks: WallConfirmControllerCallbacks = {},
): WallConfirmFallbackController {
  let watcher: Watcher | null = null;
  const getNow = deps.now ?? Date.now;
  const scheduleTimeout: NonNullable<WallConfirmControllerDeps['setTimeout']> =
    deps.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs) as WallConfirmTimeoutId);
  const cancelTimeout: NonNullable<WallConfirmControllerDeps['clearTimeout']> =
    deps.clearTimeout ?? ((timeoutId) => clearTimeout(timeoutId));

  const cancelWatcher = () => {
    if (!watcher) return;
    cancelTimeout(watcher.timeoutId);
    watcher.unsubscribe();
    watcher = null;
  };

  const handleSessionActiveChange = () => {
    if (!deps.isPersistentSessionActive() && watcher) {
      cancelWatcher();
    }
  };

  const armWatcher = ({ climbUuid, mode, boardLayout, pulseOnly = false }: WallConfirmArmArgs) => {
    cancelWatcher();

    const armedAt = getNow();
    // Per-arm identity: survives the pending → reconciling transition (same
    // token) but distinguishes this arm from any later one, so a stale timer or
    // bus callback that slips through no-ops.
    const token: object = {};
    // Classification recorded at the deadline; reported back if a late confirm
    // reconciles it.
    let recordedFallback: WallConfirmFallback = 'pulse_only';

    const runReconcileBackstop = () => {
      if (watcher?.token !== token) return;
      // No late confirm arrived within the backstop — the timeout stands.
      cancelWatcher();
    };

    const runFallback = () => {
      if (watcher?.token !== token) return;

      callbacks.onTimeout?.({ climbUuid });

      // The caller already kicked off its own connect — never start another one
      // (the second scan is what breaks iOS pairing). Just record the timeout.
      if (pulseOnly) {
        recordedFallback = 'pulse_only';
      } else if (deps.isBluetoothConnected()) {
        recordedFallback = 'already_connected';
      } else if (!deps.isBluetoothSupported()) {
        recordedFallback = 'unsupported';
      } else {
        const serial = deps.lastConnectedBoardSerial();
        if (serial && deps.isNativeApp()) {
          recordedFallback = 'auto_connect';
          void deps.bluetoothConnect(undefined, undefined, serial);
        } else {
          recordedFallback = 'picker';
          void deps.bluetoothConnect();
        }
      }
      callbacks.onTrackTimeout?.({ mode, fallback: recordedFallback, boardLayout });

      // Keep listening: a slow-but-valid ack that lands after the deadline
      // reconciles this timeout instead of being dropped. The pending timer has
      // already fired, so we only re-point the watcher at the reconcile backstop
      // and keep the same bus subscription alive.
      const reconcileDelayMs = Math.max(0, WALL_CONFIRM_RECONCILE_MS - WALL_CONFIRM_TIMEOUT_MS);
      const reconcileTimeoutId = scheduleTimeout(runReconcileBackstop, reconcileDelayMs);
      watcher = { token, phase: 'reconciling', timeoutId: reconcileTimeoutId, unsubscribe };
    };

    const unsubscribe = deps.subscribeToWallConfirm((confirmedUuid) => {
      if (watcher?.token !== token) return;
      if (confirmedUuid !== climbUuid) return;
      const latencyMs = getNow() - armedAt;
      const confirmedByRole: 'self' | 'other' = deps.isBluetoothConnected() ? 'self' : 'other';
      const wasReconciling = watcher.phase === 'reconciling';
      cancelWatcher();
      if (wasReconciling) {
        callbacks.onReconciled?.({ climbUuid, latencyMs, confirmedByRole });
        callbacks.onTrackReconciled?.({
          climbUuid,
          latencyMs,
          confirmedByRole,
          mode,
          boardLayout,
          previousFallback: recordedFallback,
        });
        return;
      }
      callbacks.onConfirmed?.({ climbUuid, latencyMs, confirmedByRole });
      callbacks.onTrackConfirmed?.({ climbUuid, latencyMs, confirmedByRole, mode, boardLayout });
    });

    const capturedTimeoutId = scheduleTimeout(runFallback, WALL_CONFIRM_TIMEOUT_MS);
    watcher = { token, phase: 'pending', timeoutId: capturedTimeoutId, unsubscribe };
  };

  return { armWatcher, cancelWatcher, handleSessionActiveChange };
}
