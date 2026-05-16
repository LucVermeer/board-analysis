import type { Climb, SearchRequestPagination, ParsedBoardRouteParameters } from '@/app/lib/types';
import type { SessionUser } from '@boardsesh/shared-schema';
import type { ConnectionState } from '../connection-manager/websocket-connection-manager';

export type PeerId = string | null;
export type UserName = PeerId;

export type QueueItemUser = {
  id: string;
  username: string;
  avatarUrl?: string;
};

export type ClimbQueueItem = {
  addedBy?: UserName;
  addedByUser?: QueueItemUser;
  tickedBy?: UserName[];
  climb: Climb;
  uuid: string;
  suggested?: boolean;
};

export type ClimbQueue = ClimbQueueItem[];

export type QueueState = {
  queue: ClimbQueue;
  currentClimbQueueItem: ClimbQueueItem | null;
  climbSearchParams: SearchRequestPagination;
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
};

export type QueueAction =
  | { type: 'ADD_TO_QUEUE'; payload: ClimbQueueItem }
  | { type: 'REMOVE_FROM_QUEUE'; payload: ClimbQueueItem[] }
  | { type: 'SET_CURRENT_CLIMB'; payload: ClimbQueueItem }
  | { type: 'SET_CURRENT_CLIMB_QUEUE_ITEM'; payload: ClimbQueueItem }
  | { type: 'SET_CLIMB_SEARCH_PARAMS'; payload: SearchRequestPagination }
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
      };
    }
  | { type: 'DELTA_MIRROR_CURRENT_CLIMB'; payload: { mirrored: boolean; mirroredUuid: string | null } }
  | { type: 'DELTA_REPLACE_QUEUE_ITEM'; payload: { uuid: string; item: ClimbQueueItem } }
  | { type: 'CLEANUP_PENDING_UPDATE'; payload: { correlationId: string } }
  | { type: 'CLEANUP_PENDING_UPDATES_BATCH'; payload: { correlationIds: string[] } }
  | { type: 'CLEAR_RESYNC_FLAG' };

// Stable action functions — identity rarely changes
export type QueueActionsType = {
  addToQueue: (climb: Climb) => void;
  removeFromQueue: (item: ClimbQueueItem) => void;
  /** Sets the climb as current. Resolves to the freshly-created ClimbQueueItem
   *  so callers can capture its uuid (e.g. the create form tracks this uuid
   *  to later replace the item in place on subsequent saves). Resolves to
   *  null when validation fails or the mutation is guarded. */
  setCurrentClimb: (climb: Climb) => Promise<ClimbQueueItem | null>;
  setCurrentClimbQueueItem: (item: ClimbQueueItem) => void;
  /** Browse-initiated drawer open. In solo (no active party session) this is
   *  equivalent to setCurrentClimb + opening the play drawer — the climb is
   *  sent to the wall as today. In an active party session, this only opens
   *  the drawer locally with the tapped climb as a preview; it does not
   *  mutate state.currentClimbQueueItem and does not broadcast, so other
   *  party members are not yanked off the wall. The Set Active Climb menu
   *  action is the only browse-initiated path that broadcasts in party. */
  previewClimbFromBrowse: (climb: Climb) => void;
  /** Replace an existing queue item (by its queue-item uuid) with a new climb,
   *  preserving addedBy attribution. Used by the create form to keep the
   *  tracked queue item in sync as the user keeps editing a climb. */
  replaceQueueItem: (queueItemUuid: string, climb: Climb) => void;
  setClimbSearchParams: (params: SearchRequestPagination) => void;
  setCountSearchParams: (params: SearchRequestPagination) => void;
  mirrorClimb: () => void;
  fetchMoreClimbs: () => void;
  /** Returns the next ClimbQueueItem after `from` (defaults to the current
   *  wall climb). Walks the shared queue first, then falls through to
   *  suggested climbs once the queue is exhausted.
   *
   *  Pass `suggestionsOnly: true` to skip the shared queue entirely and walk
   *  only the suggested-climbs feed — the non-driver swipe path in party
   *  (the shared queue is "what the driver committed to," not a non-driver's
   *  browsing surface). */
  getNextClimbQueueItem: (options?: {
    from?: ClimbQueueItem | null;
    suggestionsOnly?: boolean;
  }) => ClimbQueueItem | null;
  /** Returns the previous ClimbQueueItem before `from` (defaults to the
   *  current wall climb). Default walks the queue only (no suggestions
   *  fall-through). With `suggestionsOnly: true`, walks `suggestedClimbs`
   *  backwards instead — used by the non-driver swipe-back path. */
  getPreviousClimbQueueItem: (options?: {
    from?: ClimbQueueItem | null;
    suggestionsOnly?: boolean;
  }) => ClimbQueueItem | null;
  setQueue: (queue: ClimbQueueItem[]) => void;
  disconnect?: () => void;
  /** Dispatch an optimistic current-climb update from a native widget navigation.
   *  The native WebSocket already sent the server mutation, so this only updates
   *  the local reducer state and registers the correlationId for echo suppression. */
  dispatchWidgetNavigation?: (item: ClimbQueueItem, correlationId: string) => void;
  /** Claim wall-control authority and optionally broadcast the given climb.
   *  Resolves to the persisted `ClimbQueueItem` when a climb was provided
   *  (matching the `setCurrentClimb` return shape), or `null` otherwise. In
   *  solo (no party) this degrades to the existing `setCurrentClimb` path. In
   *  party it sets `driverParticipantId` on the server, yanks control from
   *  whoever held it, and — when a climb is provided — also appends-and-sets
   *  it as the wall climb. The drawer's lightbulb (PR 2) and the bar's
   *  lightbulb (PR 3) call this. */
  takeControl: (climb?: Climb | null) => Promise<ClimbQueueItem | null>;
  /** Release wall-control authority. Idempotent — no-op when the local user
   *  isn't currently the driver. In solo, a no-op. */
  releaseControl: () => Promise<void>;
};

// Frequently-changing state data
export type QueueDataType = {
  queue: ClimbQueue;
  currentClimbQueueItem: ClimbQueueItem | null;
  currentClimb: Climb | null;
  climbSearchParams: SearchRequestPagination;
  climbSearchResults: Climb[] | null;
  suggestedClimbs: Climb[];
  totalSearchResultCount: number | null;
  hasMoreResults: boolean;
  isFetchingClimbs: boolean;
  isFetchingNextPage: boolean;
  hasDoneFirstFetch: boolean;
  viewOnlyMode: boolean;
  parsedParams: ParsedBoardRouteParameters;
  connectionState?: ConnectionState;
  canMutate?: boolean;
  users?: SessionUser[];
  clientId?: string | null;
  /** Local user's stable participant id for the current session, or null
   *  outside a session. Use this for comparisons against `driverParticipantId`
   *  or `SessionUser.id`. */
  participantId?: string | null;
  isLeader?: boolean;
  /** Participant id of the wall driver, or null when unclaimed (party only;
   *  always null in solo). */
  driverParticipantId?: string | null;
  /** Whether the local user currently drives the wall (true in solo; in party,
   *  true when local participant id matches `driverParticipantId`). */
  isDriver?: boolean;
  isBackendMode?: boolean;
  hasConnected?: boolean;
  connectionError?: Error | null;
  isDisconnected: boolean;
};

// Combined type for backward compatibility
export type QueueContextType = QueueDataType & QueueActionsType;
