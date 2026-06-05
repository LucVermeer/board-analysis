import { describe, expect, it } from 'vitest';
import {
  createReleaseControlOptimisticPlan,
  createTakeControlOptimisticPlan,
  deriveTakeControlPlaylistSuggestionSource,
  shouldRollbackReleaseControlDriver,
  shouldRollbackTakeControlDriver,
  shouldRollbackTakeControlQueue,
  shouldSurfaceReleaseControlFailure,
} from '../wall-control-optimistic';

type SuggestionSource = { playlistUuid: string; activatedClimbUuid: string };

const source: SuggestionSource = {
  playlistUuid: 'playlist-1',
  activatedClimbUuid: 'climb-1',
};

describe('deriveTakeControlPlaylistSuggestionSource', () => {
  it('uses an explicit playlist suggestion source, including explicit null', () => {
    expect(
      deriveTakeControlPlaylistSuggestionSource({
        hasExplicitPlaylistSuggestionSource: true,
        explicitPlaylistSuggestionSource: source,
        isSuggestedItem: false,
      }),
    ).toBe(source);

    expect(
      deriveTakeControlPlaylistSuggestionSource({
        hasExplicitPlaylistSuggestionSource: true,
        explicitPlaylistSuggestionSource: undefined,
        isSuggestedItem: true,
      }),
    ).toBeNull();
  });

  it('preserves source for implicit suggested items and clears it for manual items', () => {
    expect(
      deriveTakeControlPlaylistSuggestionSource({
        hasExplicitPlaylistSuggestionSource: false,
        explicitPlaylistSuggestionSource: undefined,
        isSuggestedItem: true,
      }),
    ).toBeUndefined();

    expect(
      deriveTakeControlPlaylistSuggestionSource({
        hasExplicitPlaylistSuggestionSource: false,
        explicitPlaylistSuggestionSource: undefined,
        isSuggestedItem: false,
      }),
    ).toBeNull();
  });
});

describe('createTakeControlOptimisticPlan', () => {
  it('does not claim driver or update current climb outside an active session', () => {
    expect(
      createTakeControlOptimisticPlan({
        isSessionActive: false,
        currentOperationId: 4,
        localParticipantId: 'participant-1',
        previousDriverParticipantId: 'participant-2',
        item: { suggested: false },
        hasExplicitPlaylistSuggestionSource: false,
        explicitPlaylistSuggestionSource: undefined,
      }),
    ).toEqual({
      operationId: 4,
      previousDriverParticipantId: 'participant-2',
      optimisticDriverParticipantId: undefined,
      shouldUpdateCurrentClimb: false,
      playlistSuggestionSource: undefined,
    });
  });

  it('increments the wall-control operation, claims local driver, and derives playlist source', () => {
    expect(
      createTakeControlOptimisticPlan({
        isSessionActive: true,
        currentOperationId: 4,
        localParticipantId: 'participant-1',
        previousDriverParticipantId: 'participant-2',
        item: { suggested: true },
        hasExplicitPlaylistSuggestionSource: true,
        explicitPlaylistSuggestionSource: source,
      }),
    ).toEqual({
      operationId: 5,
      previousDriverParticipantId: 'participant-2',
      optimisticDriverParticipantId: 'participant-1',
      shouldUpdateCurrentClimb: true,
      playlistSuggestionSource: source,
    });
  });

  it('still creates an operation for active sessions when participant id is not ready', () => {
    expect(
      createTakeControlOptimisticPlan({
        isSessionActive: true,
        currentOperationId: 4,
        localParticipantId: null,
        previousDriverParticipantId: 'participant-2',
        item: null,
        hasExplicitPlaylistSuggestionSource: false,
        explicitPlaylistSuggestionSource: undefined,
      }),
    ).toEqual({
      operationId: 5,
      previousDriverParticipantId: 'participant-2',
      optimisticDriverParticipantId: undefined,
      shouldUpdateCurrentClimb: false,
      playlistSuggestionSource: undefined,
    });
  });
});

describe('take-control rollback decisions', () => {
  it('rolls back the queue only for the latest failed operation that still shows the claimed item', () => {
    expect(
      shouldRollbackTakeControlQueue({
        currentOperationId: 7,
        operationId: 7,
        itemUuid: 'item-1',
        currentClimbQueueItemUuid: 'item-1',
      }),
    ).toBe(true);
    expect(
      shouldRollbackTakeControlQueue({
        currentOperationId: 8,
        operationId: 7,
        itemUuid: 'item-1',
        currentClimbQueueItemUuid: 'item-1',
      }),
    ).toBe(false);
    expect(
      shouldRollbackTakeControlQueue({
        currentOperationId: 7,
        operationId: 7,
        itemUuid: 'item-1',
        currentClimbQueueItemUuid: 'item-2',
      }),
    ).toBe(false);
  });

  it('rolls back the driver only when the latest failed operation still owns the optimistic claim', () => {
    expect(
      shouldRollbackTakeControlDriver({
        currentOperationId: 7,
        operationId: 7,
        localParticipantId: 'participant-1',
        currentDriverParticipantId: 'participant-1',
      }),
    ).toBe(true);
    expect(
      shouldRollbackTakeControlDriver({
        currentOperationId: 7,
        operationId: 7,
        localParticipantId: 'participant-1',
        currentDriverParticipantId: 'participant-2',
      }),
    ).toBe(false);
  });
});

describe('release-control optimistic decisions', () => {
  it('only increments the operation when the local participant currently owns driver state', () => {
    expect(
      createReleaseControlOptimisticPlan({
        currentOperationId: 4,
        previousDriverParticipantId: 'participant-1',
        localParticipantId: 'participant-1',
      }),
    ).toEqual({
      operationId: 5,
      previousDriverParticipantId: 'participant-1',
      shouldOptimisticallyRelease: true,
    });

    expect(
      createReleaseControlOptimisticPlan({
        currentOperationId: 4,
        previousDriverParticipantId: 'participant-2',
        localParticipantId: 'participant-1',
      }),
    ).toEqual({
      operationId: 4,
      previousDriverParticipantId: 'participant-2',
      shouldOptimisticallyRelease: false,
    });
  });

  it('rolls back and surfaces failures using latest-operation checks', () => {
    expect(
      shouldRollbackReleaseControlDriver({
        currentOperationId: 5,
        operationId: 5,
        shouldOptimisticallyRelease: true,
        currentDriverParticipantId: null,
      }),
    ).toBe(true);
    expect(
      shouldRollbackReleaseControlDriver({
        currentOperationId: 6,
        operationId: 5,
        shouldOptimisticallyRelease: true,
        currentDriverParticipantId: null,
      }),
    ).toBe(false);
    expect(
      shouldSurfaceReleaseControlFailure({
        currentOperationId: 6,
        operationId: 5,
        shouldOptimisticallyRelease: true,
      }),
    ).toBe(false);
    expect(
      shouldSurfaceReleaseControlFailure({
        currentOperationId: 6,
        operationId: 5,
        shouldOptimisticallyRelease: false,
      }),
    ).toBe(true);
  });
});
