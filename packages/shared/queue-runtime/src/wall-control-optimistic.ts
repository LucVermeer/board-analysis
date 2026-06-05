export type TakeControlOptimisticPlan<TPlaylistSuggestionSource> = {
  operationId: number;
  previousDriverParticipantId: string | null;
  optimisticDriverParticipantId: string | null | undefined;
  shouldUpdateCurrentClimb: boolean;
  playlistSuggestionSource: TPlaylistSuggestionSource | null | undefined;
};

export function deriveTakeControlPlaylistSuggestionSource<TPlaylistSuggestionSource>(args: {
  hasExplicitPlaylistSuggestionSource: boolean;
  explicitPlaylistSuggestionSource: TPlaylistSuggestionSource | null | undefined;
  isSuggestedItem: boolean;
}): TPlaylistSuggestionSource | null | undefined {
  if (args.hasExplicitPlaylistSuggestionSource) {
    return args.explicitPlaylistSuggestionSource ?? null;
  }
  return args.isSuggestedItem ? undefined : null;
}

export function createTakeControlOptimisticPlan<TPlaylistSuggestionSource>(args: {
  isSessionActive: boolean;
  currentOperationId: number;
  localParticipantId: string | null;
  previousDriverParticipantId: string | null;
  item: { suggested?: boolean } | null | undefined;
  hasExplicitPlaylistSuggestionSource: boolean;
  explicitPlaylistSuggestionSource: TPlaylistSuggestionSource | null | undefined;
}): TakeControlOptimisticPlan<TPlaylistSuggestionSource> {
  if (!args.isSessionActive) {
    return {
      operationId: args.currentOperationId,
      previousDriverParticipantId: args.previousDriverParticipantId,
      optimisticDriverParticipantId: undefined,
      shouldUpdateCurrentClimb: false,
      playlistSuggestionSource: undefined,
    };
  }

  return {
    operationId: args.currentOperationId + 1,
    previousDriverParticipantId: args.previousDriverParticipantId,
    optimisticDriverParticipantId: args.localParticipantId ?? undefined,
    shouldUpdateCurrentClimb: args.item != null,
    playlistSuggestionSource:
      args.item == null
        ? undefined
        : deriveTakeControlPlaylistSuggestionSource({
            hasExplicitPlaylistSuggestionSource: args.hasExplicitPlaylistSuggestionSource,
            explicitPlaylistSuggestionSource: args.explicitPlaylistSuggestionSource,
            isSuggestedItem: args.item.suggested === true,
          }),
  };
}

export function shouldRollbackTakeControlQueue(args: {
  currentOperationId: number;
  operationId: number;
  itemUuid: string | null | undefined;
  currentClimbQueueItemUuid: string | null | undefined;
}): boolean {
  return (
    args.currentOperationId === args.operationId &&
    args.itemUuid != null &&
    args.currentClimbQueueItemUuid === args.itemUuid
  );
}

export function shouldRollbackTakeControlDriver(args: {
  currentOperationId: number;
  operationId: number;
  localParticipantId: string | null | undefined;
  currentDriverParticipantId: string | null | undefined;
}): boolean {
  return (
    args.currentOperationId === args.operationId &&
    args.localParticipantId != null &&
    args.currentDriverParticipantId === args.localParticipantId
  );
}

export type ReleaseControlOptimisticPlan = {
  operationId: number;
  previousDriverParticipantId: string | null;
  shouldOptimisticallyRelease: boolean;
};

export function createReleaseControlOptimisticPlan(args: {
  currentOperationId: number;
  previousDriverParticipantId: string | null;
  localParticipantId: string | null;
}): ReleaseControlOptimisticPlan {
  const shouldOptimisticallyRelease =
    args.previousDriverParticipantId !== null && args.previousDriverParticipantId === args.localParticipantId;
  return {
    operationId: shouldOptimisticallyRelease ? args.currentOperationId + 1 : args.currentOperationId,
    previousDriverParticipantId: args.previousDriverParticipantId,
    shouldOptimisticallyRelease,
  };
}

export function shouldRollbackReleaseControlDriver(args: {
  currentOperationId: number;
  operationId: number;
  shouldOptimisticallyRelease: boolean;
  currentDriverParticipantId: string | null | undefined;
}): boolean {
  return (
    args.shouldOptimisticallyRelease &&
    args.currentOperationId === args.operationId &&
    args.currentDriverParticipantId === null
  );
}

export function shouldSurfaceReleaseControlFailure(args: {
  currentOperationId: number;
  operationId: number;
  shouldOptimisticallyRelease: boolean;
}): boolean {
  return !args.shouldOptimisticallyRelease || args.currentOperationId === args.operationId;
}
