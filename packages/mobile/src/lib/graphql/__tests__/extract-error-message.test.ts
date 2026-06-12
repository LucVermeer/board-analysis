import { describe, expect, it } from 'vitest';
import { extractGraphqlMessage, isGraphqlRateLimitedError } from '../extract-error-message';

describe('GraphQL error extraction', () => {
  it('extracts the first graphql-request response message', () => {
    const error = {
      response: {
        errors: [{ message: 'Server guidance' }],
      },
    };

    expect(extractGraphqlMessage(error)).toBe('Server guidance');
  });

  it('detects RATE_LIMITED graphql-request response errors', () => {
    const error = {
      response: {
        errors: [
          {
            message: 'Rate limit exceeded. Try again in 7 seconds.',
            extensions: { code: 'RATE_LIMITED', operation: 'createSession', retryAfterSeconds: 7 },
          },
        ],
      },
    };

    expect(isGraphqlRateLimitedError(error)).toBe(true);
  });

  it('detects RATE_LIMITED operation errors with direct extensions', () => {
    const error = {
      extensions: { code: 'RATE_LIMITED', retryAfterSeconds: 3 },
    };

    expect(isGraphqlRateLimitedError(error)).toBe(true);
  });

  it('ignores non-rate-limit GraphQL errors', () => {
    const error = {
      response: {
        errors: [{ message: 'Nope', extensions: { code: 'UNAUTHENTICATED' } }],
      },
    };

    expect(isGraphqlRateLimitedError(error)).toBe(false);
  });
});
