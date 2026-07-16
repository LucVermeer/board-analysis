import { GraphQLError } from 'graphql';
import * as Sentry from '@sentry/node';
import { getPostgresErrorCode } from '../utils/postgres-errors';
import { markErrorReported, wasErrorReported } from '../utils/sentry-dedupe';

// drizzle-orm surfaces a driver failure as an Error whose message is the raw
// SQL ("Failed query: select ...") with the real PostgresError on `.cause`.
// graphql-js then wraps the resolver throw, so the leaking text can arrive as
// the top-level error or on its GraphQL `originalError`.
const FAILED_QUERY_PREFIX = 'Failed query:';

function getOriginalError(error: unknown): unknown {
  if (error && typeof error === 'object' && 'originalError' in error) {
    return (error as { originalError?: unknown }).originalError;
  }
  return undefined;
}

function messageLeaksQuery(error: unknown): boolean {
  return error instanceof Error && typeof error.message === 'string' && error.message.startsWith(FAILED_QUERY_PREFIX);
}

/**
 * True when this error (or its GraphQL `originalError`) is a raw database/driver
 * failure whose message would leak SQL to the client — either drizzle's
 * "Failed query: ..." wrapper or anything carrying a PostgresError code on its
 * cause chain.
 */
export function isDatabaseLeakError(error: unknown): boolean {
  for (const candidate of [error, getOriginalError(error)]) {
    if (candidate === undefined || candidate === null) continue;
    if (messageLeaksQuery(candidate)) return true;
    if (getPostgresErrorCode(candidate) !== undefined) return true;
  }
  return false;
}

function unwrapCause(error: unknown): unknown {
  const original = getOriginalError(error) ?? error;
  if (original instanceof Error && original.cause !== undefined && original.cause !== null) {
    return original.cause;
  }
  return original;
}

/**
 * graphql-yoga `maskError` that sanitizes ONLY the raw-database-error class so
 * internal SQL and schema never reach clients (issue #3183), while every other
 * error passes through untouched.
 *
 * We deliberately do NOT flip on global masking: that would turn the many
 * intentional `throw new Error(message)` sites across the resolvers into a
 * useless generic string for clients. This targeted mask fixes the info-leak
 * without that regression.
 *
 * The real cause is captured to Sentry (deduped against a resolver-level catch
 * that may have already reported it), then a generic GraphQLError is returned.
 */
export function maskDatabaseError(error: unknown): Error {
  if (isDatabaseLeakError(error)) {
    if (!wasErrorReported(error)) {
      // Resolve the pg code through the GraphQL `originalError` wrapper too, so
      // it lands on the tag even when the top-level error is the located
      // GraphQLError (whose own cause chain doesn't reach the driver error).
      const pgCode = getPostgresErrorCode(getOriginalError(error) ?? error);
      Sentry.captureException(unwrapCause(error), {
        tags: { source: 'graphql-yoga-mask', pgCode: pgCode ?? 'unknown' },
      });
      markErrorReported(error);
    }
    return new GraphQLError('Something went wrong on our end. Please try again.', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }

  // Not a DB leak — preserve the pre-existing pass-through behaviour so
  // intentional resolver messages still reach the client verbatim.
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new GraphQLError(error);
  return new GraphQLError(String(error));
}
