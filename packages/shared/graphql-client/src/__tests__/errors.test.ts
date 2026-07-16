import { describe, it, expect } from 'vitest';
import { GraphQLOperationError, parseRateLimitError, isRateLimitedError } from '../errors';

describe('parseRateLimitError', () => {
  it('reads retryAfterSeconds from the structured RATE_LIMITED extension', () => {
    const error = new GraphQLOperationError([
      {
        message: 'Rate limit exceeded. Try again in 4 seconds.',
        extensions: { code: 'RATE_LIMITED', retryAfterSeconds: 4 },
      },
    ]);
    expect(parseRateLimitError(error)).toEqual({ retryAfterSeconds: 4 });
    expect(isRateLimitedError(error)).toBe(true);
  });

  it('finds a RATE_LIMITED error even when it is not the first in the array', () => {
    const error = new GraphQLOperationError([
      { message: 'other' },
      {
        message: 'Rate limit exceeded. Try again in 9 seconds.',
        extensions: { code: 'RATE_LIMITED', retryAfterSeconds: 9 },
      },
    ]);
    expect(parseRateLimitError(error)).toEqual({ retryAfterSeconds: 9 });
  });

  it('falls back to the message when there is no extension code (legacy server)', () => {
    const error = new GraphQLOperationError([{ message: 'Rate limit exceeded. Try again in 6 seconds.' }]);
    expect(parseRateLimitError(error)).toEqual({ retryAfterSeconds: 6 });
  });

  it('parses a plain Error whose message matches the rate-limit shape', () => {
    expect(parseRateLimitError(new Error('Rate limit exceeded. Try again in 2 seconds.'))).toEqual({
      retryAfterSeconds: 2,
    });
  });

  it('returns null for a non-rate-limit GraphQL error', () => {
    const error = new GraphQLOperationError([{ message: 'nope', extensions: { code: 'BAD_USER_INPUT' } }]);
    expect(parseRateLimitError(error)).toBeNull();
    expect(isRateLimitedError(error)).toBe(false);
  });

  it('returns null for unrelated errors and non-errors', () => {
    expect(parseRateLimitError(new Error('network down'))).toBeNull();
    expect(parseRateLimitError('rate limit exceeded. try again in 1 seconds.')).toBeNull();
    expect(parseRateLimitError(null)).toBeNull();
  });
});
