import { describe, it, expect } from 'vitest';
import { getMoonboardSerialPosition, isMoonboardDeviceName, getMoonboardBluetoothPacket } from '../moonboard';

describe('getMoonboardSerialPosition', () => {
  it('returns correct position for hold 1 (first column, first row)', () => {
    // holdId=1, zeroBasedHoldId=0, col=0 (even), row=0
    // position = col * 18 + row = 0
    expect(getMoonboardSerialPosition(1)).toBe(0);
  });

  it('returns correct position for hold 12 (second column, first row)', () => {
    // holdId=12, zeroBasedHoldId=11, col=11%11=0, row=floor(11/11)=1
    // Wait: col = 11 % 11 = 0, row = floor(11/11) = 1
    // position = 0*18 + 1 = 1
    expect(getMoonboardSerialPosition(12)).toBe(1);
  });

  it('returns correct position for hold 2 (second column in first row)', () => {
    // holdId=2, zeroBasedHoldId=1, col=1 (odd), row=0
    // position = 1*18 + (18-1-0) = 18+17 = 35
    expect(getMoonboardSerialPosition(2)).toBe(35);
  });

  it('returns correct position for max hold 198', () => {
    // holdId=198, zeroBasedHoldId=197, col=197%11=10 (even), row=floor(197/11)=17
    // position = 10*18 + 17 = 197
    expect(getMoonboardSerialPosition(198)).toBe(197);
  });

  it('throws for hold id 0 (out of range)', () => {
    expect(() => getMoonboardSerialPosition(0)).toThrow('MoonBoard hold id out of range');
  });

  it('throws for hold id exceeding grid size', () => {
    // max is 11*18 = 198
    expect(() => getMoonboardSerialPosition(199)).toThrow('MoonBoard hold id out of range');
  });

  it('throws for non-integer hold id', () => {
    expect(() => getMoonboardSerialPosition(1.5)).toThrow('MoonBoard hold id out of range');
  });
});

describe('isMoonboardDeviceName', () => {
  it('returns true for "MoonBoard A"', () => {
    expect(isMoonboardDeviceName('MoonBoard A')).toBe(true);
  });

  it('returns true for "Moonboard A" (lowercase b)', () => {
    expect(isMoonboardDeviceName('Moonboard A')).toBe(true);
  });

  it('returns false for "Kilter Board#123@3"', () => {
    expect(isMoonboardDeviceName('Kilter Board#123@3')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isMoonboardDeviceName(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isMoonboardDeviceName('')).toBe(false);
  });
});

describe('getMoonboardBluetoothPacket', () => {
  it('produces correct output format for a single hold', () => {
    // Role 42 = 'S' (start), placement 1 -> serial position 0
    const packet = getMoonboardBluetoothPacket('p1r42');
    const decoded = new TextDecoder().decode(packet);
    expect(decoded).toBe('l#S0#');
  });

  it('produces correct output for multiple holds', () => {
    // Role 42='S', 43='P', 44='E'
    // placement 1 -> position 0, placement 2 -> position 35
    const packet = getMoonboardBluetoothPacket('p1r42p2r43');
    const decoded = new TextDecoder().decode(packet);
    expect(decoded).toBe('l#S0,P35#');
  });

  it('includes end hold type', () => {
    // Role 44='E', placement 198 -> position 197
    const packet = getMoonboardBluetoothPacket('p198r44');
    const decoded = new TextDecoder().decode(packet);
    expect(decoded).toBe('l#E197#');
  });

  it('throws for unsupported role code', () => {
    expect(() => getMoonboardBluetoothPacket('p1r99')).toThrow('Unsupported MoonBoard hold state code');
  });
});
