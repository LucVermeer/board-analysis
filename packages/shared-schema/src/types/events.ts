/**
 * Event types for GraphQL subscriptions
 *
 * ## Type Aliasing Strategy
 *
 * There are TWO event types due to GraphQL union type constraints:
 *
 * 1. `QueueEvent` - Server-side type using `item` field. Used by backend PubSub
 *    and for eventsReplay query responses.
 *
 * 2. `SubscriptionQueueEvent` - Client-side type using aliased fields (`addedItem`,
 *    `currentItem`). Required because GraphQL doesn't allow the same field name
 *    with different nullability in a union (QueueItemAdded.item is non-null,
 *    CurrentClimbChanged.item is nullable).
 */

import type { ClimbQueueItem, QueueState } from './queue';
import type { SessionUser } from './session';
import type { SessionFeedParticipant, SessionGradeDistributionItem, SessionDetailTick } from './activity-feed';

// Response for delta sync event replay (Phase 2). Backend resolvers publish
// QueueEvent objects, while GraphQL clients receive aliased subscription-shaped
// payloads from the EVENTS_REPLAY operation.
export type EventsReplayResponse = {
  events: ReplayQueueEvent[];
  currentSequence: number;
};

export type ReplayQueueEvent = QueueEvent | SubscriptionQueueEvent;

// Server-side event type - uses actual GraphQL field names
export type QueueEvent =
  | { __typename: 'FullSync'; sequence: number; state: QueueState }
  | {
      __typename: 'QueueItemAdded';
      sequence: number;
      stateHash: string;
      item: ClimbQueueItem;
      position?: number | null;
    }
  | { __typename: 'QueueItemRemoved'; sequence: number; stateHash: string; uuid: string }
  | {
      __typename: 'QueueReordered';
      sequence: number;
      stateHash: string;
      uuid: string;
      oldIndex: number;
      newIndex: number;
    }
  | {
      __typename: 'CurrentClimbChanged';
      sequence: number;
      stateHash: string;
      item: ClimbQueueItem | null;
      clientId: string | null;
      correlationId: string | null;
    }
  | { __typename: 'ClimbMirrored'; sequence: number; stateHash: string; uuid?: string | null; mirrored: boolean };

// Client-side subscription event type - uses aliased field names to avoid GraphQL union conflicts
export type SubscriptionQueueEvent =
  | { __typename: 'FullSync'; sequence: number; state: QueueState }
  | {
      __typename: 'QueueItemAdded';
      sequence: number;
      stateHash: string;
      addedItem: ClimbQueueItem;
      position?: number | null;
    }
  | { __typename: 'QueueItemRemoved'; sequence: number; stateHash: string; uuid: string }
  | {
      __typename: 'QueueReordered';
      sequence: number;
      stateHash: string;
      uuid: string;
      oldIndex: number;
      newIndex: number;
    }
  | {
      __typename: 'CurrentClimbChanged';
      sequence: number;
      stateHash: string;
      currentItem: ClimbQueueItem | null;
      clientId: string | null;
      correlationId: string | null;
    }
  | {
      __typename: 'ClimbMirrored';
      sequence: number;
      stateHash: string;
      mirroredUuid?: string | null;
      mirrored: boolean;
    };

export type SessionEvent =
  | { __typename: 'UserJoined'; user: SessionUser }
  | { __typename: 'UserLeft'; userId: string }
  | { __typename: 'UserPresenceChanged'; user: SessionUser }
  | { __typename: 'LeaderChanged'; leaderId: string; leaderConnectionId?: string | null }
  | { __typename: 'SessionEnded'; reason: string; newPath?: string }
  | {
      __typename: 'SessionStatsUpdated';
      sessionId: string;
      totalSends: number;
      totalFlashes: number;
      totalAttempts: number;
      tickCount: number;
      participants: SessionFeedParticipant[];
      gradeDistribution: SessionGradeDistributionItem[];
      boardTypes: string[];
      hardestGrade?: string | null;
      durationMinutes?: number | null;
      goal?: string | null;
      ticks: SessionDetailTick[];
    };

export type ConnectionContext = {
  connectionId: string;
  // Transport that produced this context. Resolvers branch on this for
  // HTTP-vs-WebSocket behaviour; avoid grepping `connectionId.startsWith(...)`
  // which is fragile to id-format changes. Optional for test contexts that
  // don't care which transport they emulate; production paths always set it.
  transport?: 'http' | 'ws';
  sessionId?: string;
  participantId?: string;
  userId?: string;
  isAuthenticated?: boolean;
  // Client IP for rate limiting anonymous HTTP requests
  clientIp?: string;
  // Controller-specific context (set when using API key auth)
  controllerId?: string;
  controllerApiKey?: string;
  controllerMac?: string; // Controller's MAC address (used as clientId for BLE disconnect logic)
};
