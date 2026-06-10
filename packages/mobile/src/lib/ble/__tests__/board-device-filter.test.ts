import { describe, it, expect } from 'vitest';
import { AURORA_ADVERTISED_SERVICE_UUID, UART_SERVICE_UUID } from '@boardsesh/ble-protocol';
import { isLikelyBoardDevice } from '../board-device-filter';

describe('isLikelyBoardDevice', () => {
  it('accepts a device advertising the Aurora service UUID regardless of name', () => {
    expect(isLikelyBoardDevice({ name: undefined, serviceUuids: [AURORA_ADVERTISED_SERVICE_UUID] })).toBe(true);
  });

  it('accepts a device advertising the UART service UUID, case-insensitively', () => {
    expect(isLikelyBoardDevice({ name: 'whatever', serviceUuids: [UART_SERVICE_UUID.toUpperCase()] })).toBe(true);
  });

  it('accepts a MoonBoard by name even when no service UUIDs are advertised', () => {
    // The whole reason the scan runs unfiltered: MoonBoard controllers don't
    // reliably include the UART UUID in their advertisements.
    expect(isLikelyBoardDevice({ name: 'MoonBoard A1B2', serviceUuids: [] })).toBe(true);
    expect(isLikelyBoardDevice({ name: 'Moonboard Mini', serviceUuids: null })).toBe(true);
  });

  it('accepts Aurora boards by product name when the advertisement lacks UUIDs', () => {
    expect(isLikelyBoardDevice({ name: 'Kilter Board#751737@3', serviceUuids: [] })).toBe(true);
    expect(isLikelyBoardDevice({ name: 'Tension Board#42@2' })).toBe(true);
  });

  it('accepts a renamed Aurora board that keeps the #serial@api suffix', () => {
    expect(isLikelyBoardDevice({ name: 'Garage Wall#900001@3', serviceUuids: [] })).toBe(true);
  });

  it('rejects unrelated devices', () => {
    expect(isLikelyBoardDevice({ name: 'JBL Flip 6', serviceUuids: [] })).toBe(false);
    expect(isLikelyBoardDevice({ name: undefined, serviceUuids: [] })).toBe(false);
    expect(isLikelyBoardDevice({ name: 'Fitbit Charge', serviceUuids: ['0000180d-0000-1000-8000-00805f9b34fb'] })).toBe(
      false,
    );
  });
});
