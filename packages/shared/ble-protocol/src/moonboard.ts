import { MOONBOARD_GRID, MOONBOARD_DEVICE_NAME_PREFIXES } from '@boardsesh/board-constants/moonboard';

const MOONBOARD_FRAME_PREFIX = 'l#';
const MOONBOARD_FRAME_SUFFIX = '#';

// Boardsesh persists MoonBoard frames with the shared basic role codes only.
// The newer controller firmware can render extra preview-only roles, but the
// web client does not emit them in climb frames.
const MOONBOARD_ROLE_MAP = {
  42: 'S',
  43: 'P',
  44: 'E',
} as const;

export type MoonboardPacketResult = {
  packet: Uint8Array;
  skippedRoleCount: number;
  skippedPositionCount: number;
  totalPlacements: number;
};

// Note: UART_SERVICE_UUID is available from './transport' — not re-exported
// here to avoid collisions in the barrel index.

export function isMoonboardDeviceName(name?: string): boolean {
  return !!name && MOONBOARD_DEVICE_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function getMoonboardSerialPosition(holdId: number): number {
  const maxHoldId = MOONBOARD_GRID.numColumns * MOONBOARD_GRID.numRows;
  if (!Number.isInteger(holdId) || holdId < 1 || holdId > maxHoldId) {
    throw new Error(`MoonBoard hold id out of range: ${holdId}`);
  }

  const zeroBasedHoldId = holdId - 1;
  const colIndex = zeroBasedHoldId % MOONBOARD_GRID.numColumns;
  const rowIndex = Math.floor(zeroBasedHoldId / MOONBOARD_GRID.numColumns);

  if (colIndex % 2 === 0) {
    return colIndex * MOONBOARD_GRID.numRows + rowIndex;
  }

  return colIndex * MOONBOARD_GRID.numRows + (MOONBOARD_GRID.numRows - 1 - rowIndex);
}

export function getMoonboardBluetoothPacket(frames: string): MoonboardPacketResult {
  const encodedHolds: string[] = [];
  let skippedRoleCount = 0;
  let skippedPositionCount = 0;

  const frameParts = frames.split('p').filter(Boolean);

  frameParts.forEach((frame) => {
    const [placement, role] = frame.split('r');
    const holdId = Number(placement);
    const holdType = MOONBOARD_ROLE_MAP[Number(role) as keyof typeof MOONBOARD_ROLE_MAP];

    if (!holdType) {
      skippedRoleCount++;
      return;
    }

    try {
      encodedHolds.push(`${holdType}${getMoonboardSerialPosition(holdId)}`);
    } catch {
      skippedPositionCount++;
    }
  });

  if (skippedPositionCount > 0) {
    console.warn(`[BLE] Skipped ${skippedPositionCount} MoonBoard holds with invalid ids for this payload`);
  }

  const holdPayload = encodedHolds.join(',');

  return {
    packet: new TextEncoder().encode(`${MOONBOARD_FRAME_PREFIX}${holdPayload}${MOONBOARD_FRAME_SUFFIX}`),
    skippedRoleCount,
    skippedPositionCount,
    totalPlacements: frameParts.length,
  };
}
