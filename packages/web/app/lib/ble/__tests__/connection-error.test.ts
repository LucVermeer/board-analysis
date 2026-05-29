import { describe, it, expect } from 'vite-plus/test';
import { classifyBleFailure, type BleFailureCategory } from '../connection-error';

describe('classifyBleFailure', () => {
  const cases: Array<{ name: string; error: unknown; stage?: string; expected: BleFailureCategory }> = [
    // user cancelled
    {
      name: 'DOMException NotFoundError',
      error: new DOMException('No device chosen', 'NotFoundError'),
      expected: 'user_cancelled',
    },
    {
      name: 'Device selection cancelled (capacitor picker)',
      error: new Error('Device selection cancelled'),
      expected: 'user_cancelled',
    },
    {
      name: 'generic user cancel message',
      error: new Error('The user cancelled the request'),
      expected: 'user_cancelled',
    },

    // board not found — the exact strings both adapters throw on scan timeout
    {
      name: 'capacitor/native scan timeout',
      error: new Error('Target board not found during scan'),
      expected: 'board_not_found',
    },
    {
      name: 'native swift device-not-found',
      error: new Error('Bluetooth device was not found'),
      expected: 'board_not_found',
    },

    // service missing — native swift error descriptions
    { name: 'swift UART service missing', error: new Error('UART service was not found'), expected: 'service_missing' },
    {
      name: 'write characteristic missing',
      error: new Error('Write characteristic was not found'),
      expected: 'service_missing',
    },
    {
      name: 'web adapter UART characteristic',
      error: new Error('Failed to get UART characteristic'),
      expected: 'service_missing',
    },

    // connect failed
    { name: 'swift connect timeout', error: new Error('Bluetooth connection timed out'), expected: 'connect_failed' },
    { name: 'gatt error message', error: new Error('GATT operation failed'), expected: 'connect_failed' },
    { name: 'failed to connect', error: new Error('failed to connect to peripheral'), expected: 'connect_failed' },
    // stage fallback: a bare message but the stage tells us it was the connect step
    {
      name: 'gatt_connect stage fallback',
      error: new Error('something opaque'),
      stage: 'gatt_connect',
      expected: 'connect_failed',
    },

    // unavailable
    {
      name: 'bluetooth not available',
      error: new Error('Bluetooth is not available on this device'),
      expected: 'unavailable',
    },
    { name: 'powered off', error: new Error('Bluetooth poweredOff'), expected: 'unavailable' },

    // unknown
    { name: 'opaque error, no stage', error: new Error('something opaque'), expected: 'unknown' },
    { name: 'non-error value', error: 'a plain string', expected: 'unknown' },
    // A real failure that merely contains the word "cancel" must NOT be treated
    // as a user cancel (which would be silent) — it should surface.
    { name: 'CoreBluetooth operation cancelled', error: new Error('The operation was cancelled'), expected: 'unknown' },
    { name: 'connection cancelled by peer', error: new Error('Connection cancelled by peer'), expected: 'unknown' },
  ];

  for (const { name, error, stage, expected } of cases) {
    it(`classifies: ${name} -> ${expected}`, () => {
      expect(classifyBleFailure(error, stage)).toBe(expected);
    });
  }

  it('user_cancelled wins even when the stage is gatt_connect', () => {
    // A cancel can surface after the stage was advanced; the cancel signal must win.
    expect(classifyBleFailure(new Error('Device selection cancelled'), 'gatt_connect')).toBe('user_cancelled');
  });
});
