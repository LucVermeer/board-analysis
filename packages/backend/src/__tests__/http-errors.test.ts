import { describe, expect, it } from 'vitest';
import { isClientAbortError } from '../utils/http-errors';

describe('isClientAbortError', () => {
  it('detects ECONNRESET aborts', () => {
    const abortError = Object.assign(new Error('aborted'), { code: 'ECONNRESET' });

    expect(isClientAbortError(abortError)).toBe(true);
  });

  it('detects nested abort causes', () => {
    const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const wrappedError = new Error('request failed', { cause });

    expect(isClientAbortError(wrappedError)).toBe(true);
  });

  it('leaves normal handler errors alone', () => {
    expect(isClientAbortError(new Error('database unavailable'))).toBe(false);
  });
});
