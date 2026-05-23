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

export function getMoonboardBluetoothPacket(frames: string): Uint8Array {
  const encodedHolds: string[] = [];
  let skippedCount = 0;

  frames
    .split('p')
    .filter(Boolean)
    .forEach((frame) => {
      const [placement, role] = frame.split('r');
      const holdId = Number(placement);
      const holdType = MOONBOARD_ROLE_MAP[Number(role) as keyof typeof MOONBOARD_ROLE_MAP];

      if (!holdType) {
        throw new Error(`Unsupported MoonBoard hold state code: ${role}`);
      }

      try {
        encodedHolds.push(`${holdType}${getMoonboardSerialPosition(holdId)}`);
      } catch {
        skippedCount++;
      }
    });

  if (skippedCount > 0) {
    console.warn(`[BLE] Skipped ${skippedCount} MoonBoard holds with invalid ids for this payload`);
  }

  const holdPayload = encodedHolds.join(',');

  return new TextEncoder().encode(`${MOONBOARD_FRAME_PREFIX}${holdPayload}${MOONBOARD_FRAME_SUFFIX}`);
}
