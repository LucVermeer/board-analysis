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

  // User dismissed the picker. Mirrors the previous inline `isUserCancel` check.
  if (name === 'NotFoundError' || /user cancelled|cancel|Device selection cancelled/i.test(message)) {
    return 'user_cancelled';
  }

  // Connected at the GATT layer but the board didn't expose the UART service.
  // Checked before board_not_found so "UART service was not found" isn't
  // swallowed by the broad "not found" below.
  if (/UART service|write characteristic|characteristic.*not found|service.*not found/i.test(message)) {
    return 'service_missing';
  }

  // Scan found nothing / the target board's serial never showed up.
  if (/Target board not found during scan|device was not found|not found|deviceNotFound/i.test(message)) {
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
