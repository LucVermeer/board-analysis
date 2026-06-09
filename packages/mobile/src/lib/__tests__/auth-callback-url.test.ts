import { describe, expect, it } from 'vitest';
import { parseAuthCallbackParams } from '../auth-callback-url';

describe('parseAuthCallbackParams', () => {
  it('extracts the transfer token from a successful callback URL', () => {
    expect(parseAuthCallbackParams('com.boardsesh.app://auth/callback?transferToken=abc123&next=%2F')).toEqual({
      transferToken: 'abc123',
      error: null,
    });
  });

  it('decodes a percent-encoded transfer token', () => {
    expect(
      parseAuthCallbackParams('com.boardsesh.app://auth/callback?transferToken=a%2Bb%3D%3D&next=%2Fclimbs'),
    ).toEqual({ transferToken: 'a+b==', error: null });
  });

  it('extracts the server error param when no token was issued', () => {
    expect(parseAuthCallbackParams('com.boardsesh.app://auth/callback?error=session_missing')).toEqual({
      transferToken: null,
      error: 'session_missing',
    });
  });

  it('returns nulls when the URL has no query string', () => {
    expect(parseAuthCallbackParams('com.boardsesh.app://auth/callback')).toEqual({
      transferToken: null,
      error: null,
    });
  });

  it('ignores a fragment after the query string', () => {
    expect(parseAuthCallbackParams('com.boardsesh.app://auth/callback?transferToken=abc#frag')).toEqual({
      transferToken: 'abc',
      error: null,
    });
  });

  it('skips malformed percent-encoded pairs instead of throwing', () => {
    expect(parseAuthCallbackParams('com.boardsesh.app://auth/callback?error=%E0%A4%A&transferToken=ok')).toEqual({
      transferToken: 'ok',
      error: null,
    });
  });
});
