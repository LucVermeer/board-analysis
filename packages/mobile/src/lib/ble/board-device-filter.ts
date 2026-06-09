import { AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID, parseSerialNumber } from '@boardsesh/ble-protocol';
import { parseBoardTypeFromDeviceName } from '@boardsesh/ble-protocol/aurora';
import { isMoonboardDeviceName } from '@boardsesh/ble-protocol/moonboard';

const BOARD_SERVICE_UUIDS = new Set([AURORA_ADVERTISED_SERVICE_UUID.toLowerCase(), UART_SERVICE_UUID.toLowerCase()]);

/**
 * Decides whether a scan result looks like a climbing board. The adapters scan
 * unfiltered (where supported) because MoonBoard controllers don't reliably
 * include the UART service UUID in their advertisements — a service-UUID scan
 * filter never surfaces them (web works around the same problem with
 * `namePrefix` filters in MOONBOARD_REQUEST_DEVICE_OPTIONS). So the filtering
 * moves here: accept anything advertising a known board service, any
 * MoonBoard-prefixed name, any Aurora product name, and any name carrying the
 * Aurora `#serial@api` suffix (covers renamed Aurora boards). When a platform
 * still scans with a native UUID filter (older iOS binaries), pass
 * `serviceUuids: undefined` and a known-service name match is not required —
 * the native filter already vouched for the device.
 */
export function isLikelyBoardDevice({
  name,
  serviceUuids,
}: {
  name?: string;
  serviceUuids?: string[] | null;
}): boolean {
  if (serviceUuids?.some((serviceUuid) => BOARD_SERVICE_UUIDS.has(serviceUuid.toLowerCase()))) {
    return true;
  }
  if (!name) return false;
  if (isMoonboardDeviceName(name)) return true;
  if (parseBoardTypeFromDeviceName(name) !== undefined) return true;
  return parseSerialNumber(name) !== undefined;
}
