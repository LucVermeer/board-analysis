import { describe, expect, it } from 'vitest';
import { getPostgresConstraintName, getPostgresErrorCode, isUniqueViolation } from '../utils/postgres-errors';

function makePostgresError(constraintField: 'constraint' | 'constraint_name'): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint "user_boards_unique_slug"'), {
    code: '23505',
    [constraintField]: 'user_boards_unique_slug',
  });
}

// Shape thrown by drizzle-orm >= 0.44: a DrizzleQueryError wrapping the
// original driver error on `cause`, with no code/constraint of its own.
function wrapLikeDrizzle(driverError: Error): Error {
  return Object.assign(new Error('Failed query: insert into "user_boards" ...'), {
    cause: driverError,
  });
}

describe('postgres-errors', () => {
  it('matches a bare PostgresError (postgres.js constraint_name field)', () => {
    const bareError = makePostgresError('constraint_name');
    expect(getPostgresErrorCode(bareError)).toBe('23505');
    expect(getPostgresConstraintName(bareError)).toBe('user_boards_unique_slug');
    expect(isUniqueViolation(bareError, 'user_boards_unique_slug')).toBe(true);
  });

  it('matches a bare PostgresError (node-postgres constraint field)', () => {
    const bareError = makePostgresError('constraint');
    expect(isUniqueViolation(bareError, 'user_boards_unique_slug')).toBe(true);
  });

  it('unwraps a DrizzleQueryError-style wrapper via the cause chain', () => {
    const wrappedError = wrapLikeDrizzle(makePostgresError('constraint_name'));
    expect(getPostgresErrorCode(wrappedError)).toBe('23505');
    expect(getPostgresConstraintName(wrappedError)).toBe('user_boards_unique_slug');
    expect(isUniqueViolation(wrappedError, 'user_boards_unique_slug')).toBe(true);
    expect(isUniqueViolation(wrappedError)).toBe(true);
  });

  it('unwraps a doubly-nested cause chain', () => {
    const doublyWrapped = wrapLikeDrizzle(wrapLikeDrizzle(makePostgresError('constraint_name')));
    expect(isUniqueViolation(doublyWrapped, 'user_boards_unique_slug')).toBe(true);
  });

  it('rejects a different constraint name', () => {
    const wrappedError = wrapLikeDrizzle(makePostgresError('constraint_name'));
    expect(isUniqueViolation(wrappedError, 'user_boards_unique_owner_serial')).toBe(false);
  });

  it('rejects non-unique-violation codes', () => {
    const foreignKeyError = Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
    expect(isUniqueViolation(wrapLikeDrizzle(foreignKeyError))).toBe(false);
  });

  it('handles non-error inputs and cyclic cause chains without hanging', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('duplicate key')).toBe(false);
    const cyclic: Record<string, unknown> = { message: 'wrapper' };
    cyclic.cause = cyclic;
    expect(isUniqueViolation(cyclic)).toBe(false);
  });
});
