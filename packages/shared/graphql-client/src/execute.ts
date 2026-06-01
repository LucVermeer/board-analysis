import type { Client } from 'graphql-ws';
import { GraphQLOperationError } from './errors';
import { getOperationName } from './operation-name';
import { MUTATION_TIMEOUT_MS } from './constants';

/**
 * Execute a GraphQL mutation (or one-shot query) over a graphql-ws client.
 *
 * graphql-ws models everything as subscriptions: a mutation emits one `next`
 * payload, then `complete`. We resolve with the captured payload on
 * `complete`, reject on `error`, and apply a wall-clock timeout to keep the
 * caller from hanging if the connection is wedged. Caller can pass a custom
 * `timeoutMs` for long-running queries.
 */
export function execute<TData = unknown, TVariables = Record<string, unknown>>(
  client: Client,
  operation: { query: string; variables?: TVariables },
  timeoutMs: number = MUTATION_TIMEOUT_MS,
): Promise<TData> {
  const opName = getOperationName(operation, 'mutation');

  return new Promise<TData>((resolve, reject) => {
    let result: TData | undefined;
    let hasResolved = false;
    let unsubscribe: (() => void) | undefined;

    const timer = setTimeout(() => {
      settle(() => reject(new Error(`GraphQL mutation '${opName}' timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    function settle(fn: () => void) {
      if (hasResolved) return;
      hasResolved = true;
      clearTimeout(timer);
      unsubscribe?.();
      fn();
    }

    unsubscribe = client.subscribe<TData>(
      { query: operation.query, variables: operation.variables as Record<string, unknown> },
      {
        next: (data) => {
          if ('data' in data) {
            result = data.data as TData;
          }
          if (data.errors) {
            const errors = data.errors;
            settle(() => reject(new GraphQLOperationError(errors)));
          }
        },
        error: (err) => {
          settle(() => {
            // graphql-ws also reports server-emitted GraphQL errors through the
            // error callback when the server closes the stream with them (e.g.
            // single-error mutation rejects). Preserve extensions in that path
            // too, otherwise fall back to a generic Error.
            if (Array.isArray(err) && err.length > 0 && typeof err[0]?.message === 'string') {
              reject(new GraphQLOperationError(err));
            } else if (err instanceof Error) {
              reject(err);
            } else {
              reject(new Error(String(err)));
            }
          });
        },
        complete: () => {
          settle(() => {
            if (result === undefined) {
              reject(new Error(`GraphQL operation '${opName}' completed without data`));
              return;
            }
            resolve(result);
          });
        },
      },
    );
  });
}
