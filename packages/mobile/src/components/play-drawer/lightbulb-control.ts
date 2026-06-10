import { deriveIsDriver } from '@boardsesh/queue-runtime';
import { isPlaylistPeekQueueItemUuid, type ClimbQueueItem } from '@boardsesh/queue';

export type PlayDrawerPreviousDriver = 'none' | 'self' | 'other';

export type PlayDrawerLightbulbState = {
  isPersistentSessionActive: boolean;
  isDriver: boolean;
  lightbulbActive: boolean;
  lightbulbPending: boolean;
};

export type PlayDrawerLightbulbPressAction =
  | 'noop'
  | 'release_party'
  | 'reconnect_ble'
  | 'connect_solo'
  | 'reassert_solo'
  | 'take_party';

export function derivePlayDrawerLightbulbState(args: {
  sessionId: string | null;
  driverParticipantId: string | null;
  participantId: string | null;
  isBluetoothConnected: boolean;
  isBluetoothLoading: boolean;
  pendingClimbUuid: string | null;
}): PlayDrawerLightbulbState {
  const isPersistentSessionActive = args.sessionId !== null;
  const isDriver = deriveIsDriver({
    isPersistentSessionActive,
    participantId: args.participantId,
    driverParticipantId: args.driverParticipantId,
  });

  return {
    isPersistentSessionActive,
    isDriver,
    // "Lit" follows the real BLE link in both modes, matching the climbs-list
    // lightbulb. In solo mode deriveIsDriver is always true, so this collapses to
    // isBluetoothConnected; in a party session it stays unlit unless you both hold
    // wall control and have the board connected, so a stolen link unlights it.
    lightbulbActive: isDriver && args.isBluetoothConnected,
    lightbulbPending: args.isBluetoothLoading || args.pendingClimbUuid !== null,
  };
}

export function derivePlayDrawerPreviousDriver(args: {
  driverParticipantId: string | null;
  participantId: string | null;
}): PlayDrawerPreviousDriver {
  if (args.driverParticipantId === null) return 'none';
  return args.driverParticipantId === args.participantId ? 'self' : 'other';
}

export function isPlayDrawerPreviewOnly(args: { isPersistentSessionActive: boolean; isDriver: boolean }): boolean {
  return args.isPersistentSessionActive && !args.isDriver;
}

export function derivePlayDrawerLightbulbPressAction(args: {
  hasBluetooth: boolean;
  hasDisplayedClimb: boolean;
  isPersistentSessionActive: boolean;
  isDriver: boolean;
  isBluetoothConnected: boolean;
}): PlayDrawerLightbulbPressAction {
  if (args.isPersistentSessionActive) {
    if (args.isDriver) {
      if (args.isBluetoothConnected) return 'release_party';
      // Driver but the link was stolen — reconnect and keep wall control, so it
      // takes one tap (not two: release then re-take) to relight the board.
      if (args.hasBluetooth) return 'reconnect_ble';
      // No BLE on this client at all — releasing control is the only action left.
      return 'release_party';
    }
    return args.hasDisplayedClimb ? 'take_party' : 'noop';
  }
  if (!args.hasBluetooth) return 'noop';
  if (!args.isBluetoothConnected) return 'connect_solo';
  if (!args.hasDisplayedClimb) return 'noop';
  return 'reassert_solo';
}

export function shouldRestoreFailedTakeControlPreview(args: {
  failedOperationId: number;
  latestOperationId: number;
  failedClimbUuid: string;
  displayedClimbUuid: string | null;
}): boolean {
  return args.failedOperationId === args.latestOperationId && args.displayedClimbUuid === args.failedClimbUuid;
}

export function resolvePlayDrawerWallControlQueueItem(args: {
  displayedQueueItem: ClimbQueueItem | null;
  displayedClimb: ClimbQueueItem['climb'];
  createQueueItem: (climb: ClimbQueueItem['climb'], options?: { suggested?: boolean }) => ClimbQueueItem;
}): ClimbQueueItem {
  if (args.displayedQueueItem && !isPlaylistPeekQueueItemUuid(args.displayedQueueItem.uuid)) {
    return args.displayedQueueItem;
  }
  return args.createQueueItem(args.displayedClimb, { suggested: args.displayedQueueItem?.suggested ?? false });
}

export function buildPlayDrawerBoardLayout(args: { boardName: string; layoutId: number; sizeId: number }): string {
  return `${args.boardName}:${args.layoutId}:${args.sizeId}`;
}
