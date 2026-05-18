// GraphQL Queue - New graphql-ws based queue management
export { createGraphQLClient, execute, subscribe } from './graphql-client';
export type { Client } from './graphql-client';

export {
  GraphQLQueueProvider,
  useGraphQLQueueContext,
  useQueueContext,
  useOptionalQueueContext,
  useQueueActions,
  useOptionalQueueActions,
  QueueContext,
  QueueActionsContext,
  // `QueueDataContext` is a test-only alias for `QueueContext` (see
  // QueueContext.tsx). Kept exported so the queue-bridge tests compile.
  QueueDataContext,
  // Fine-grained hooks for targeted subscriptions
  useCurrentClimb,
  useOptionalCurrentClimb,
  useCurrentClimbUuid,
  useQueueList,
  useSearchData,
  useSessionData,
  useOptionalSessionData,
  // Fine-grained context objects
  CurrentClimbContext,
  CurrentClimbUuidContext,
  QueueListContext,
  SearchContext,
  SessionContext,
} from './QueueContext';
export type { GraphQLQueueContextType, GraphQLQueueActionsType, GraphQLQueueDataType } from './types';
export type { CurrentClimbDataType, QueueListDataType, SearchDataType, SessionDataType } from './types';
