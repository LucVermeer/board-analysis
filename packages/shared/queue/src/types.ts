/**
 * Pure queue state machine types. No React, no DOM, no web-specific imports.
 *
 * Types that already exist in @boardsesh/shared-schema (Climb, ClimbQueueItem,
 * QueueItemUser) are re-exported from there. Web-specific types like
 * QueueContextType, QueueDataType, and QueueActionsType stay in the web app.
 */

// Re-export shared types that the queue state machine uses
export type { Climb, ClimbQueueItem, QueueItemUser } from '@boardsesh/shared-schema';

import type { Climb, ClimbQueueItem } from '@boardsesh/shared-schema';

export type ClimbQueue = ClimbQueueItem[];

export type AddToQueueSource = 'search' | 'playlist' | 'climb_detail' | 'peer_broadcast' | 'unknown';

export type PeerId = string | null;
export type UserName = PeerId;

export type PlaylistSuggestionSource = {
  playlistUuid: string;
  activatedClimbUuid: string;
  boardKey: string;
  climbs: Climb[];
};

export type SetCurrentClimbOptions = {
  playlistSuggestionSource: PlaylistSuggestionSource | null;
};

/**
 * Minimal search parameters interface used by the queue state machine.
 * The full SearchRequestPagination type lives in the web app; the reducer
 * only stores it opaquely, so this record-based interface is sufficient
 * for any runtime that passes search params through the queue.
 */
export type QueueSearchParams = Record<string, unknown>;

export type QueueState = {
  queue: ClimbQueue;
  currentClimbQueueItem: ClimbQueueItem | null;
  climbSearchParams: QueueSearchParams;
  playlistSuggestionSource: PlaylistSuggestionSource | null;
  hasDoneFirstFetch: boolean;
  initialQueueDataReceivedFromPeers: boolean;
  // Track locally-initiated current climb updates by correlation ID to skip server echoes
  // Correlation IDs enable precise echo detection without time-based logic in the reducer
  pendingCurrentClimbUpdates: string[];
  // Sequence tracking for gap detection and state verification
  lastReceivedSequence: number | null;
  lastReceivedStateHash: string | null;
  // Flag to indicate corrupted data was filtered and a resync is needed
  needsResync: boolean;
  // Optimistic driver participant id, used between `takeControl` firing and the
  // server's `DriverChanged` broadcast landing. When set, the QueueContext
  // prefers this over `persistentSession.driverParticipantId` so the lightbulb
  // flips visual state instantly. Cleared on the next `DriverChanged` event
  // (idempotent if the server agrees; corrects the UI if we lost a race).
  optimisticDriverParticipantId: string | null;
};

export type QueueAction =
  | { type: 'ADD_TO_QUEUE'; payload: ClimbQueueItem }
  | { type: 'REMOVE_FROM_QUEUE'; payload: ClimbQueueItem[] }
  | { type: 'SET_CURRENT_CLIMB'; payload: ClimbQueueItem }
  | { type: 'SET_CURRENT_CLIMB_QUEUE_ITEM'; payload: ClimbQueueItem }
  | { type: 'SET_CLIMB_SEARCH_PARAMS'; payload: QueueSearchParams }
  | {
      type: 'UPDATE_QUEUE';
      payload: { queue: ClimbQueue; currentClimbQueueItem?: ClimbQueueItem | null };
    }
  | {
      type: 'INITIAL_QUEUE_DATA';
      payload: { queue: ClimbQueue; currentClimbQueueItem?: ClimbQueueItem | null };
    }
  | { type: 'SET_FIRST_FETCH'; payload: boolean }
  | { type: 'MIRROR_CLIMB' }
  // Delta-specific actions
  | { type: 'DELTA_ADD_QUEUE_ITEM'; payload: { item: ClimbQueueItem; position?: number } }
  | { type: 'DELTA_REMOVE_QUEUE_ITEM'; payload: { uuid: string } }
  | {
      type: 'DELTA_REORDER_QUEUE_ITEM';
      payload: { uuid: string; oldIndex: number; newIndex: number };
    }
  | {
      type: 'DELTA_UPDATE_CURRENT_CLIMB';
      payload: {
        item: ClimbQueueItem | null;
        shouldAddToQueue?: boolean;
        insertAfterCurrent?: boolean;
        isServerEvent?: boolean;
        eventClientId?: string;
        myClientId?: string;
        correlationId?: string;
        serverCorrelationId?: string;
        playlistSuggestionSource?: PlaylistSuggestionSource | null;
      };
    }
  | { type: 'DELTA_MIRROR_CURRENT_CLIMB'; payload: { mirrored: boolean; mirroredUuid: string | null } }
  | { type: 'DELTA_REPLACE_QUEUE_ITEM'; payload: { uuid: string; item: ClimbQueueItem } }
  | { type: 'SET_PLAYLIST_SUGGESTION_SOURCE'; payload: PlaylistSuggestionSource | null }
  | { type: 'REFRESH_PLAYLIST_SUGGESTION_SOURCE'; payload: PlaylistSuggestionSource }
  | { type: 'CLEANUP_PENDING_UPDATE'; payload: { correlationId: string } }
  | { type: 'CLEANUP_PENDING_UPDATES_BATCH'; payload: { correlationIds: string[] } }
  | { type: 'CLEAR_RESYNC_FLAG' }
  // Optimistic driver claim — applied immediately when the local user fires
  // `takeControl`, cleared on the authoritative `DriverChanged` broadcast.
  // Lets the bar/drawer lightbulb flip visual state before the server round-trip.
  | { type: 'OPTIMISTIC_SET_DRIVER'; payload: { participantId: string } }
  | { type: 'OPTIMISTIC_CLEAR_DRIVER' };
