/**
 * Classifies a thrown BLE error into an actionable category so the connect
 * flow can show the user a message that explains what went wrong (instead of
 * failing silently). Pure TS — no React, no DOM — so it's unit-testable and
 * usable from any adapter path (web / Capacitor / native iOS).
 *
 * The consumer maps the category to user-facing copy with a literal-key switch
 * (the i18n linter forbids `t(variable)`). `'user_cancelled'` shows nothing:
 * dismissing the device picker isn't a failure, so we stay silent.
 */
export type BleFailureCategory =
  | 'unavailable' // Bluetooth off / unsupported / unauthorized
  | 'user_cancelled' // user dismissed the picker — no message
  | 'board_not_found' // scan found nothing / target serial never appeared
  | 'connect_failed' // GATT connect failed or timed out
  | 'service_missing' // connected but UART service/characteristic absent
  | 'unknown';

function errorName(error: unknown): string | undefined {
  // Guard DOMException for non-DOM environments (native iOS adapter does the
  // same) — `instanceof DOMException` would throw a ReferenceError otherwise.
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Classify a thrown error from a connect attempt. `pairingStage` is the stage
 * tag the hook tracks; we use `gatt_connect` as a fallback signal for
 * `connect_failed` when the message itself isn't conclusive. Note: the
 * scan-timeout path is tagged `gatt_connect` (the stage is advanced before
 * `requestAndConnect` runs), so classification must lean on the message for
 * `board_not_found` rather than the stage.
 */
export function classifyBleFailure(error: unknown, pairingStage?: string): BleFailureCategory {
  const name = errorName(error);
  const message = errorMessage(error);

  // User dismissed the picker. Match only explicit user-cancel signals — a bare
  // "cancel" would also swallow real failures like CoreBluetooth's
  // "operation cancelled" / "Connection cancelled by peer", silently showing
  // the user nothing. NotFoundError is the Web Bluetooth chooser-dismissed name.
  if (name === 'NotFoundError' || /user cancell?ed|Device selection cancelled/i.test(message)) {
    return 'user_cancelled';
  }

  // Connected at the GATT layer but the board didn't expose the UART service or
  // its write characteristic. Checked before board_not_found so a "...not found"
  // UART message isn't swallowed by the board-not-found patterns below. Covers
  // the web adapter's "Failed to get UART characteristic" and the Swift
  // "UART service was not found" / "Write characteristic was not found".
  if (
    /UART (service|characteristic)|write characteristic|characteristic.*not found|service.*not found/i.test(message)
  ) {
    return 'service_missing';
  }

  // Scan found nothing / the target board's serial never showed up. Anchored to
  // device/board so a future unrelated "X not found" doesn't land here by accident.
  if (/Target board not found during scan|device.*not found|board.*not found|deviceNotFound/i.test(message)) {
    return 'board_not_found';
  }

  // GATT-level connect failure or timeout. The headline path for "the board is
  // there but we couldn't establish the link".
  if (
    /GATT|gatt|timed out|timeout|failed to connect|connection failed/i.test(message) ||
    pairingStage === 'gatt_connect'
  ) {
    return 'connect_failed';
  }

  if (/not available|unavailable|powered ?off|poweredOff/i.test(message)) {
    return 'unavailable';
  }

  return 'unknown';
}

/**
 * True when an error thrown from a *write* (not a connect attempt) means the
 * GATT link is gone — the board dropped, another device grabbed it (these
 * boards are last-connection-wins), or the OS tore the connection down. The
 * write path otherwise swallows failures and leaves `isConnected` stuck true,
 * so the lightbulb keeps showing "connected" on a dead link. Callers use this
 * to mark the connection lost and offer a deliberate reconnect.
 *
 * Deliberately tight to avoid false-positive teardown: `AbortError` (the
 * unmount-mid-write path) and ordinary value/validation failures must NOT
 * count — only transport-level disconnect signatures do.
 */
export function isDisconnectionError(error: unknown): boolean {
  const name = errorName(error);
  // Unmount-mid-write — the AutoSender aborts its in-flight write on unmount.
  // Not a real disconnect; the caller handles it separately.
  if (name === 'AbortError') return false;
  const message = errorMessage(error);
  // Web Bluetooth surfaces a dead GATT link as NetworkError ("GATT Server is
  // disconnected..."). InvalidStateError can mean the same once the GATT handle
  // is torn down, but it also fires for unrelated reasons (closed
  // IDBTransaction, double-read ReadableStream), so require a GATT mention.
  if (name === 'NetworkError') return true;
  if (name === 'InvalidStateError') return /gatt/i.test(message);
  // Capacitor / native iOS adapters throw plain Errors: "Not connected",
  // "Device disconnected during write", and CoreBluetooth/Android plugin
  // rejections that name a disconnected / unreachable peripheral.
  return /GATT (server|operation).*(disconnect|not connected)|not connected|disconnected|peripheral.*(disconnect|unreachable)/i.test(
    message,
  );
}
