import { GraphQLError } from 'graphql';

/**
 * Board presence is gated behind an env flag while the epic is in flight.
 * Every mutation, query, and subscribe entry point calls this first so the
 * feature is fully dark (not just hidden in the UI) until we flip it on.
 */
export function requireBoardPresenceEnabled(): void {
  if (process.env.BOARD_PRESENCE_ENABLED !== 'true') {
    throw new GraphQLError('Board presence is not enabled');
  }
}

/**
 * Validate the `boardId` argument is a positive integer. The SDL types it as
 * `Int!`, but GraphQL won't reject 0/negative/float-coerced values, and a
 * bogus id would key a presence channel nobody else is on.
 */
export function assertValidBoardId(boardId: number): number {
  if (!Number.isInteger(boardId) || boardId <= 0) {
    throw new GraphQLError('boardId must be a positive integer');
  }
  return boardId;
}
