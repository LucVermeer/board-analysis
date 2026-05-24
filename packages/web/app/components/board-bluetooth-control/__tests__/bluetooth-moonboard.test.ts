import { describe, expect, it, vi } from 'vite-plus/test';
import { coordinateToHoldId } from '@/app/lib/moonboard-config';
import { getMoonboardBluetoothPacket, getMoonboardSerialPosition } from '../bluetooth-moonboard';
import { splitMessages } from '../bluetooth-shared';

describe('getMoonboardSerialPosition', () => {
  it('maps representative holds to the controller strip order', () => {
    expect(getMoonboardSerialPosition(coordinateToHoldId('A1'))).toBe(0);
    expect(getMoonboardSerialPosition(coordinateToHoldId('A18'))).toBe(17);
    expect(getMoonboardSerialPosition(coordinateToHoldId('B18'))).toBe(18);
    expect(getMoonboardSerialPosition(coordinateToHoldId('B1'))).toBe(35);
    expect(getMoonboardSerialPosition(coordinateToHoldId('K1'))).toBe(180);
    expect(getMoonboardSerialPosition(coordinateToHoldId('K18'))).toBe(197);
  });
});

describe('getMoonboardBluetoothPacket', () => {
  it('encodes Moonboard frames as the controller ASCII payload', () => {
    const { packet } = getMoonboardBluetoothPacket('p1r42p2r43p198r44');

    expect(new TextDecoder().decode(packet)).toBe('l#S0,P35,E197#');
  });

  it('skips unsupported Moonboard hold state codes gracefully', () => {
    const { packet, skippedRoleCount, totalPlacements } = getMoonboardBluetoothPacket('p1r45');

    expect(new TextDecoder().decode(packet)).toBe('l##');
    expect(skippedRoleCount).toBe(1);
    expect(totalPlacements).toBe(1);
  });

  it('encodes valid holds and skips invalid role codes', () => {
    const { packet, skippedRoleCount, totalPlacements } = getMoonboardBluetoothPacket('p1r42p2r99');

    expect(new TextDecoder().decode(packet)).toBe('l#S0#');
    expect(skippedRoleCount).toBe(1);
    expect(totalPlacements).toBe(2);
  });

  it('skips invalid Moonboard hold ids and keeps the remaining payload', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { packet, skippedPositionCount } = getMoonboardBluetoothPacket('p1r42p999r43p198r44');

    expect(new TextDecoder().decode(packet)).toBe('l#S0,E197#');
    expect(skippedPositionCount).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith('[BLE] Skipped 1 MoonBoard holds with invalid ids for this payload');

    warnSpy.mockRestore();
  });

  it('can be split into 20-byte BLE chunks without changing the payload', () => {
    const { packet } = getMoonboardBluetoothPacket('p1r42p2r43p3r43p4r43p5r43p6r43p7r43p8r43p198r44');

    const chunks = splitMessages(packet);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 20)).toBe(true);
    expect(new TextDecoder().decode(Uint8Array.from(chunks.flatMap((chunk) => [...chunk])))).toBe(
      new TextDecoder().decode(packet),
    );
  });
});
