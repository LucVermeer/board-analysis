// Mobile transport for the board-presence ("now on the wall") feature.
//
// A thin wrapper around the shared `createBoardPresenceClient` factory
// (`@boardsesh/board-presence-react`) — the operation strings, response
// unwrapping, and reconnect-catch-up semantics all live there now, shared with
// the web adapter (`packages/web/app/components/board-presence/board-presence-client.ts`),
// so a fix in one place lands on both platforms. This file only supplies the
// mobile graphql-ws `Client` (the same one the queue provider uses) as the
// three transport primitives the factory needs.
//
// Pass a getter (not the client itself) so the live client — which graphql-ws
// may dispose and recreate — is read at call time, matching
// `getClient: () => getWsClient()` in the queue provider.

import { type Client, execute, subscribe } from '@boardsesh/graphql-client';
import {
  createBoardPresenceClient,
  type BoardPresenceOperation,
  type BoardPresenceSink,
  type FullBoardPresenceClient,
  type SerialResolveArgs,
} from '@boardsesh/board-presence-react';

export type { SerialResolveArgs };

/**
 * The mobile board-presence client. Every method on `FullBoardPresenceClient`
 * is implemented by the shared factory, including the serial disambiguation
 * extension (`resolveBoardCandidatesForSerial`, `chooseBoardForSerial`) only
 * mobile's board picker calls today.
 */
export type MobileBoardPresenceClient = FullBoardPresenceClient;

/**
 * Build a `MobileBoardPresenceClient` over a mobile graphql-ws client.
 */
export function createMobileBoardPresenceClient(getClient: () => Client): MobileBoardPresenceClient {
  return createBoardPresenceClient({
    execute<TData>(operation: BoardPresenceOperation) {
      return execute<TData>(getClient(), operation);
    },
    subscribe<TData>(operation: BoardPresenceOperation, sink: BoardPresenceSink<TData>) {
      return subscribe<TData>(getClient(), operation, sink);
    },
    onConnected(callback: () => void) {
      return getClient().on('connected', callback);
    },
  });
}
