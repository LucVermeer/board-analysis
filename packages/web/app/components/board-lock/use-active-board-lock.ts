'use client';

import { usePersistentSessionState } from '../persistent-session';
import { useBluetoothConnectedStatus } from '../board-bluetooth-control/bluetooth-status-store';
import { useQueueBridgeBoardInfo } from '../queue-control/queue-bridge-board-info-context';
import type { BoardDetails } from '@/app/lib/types';

export type BoardLockReason = 'session' | 'bluetooth';

export type ActiveBoardLock = {
  lockedBoard: BoardDetails | null;
  reason: BoardLockReason | null;
};

function hasSameBoardConfig(firstBoard: BoardDetails, secondBoard: BoardDetails): boolean {
  if (
    firstBoard.board_name !== secondBoard.board_name ||
    firstBoard.layout_id !== secondBoard.layout_id ||
    firstBoard.size_id !== secondBoard.size_id
  ) {
    return false;
  }

  const firstSetIds = [...firstBoard.set_ids].sort((leftSetId, rightSetId) => leftSetId - rightSetId);
  const secondSetIds = [...secondBoard.set_ids].sort((leftSetId, rightSetId) => leftSetId - rightSetId);
  return (
    firstSetIds.length === secondSetIds.length && firstSetIds.every((setId, index) => setId === secondSetIds[index])
  );
}

/**
 * Reports whether the user's active board is anchored to something that
 * would make an accidental board switch destructive — an active party
 * session or a live Bluetooth connection. When neither is present, both
 * fields are `null` and callers should allow free navigation.
 *
 * A session always wins over Bluetooth for labeling purposes (both point
 * to the same board in practice, but session copy is the more accurate
 * user-facing reason).
 */
export function useActiveBoardLock(): ActiveBoardLock {
  const { activeSession } = usePersistentSessionState();
  const isBluetoothConnected = useBluetoothConnectedStatus();
  const { boardDetails: bridgeBoardDetails } = useQueueBridgeBoardInfo();

  if (activeSession) {
    if (!bridgeBoardDetails || hasSameBoardConfig(activeSession.boardDetails, bridgeBoardDetails)) {
      return { lockedBoard: activeSession.boardDetails, reason: 'session' };
    }
  }

  if (isBluetoothConnected && bridgeBoardDetails) {
    return { lockedBoard: bridgeBoardDetails, reason: 'bluetooth' };
  }

  return { lockedBoard: null, reason: null };
}
