import { describe, expect, it } from 'vite-plus/test';
import { extractGraphQLErrorMessage } from '../extract-error-message';

describe('extractGraphQLErrorMessage', () => {
  it('returns the first error message from a graphql-request ClientError shape', () => {
    const error = Object.assign(new Error('GraphQL Error'), {
      response: {
        errors: [{ message: 'This Instagram post is already attached to "Cut to the Chase".' }],
      },
    });
    expect(extractGraphQLErrorMessage(error)).toBe('This Instagram post is already attached to "Cut to the Chase".');
  });

  it('picks the first error when multiple are returned', () => {
    const error = {
      response: {
        errors: [{ message: 'first message' }, { message: 'second message' }],
      },
    };
    expect(extractGraphQLErrorMessage(error)).toBe('first message');
  });

  it('returns null for plain Error instances (no response field)', () => {
    expect(extractGraphQLErrorMessage(new Error('network down'))).toBeNull();
  });

  it('returns null when response is missing or not an object', () => {
    expect(extractGraphQLErrorMessage({ response: null })).toBeNull();
    expect(extractGraphQLErrorMessage({ response: 'oops' })).toBeNull();
    expect(extractGraphQLErrorMessage({})).toBeNull();
  });

  it('returns null when response.errors is missing or not an array', () => {
    expect(extractGraphQLErrorMessage({ response: {} })).toBeNull();
    expect(extractGraphQLErrorMessage({ response: { errors: null } })).toBeNull();
    expect(extractGraphQLErrorMessage({ response: { errors: 'not-an-array' } })).toBeNull();
  });

  it('returns null when errors array is empty', () => {
    expect(extractGraphQLErrorMessage({ response: { errors: [] } })).toBeNull();
  });

  it('returns null when the first error has no message field', () => {
    expect(extractGraphQLErrorMessage({ response: { errors: [{ code: 'X' }] } })).toBeNull();
    expect(extractGraphQLErrorMessage({ response: { errors: [null] } })).toBeNull();
  });

  it('returns null when message exists but is not a non-empty string', () => {
    expect(extractGraphQLErrorMessage({ response: { errors: [{ message: '' }] } })).toBeNull();
    expect(extractGraphQLErrorMessage({ response: { errors: [{ message: 42 }] } })).toBeNull();
  });

  it('returns null for primitive/null/undefined inputs', () => {
    expect(extractGraphQLErrorMessage(null)).toBeNull();
    expect(extractGraphQLErrorMessage(undefined)).toBeNull();
    expect(extractGraphQLErrorMessage('string error')).toBeNull();
    expect(extractGraphQLErrorMessage(42)).toBeNull();
  });
});
