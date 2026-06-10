import { describe, expect, it } from 'vitest';
import type { ClimbQueueItem } from '@boardsesh/queue';
import {
  buildPlayDrawerBoardLayout,
  derivePlayDrawerLightbulbPressAction,
  derivePlayDrawerLightbulbState,
  derivePlayDrawerPreviousDriver,
  isPlayDrawerPreviewOnly,
  resolvePlayDrawerWallControlQueueItem,
  shouldRestoreFailedTakeControlPreview,
} from '../lightbulb-control';

const testClimb: ClimbQueueItem['climb'] = {
  uuid: 'climb-1',
  name: 'Test climb',
  frames: 'p1r12',
  setter_username: 'setter',
  angle: 40,
  ascensionist_count: 0,
  difficulty: 'V3',
  quality_average: '3.0',
  stars: 3,
  difficulty_error: '0.3',
  benchmark_difficulty: null,
};

const createQueueItem = (climb: ClimbQueueItem['climb'], options?: { suggested?: boolean }): ClimbQueueItem => ({
  uuid: 'realized-queue-item',
  climb,
  suggested: options?.suggested,
});

describe('play drawer lightbulb control', () => {
  it('uses Bluetooth state for the solo lightbulb', () => {
    expect(
      derivePlayDrawerLightbulbState({
        sessionId: null,
        driverParticipantId: null,
        participantId: null,
        isBluetoothConnected: false,
        isBluetoothLoading: false,
        pendingClimbUuid: null,
      }),
    ).toEqual({
      isPersistentSessionActive: false,
      isDriver: true,
      lightbulbActive: false,
      lightbulbPending: false,
    });

    expect(
      derivePlayDrawerLightbulbState({
        sessionId: null,
        driverParticipantId: null,
        participantId: null,
        isBluetoothConnected: true,
        isBluetoothLoading: true,
        pendingClimbUuid: null,
      }),
    ).toEqual({
      isPersistentSessionActive: false,
      isDriver: true,
      lightbulbActive: true,
      lightbulbPending: true,
    });
  });

  it('keeps the party lightbulb unlit when the driver has no BLE link', () => {
    // Driver in a session but the board link was stolen — the bulb must go unlit,
    // matching the climbs-list bulb, instead of staying lit on wall-control alone.
    expect(
      derivePlayDrawerLightbulbState({
        sessionId: 'session-1',
        driverParticipantId: 'participant-1',
        participantId: 'participant-1',
        isBluetoothConnected: false,
        isBluetoothLoading: false,
        pendingClimbUuid: null,
      }),
    ).toEqual({
      isPersistentSessionActive: true,
      isDriver: true,
      lightbulbActive: false,
      lightbulbPending: false,
    });

    // Driver with the board connected — lit.
    expect(
      derivePlayDrawerLightbulbState({
        sessionId: 'session-1',
        driverParticipantId: 'participant-1',
        participantId: 'participant-1',
        isBluetoothConnected: true,
        isBluetoothLoading: false,
        pendingClimbUuid: null,
      }),
    ).toEqual({
      isPersistentSessionActive: true,
      isDriver: true,
      lightbulbActive: true,
      lightbulbPending: false,
    });

    expect(
      derivePlayDrawerLightbulbState({
        sessionId: 'session-1',
        driverParticipantId: 'participant-2',
        participantId: 'participant-1',
        isBluetoothConnected: true,
        isBluetoothLoading: false,
        pendingClimbUuid: 'climb-1',
      }),
    ).toEqual({
      isPersistentSessionActive: true,
      isDriver: false,
      lightbulbActive: false,
      lightbulbPending: true,
    });
  });

  it('derives the lightbulb tap action', () => {
    // Party driver with no BLE on this client at all (bluetooth === null): the
    // driver branch can't reconnect, so it falls back to release. This is the
    // `if (args.hasBluetooth) return 'reconnect_ble'` else-branch in
    // derivePlayDrawerLightbulbPressAction — kept reachable on purpose.
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: false,
        hasDisplayedClimb: true,
        isPersistentSessionActive: true,
        isDriver: true,
        isBluetoothConnected: false,
      }),
    ).toBe('release_party');
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: false,
        hasDisplayedClimb: true,
        isPersistentSessionActive: true,
        isDriver: false,
        isBluetoothConnected: false,
      }),
    ).toBe('take_party');
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: false,
        hasDisplayedClimb: true,
        isPersistentSessionActive: false,
        isDriver: true,
        isBluetoothConnected: false,
      }),
    ).toBe('noop');
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        hasDisplayedClimb: false,
        isPersistentSessionActive: false,
        isDriver: true,
        isBluetoothConnected: false,
      }),
    ).toBe('connect_solo');
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        hasDisplayedClimb: true,
        isPersistentSessionActive: false,
        isDriver: true,
        isBluetoothConnected: true,
      }),
    ).toBe('reassert_solo');
    // Party driver whose link was stolen reconnects BLE in one tap, keeping control.
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        hasDisplayedClimb: true,
        isPersistentSessionActive: true,
        isDriver: true,
        isBluetoothConnected: false,
      }),
    ).toBe('reconnect_ble');
    // Party driver still connected releases wall control.
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        hasDisplayedClimb: true,
        isPersistentSessionActive: true,
        isDriver: true,
        isBluetoothConnected: true,
      }),
    ).toBe('release_party');
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        hasDisplayedClimb: true,
        isPersistentSessionActive: true,
        isDriver: false,
        isBluetoothConnected: false,
      }),
    ).toBe('take_party');
    expect(
      derivePlayDrawerLightbulbPressAction({
        hasBluetooth: true,
        hasDisplayedClimb: false,
        isPersistentSessionActive: true,
        isDriver: false,
        isBluetoothConnected: false,
      }),
    ).toBe('noop');
  });

  it('derives analytics helpers for wall-control events', () => {
    expect(derivePlayDrawerPreviousDriver({ driverParticipantId: null, participantId: 'participant-1' })).toBe('none');
    expect(
      derivePlayDrawerPreviousDriver({ driverParticipantId: 'participant-1', participantId: 'participant-1' }),
    ).toBe('self');
    expect(
      derivePlayDrawerPreviousDriver({ driverParticipantId: 'participant-2', participantId: 'participant-1' }),
    ).toBe('other');
    expect(buildPlayDrawerBoardLayout({ boardName: 'kilter', layoutId: 1, sizeId: 10 })).toBe('kilter:1:10');
  });

  it('keeps party non-drivers in preview-only drawer mode', () => {
    expect(isPlayDrawerPreviewOnly({ isPersistentSessionActive: true, isDriver: false })).toBe(true);
    expect(isPlayDrawerPreviewOnly({ isPersistentSessionActive: true, isDriver: true })).toBe(false);
    expect(isPlayDrawerPreviewOnly({ isPersistentSessionActive: false, isDriver: true })).toBe(false);
  });

  it('only restores a failed take-control preview for the still-current operation and climb', () => {
    expect(
      shouldRestoreFailedTakeControlPreview({
        failedOperationId: 2,
        latestOperationId: 2,
        failedClimbUuid: 'climb-a',
        displayedClimbUuid: 'climb-a',
      }),
    ).toBe(true);
    expect(
      shouldRestoreFailedTakeControlPreview({
        failedOperationId: 1,
        latestOperationId: 2,
        failedClimbUuid: 'climb-a',
        displayedClimbUuid: 'climb-a',
      }),
    ).toBe(false);
    expect(
      shouldRestoreFailedTakeControlPreview({
        failedOperationId: 2,
        latestOperationId: 2,
        failedClimbUuid: 'climb-a',
        displayedClimbUuid: 'climb-b',
      }),
    ).toBe(false);
  });

  it('keeps real queue items unchanged for wall control claims', () => {
    const realQueueItem = {
      uuid: 'queue-real',
      climb: testClimb,
      suggested: false,
    };

    expect(
      resolvePlayDrawerWallControlQueueItem({
        displayedQueueItem: realQueueItem,
        displayedClimb: testClimb,
        createQueueItem,
      }),
    ).toBe(realQueueItem);
  });

  it('materializes playlist peek items before wall control claims', () => {
    const playlistPeekItem = {
      uuid: 'playlist-peek:climb-1',
      climb: testClimb,
      suggested: true,
    };

    expect(
      resolvePlayDrawerWallControlQueueItem({
        displayedQueueItem: playlistPeekItem,
        displayedClimb: testClimb,
        createQueueItem,
      }),
    ).toEqual({
      uuid: 'realized-queue-item',
      climb: testClimb,
      suggested: true,
    });
  });

  it('creates a queue item from the displayed climb when there is no displayed queue item', () => {
    expect(
      resolvePlayDrawerWallControlQueueItem({
        displayedQueueItem: null,
        displayedClimb: testClimb,
        createQueueItem,
      }),
    ).toEqual({
      uuid: 'realized-queue-item',
      climb: testClimb,
      suggested: false,
    });
  });
});
