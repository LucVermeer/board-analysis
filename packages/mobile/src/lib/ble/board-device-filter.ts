import { AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID, parseSerialNumber } from '@boardsesh/ble-protocol';
import { parseBoardTypeFromDeviceName } from '@boardsesh/ble-protocol/aurora';
import { isMoonboardDeviceName } from '@boardsesh/ble-protocol/moonboard';
import type { BoardScanFamily } from './types';

const AURORA_SERVICE_UUID = AURORA_ADVERTISED_SERVICE_UUID.toLowerCase();
const UART_SERVICE_UUID_LOWER = UART_SERVICE_UUID.toLowerCase();
const STRICT_AURORA_SERIAL_SUFFIX = /#[A-Za-z0-9-]+@\d+$/;

/**
 * Decides whether a scan result looks like a climbing board. The adapters scan
 * according to the current board family: Aurora routes should not surface
 * generic UART peripherals, while MoonBoard routes still need name-based
 * matching because those controllers do not reliably advertise UART.
 */
export function isLikelyBoardDevice({
  name,
  serviceUuids,
  scanFamily,
}: {
  name?: string;
  serviceUuids?: string[] | null;
  scanFamily: BoardScanFamily;
}): boolean {
  if (scanFamily === 'aurora') {
    if (serviceUuids?.some((serviceUuid) => serviceUuid.toLowerCase() === AURORA_SERVICE_UUID)) {
      return true;
    }
    if (!name) return false;
    if (parseBoardTypeFromDeviceName(name) !== undefined) return true;
    return STRICT_AURORA_SERIAL_SUFFIX.test(name.trim()) && parseSerialNumber(name) !== undefined;
  }

  if (serviceUuids?.some((serviceUuid) => serviceUuid.toLowerCase() === UART_SERVICE_UUID_LOWER)) {
    return true;
  }

  if (!name) return false;
  return isMoonboardDeviceName(name);
}
