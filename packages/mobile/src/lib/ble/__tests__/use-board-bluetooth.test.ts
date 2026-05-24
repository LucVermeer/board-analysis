import { describe, it, expect, vi } from 'vitest';
import type { HoldPlacement } from '../../../components/board-renderer/types';

// ── Mock native modules that use-board-bluetooth.ts imports transitively ──

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
}));

vi.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: vi.fn(),
  deactivateKeepAwake: vi.fn(),
}));

vi.mock('@boardsesh/ble-protocol/aurora', () => ({
  getAuroraBluetoothPacket: vi.fn(),
  parseApiLevel: vi.fn(),
  parseSerialNumber: vi.fn(),
}));

vi.mock('@boardsesh/ble-protocol/moonboard', () => ({
  getMoonboardBluetoothPacket: vi.fn(),
}));

vi.mock('../adapter', () => ({
  RNBleAdapter: vi.fn(),
}));

import { convertToMirroredFramesString } from '../use-board-bluetooth';

// ── Factory helper ──────────────────────────────────────────────────────

function makePlacement(id: number, mirroredHoldId: number | null): HoldPlacement {
  return { id, mirroredHoldId, cx: 0, cy: 0, r: 10 };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('convertToMirroredFramesString', () => {
  it('correctly maps hold IDs to mirrored IDs', () => {
    const holdsData: HoldPlacement[] = [makePlacement(100, 200), makePlacement(101, 201)];

    const frames = 'p100r12p101r14';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p200r12p201r14');
  });

  it('handles a single hold', () => {
    const holdsData: HoldPlacement[] = [makePlacement(42, 84)];

    const frames = 'p42r5';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p84r5');
  });

  it('handles multiple holds with different state codes', () => {
    const holdsData: HoldPlacement[] = [makePlacement(1, 10), makePlacement(2, 20), makePlacement(3, 30)];

    const frames = 'p1r1p2r2p3r3';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p10r1p20r2p30r3');
  });

  it('handles empty frames string', () => {
    const holdsData: HoldPlacement[] = [makePlacement(1, 10)];

    const frames = '';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('');
  });

  it('throws when mirroredHoldId is undefined for a hold', () => {
    // Hold 42 has no mirrored ID (null)
    const holdsData: HoldPlacement[] = [makePlacement(42, null)];

    const frames = 'p42r5';

    expect(() => convertToMirroredFramesString(frames, holdsData)).toThrow(
      'Mirrored hold ID is not defined for hold ID 42.',
    );
  });

  it('throws when hold ID is not present in holdsData at all', () => {
    // holdsData is empty — no mapping exists for hold 99
    const holdsData: HoldPlacement[] = [];

    const frames = 'p99r7';

    expect(() => convertToMirroredFramesString(frames, holdsData)).toThrow(
      'Mirrored hold ID is not defined for hold ID 99.',
    );
  });

  it('preserves state codes exactly', () => {
    const holdsData: HoldPlacement[] = [makePlacement(500, 600)];

    const frames = 'p500r255';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p600r255');
  });

  it('uses only holds with mirroredHoldId set in the map', () => {
    // Two holds: one with mirror, one without. Only the one with mirror is in frames.
    const holdsData: HoldPlacement[] = [
      makePlacement(10, 20),
      makePlacement(30, null), // no mirror
    ];

    // Only hold 10 is in frames, which has a valid mirror
    const frames = 'p10r1';
    const result = convertToMirroredFramesString(frames, holdsData);

    expect(result).toBe('p20r1');
  });
});
