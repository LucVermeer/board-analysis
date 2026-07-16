/**
 * Tests for the targeted graphql-yoga maskError (issues #3183 / #3603).
 *
 * The mask sanitizes ONLY raw database errors — drizzle's "Failed query: ..."
 * wrapper or anything carrying a PostgresError code — so internal SQL never
 * reaches clients, while every other error (including intentional GraphQLErrors
 * with a stable extensions.code) passes through untouched.
 */

import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { GraphQLError } from 'graphql';
import { isDatabaseLeakError, maskDatabaseError } from '../graphql/mask-error';
import { markErrorReported, wasErrorReported } from '../utils/sentry-dedupe';

const { sentryCaptureMock } = vi.hoisted(() => ({ sentryCaptureMock: vi.fn() }));
vi.mock('@sentry/node', () => ({ captureException: sentryCaptureMock }));

function makePgError(code: string): Error {
  return Object.assign(new Error('canceling statement due to statement timeout'), { code });
}

function makeDrizzleError(cause: Error): Error {
  return Object.assign(new Error('Failed query: select "id" from "users" where "users"."id" = $1'), { cause });
}

describe('isDatabaseLeakError', () => {
  it('flags a bare drizzle "Failed query:" error', () => {
    expect(isDatabaseLeakError(makeDrizzleError(makePgError('57014')))).toBe(true);
  });

  it('flags a located GraphQLError wrapping a drizzle error', () => {
    const drizzle = makeDrizzleError(makePgError('40P01'));
    const located = new GraphQLError(drizzle.message, { originalError: drizzle });
    expect(isDatabaseLeakError(located)).toBe(true);
  });

  it('flags a bare PostgresError by its code even without the SQL prefix', () => {
    expect(isDatabaseLeakError(makePgError('23505'))).toBe(true);
  });

  it('does not flag an intentional GraphQLError with an extensions code', () => {
    expect(isDatabaseLeakError(new GraphQLError('Rate limited', { extensions: { code: 'RATE_LIMITED' } }))).toBe(false);
  });

  it('does not flag a plain resolver Error', () => {
    expect(isDatabaseLeakError(new Error('Board not found'))).toBe(false);
  });
});

describe('maskDatabaseError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces a DB-cause error with a generic, SQL-free GraphQLError', () => {
    const pgError = makePgError('57014');
    const drizzle = makeDrizzleError(pgError);
    const located = new GraphQLError(drizzle.message, { originalError: drizzle });

    const masked = maskDatabaseError(located);

    expect(masked).toBeInstanceOf(GraphQLError);
    expect(masked.message).not.toMatch(/select|Failed query|users/i);
    expect((masked as GraphQLError).extensions?.code).toBe('INTERNAL_SERVER_ERROR');

    // Captured the real pg cause with the code as a tag, and marked reported.
    expect(sentryCaptureMock).toHaveBeenCalledTimes(1);
    expect(sentryCaptureMock).toHaveBeenCalledWith(
      pgError,
      expect.objectContaining({ tags: expect.objectContaining({ source: 'graphql-yoga-mask', pgCode: '57014' }) }),
    );
    expect(wasErrorReported(located)).toBe(true);
  });

  it('does not re-capture an error already marked reported (idempotent / prior capture)', () => {
    // Guards the mask's own idempotency: if the same error passes through
    // maskError twice (envelop plugin + handleError), or a resolver already
    // captured and marked the raw DB error, the second pass must not re-report.
    const drizzle = makeDrizzleError(makePgError('57014'));
    markErrorReported(drizzle);

    maskDatabaseError(drizzle);

    expect(sentryCaptureMock).not.toHaveBeenCalled();
  });

  it('passes an intentional GraphQLError through unchanged', () => {
    const intentional = new GraphQLError('Rate limited', { extensions: { code: 'RATE_LIMITED' } });

    const masked = maskDatabaseError(intentional);

    expect(masked).toBe(intentional);
    expect(sentryCaptureMock).not.toHaveBeenCalled();
  });

  it('passes a plain resolver Error through with its message intact', () => {
    const plain = new Error('Board not found');

    const masked = maskDatabaseError(plain);

    expect(masked).toBe(plain);
    expect(masked.message).toBe('Board not found');
    expect(sentryCaptureMock).not.toHaveBeenCalled();
  });
});
