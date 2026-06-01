// Scan-only BLE discovery for the "Bluetooth quickstart" board picker. Unlike
// the adapter's requestAndConnect (which scans *and* opens a UART connection),
// this only listens for in-range Aurora boards and collects their serial
// numbers — the picker then resolves serials to boards via
// GET_BOARDS_BY_SERIAL_NUMBERS and sets the chosen one active. No connection is
// opened here; connecting happens later when the user enters play mode.

import { useCallback, useEffect, useRef, useState } from 'react';
import { State } from 'react-native-ble-plx';
import { AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID, parseSerialNumber } from '@boardsesh/ble-protocol';
import { bleManager } from './ble-manager';

const SCAN_TIMEOUT_MS = 15_000;

export type BoardScanStatus = 'idle' | 'scanning' | 'done' | 'unavailable';

export type BoardScan = {
  status: BoardScanStatus;
  /** Distinct serial numbers parsed from in-range device names. */
  serials: string[];
  start: () => Promise<void>;
  /** Stop any in-flight scan and return to idle (e.g. when the sheet closes). */
  reset: () => void;
};

export function useBoardScan(): BoardScan {
  const [status, setStatus] = useState<BoardScanStatus>('idle');
  const [serials, setSerials] = useState<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (scanningRef.current) {
      bleManager.stopDeviceScan();
      scanningRef.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    if (scanningRef.current) return;

    let powered = false;
    try {
      powered = (await bleManager.state()) === State.PoweredOn;
    } catch {
      powered = false;
    }
    if (!powered) {
      setStatus('unavailable');
      return;
    }

    const found = new Set<string>();
    setSerials([]);
    setStatus('scanning');
    scanningRef.current = true;

    bleManager.startDeviceScan([AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID], null, (error, device) => {
      if (error) {
        stop();
        setStatus('unavailable');
        return;
      }
      if (!device) return;
      const serial = parseSerialNumber(device.localName ?? device.name ?? undefined);
      if (serial && !found.has(serial)) {
        found.add(serial);
        setSerials([...found]);
      }
    });

    timeoutRef.current = setTimeout(() => {
      stop();
      setStatus('done');
    }, SCAN_TIMEOUT_MS);
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setSerials([]);
    setStatus('idle');
  }, [stop]);

  // Always stop scanning if the component unmounts mid-scan.
  useEffect(() => stop, [stop]);

  return { status, serials, start, reset };
}
