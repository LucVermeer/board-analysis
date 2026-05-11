import { describe, it, expect } from 'vite-plus/test';
import { isAbortError } from '@/app/lib/is-abort-error';

describe('isAbortError', () => {
  it('returns true for a DOMException-shaped AbortError', () => {
    const error = new DOMException('The user aborted a request.', 'AbortError');
    expect(isAbortError(error)).toBe(true);
  });

  it('returns true for a plain Error whose name is AbortError', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(isAbortError(error)).toBe(true);
  });

  it('returns true when an AbortError is wrapped on `cause`', () => {
    const cause = new DOMException('Aborted', 'AbortError');
    const wrapped = new Error('Failed to fetch user ticks', { cause });
    expect(isAbortError(wrapped)).toBe(true);
  });

  it('returns true when an AbortError is nested two levels deep on `cause`', () => {
    const innerAbort = new DOMException('Aborted', 'AbortError');
    const middle = new Error('graphql request failed', { cause: innerAbort });
    const outer = new Error('useProfileData failed', { cause: middle });
    expect(isAbortError(outer)).toBe(true);
  });

  it('returns false for a generic Error', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
  });

  it('returns false for a TypeError (e.g. "Failed to fetch")', () => {
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(42)).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError({ name: 'AbortError', message: 'aborted' })).toBe(false);
  });

  it('returns false when the `cause` chain bottoms out at a non-abort error', () => {
    const inner = new Error('database is down');
    const outer = new Error('graphql request failed', { cause: inner });
    expect(isAbortError(outer)).toBe(false);
  });

  it('terminates safely on a self-referential cause chain', () => {
    const error = new Error('looping');
    (error as { cause?: unknown }).cause = error;
    expect(isAbortError(error)).toBe(false);
  });
});
