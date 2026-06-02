import { describe, it, expect } from 'vitest';
import { normalizeAscentStatus, pickHighestAscentStatus, type AscentStatusValue } from '../ascent-status-utils';

describe('normalizeAscentStatus', () => {
  it('returns the literal status when set', () => {
    expect(normalizeAscentStatus({ status: 'flash' })).toBe('flash');
    expect(normalizeAscentStatus({ status: 'send' })).toBe('send');
    expect(normalizeAscentStatus({ status: 'attempt' })).toBe('attempt');
  });

  it('ignores literal status when not a known value and falls through', () => {
    // @ts-expect-error — exercising the runtime guard for legacy callers
    expect(normalizeAscentStatus({ status: 'bogus', isAscent: true, tries: 1 })).toBe('flash');
  });

  it('flashes when ascended in one try', () => {
    expect(normalizeAscentStatus({ isAscent: true, tries: 1 })).toBe('flash');
  });

  it('sends when ascended in more than one try', () => {
    expect(normalizeAscentStatus({ isAscent: true, tries: 2 })).toBe('send');
    expect(normalizeAscentStatus({ isAscent: true, tries: 10 })).toBe('send');
  });

  it('sends when ascended without a tries count (unknown is not a flash)', () => {
    expect(normalizeAscentStatus({ isAscent: true })).toBe('send');
    expect(normalizeAscentStatus({ isAscent: true, tries: null })).toBe('send');
  });

  it('attempts when not ascended', () => {
    expect(normalizeAscentStatus({ isAscent: false })).toBe('attempt');
    expect(normalizeAscentStatus({})).toBe('attempt');
    expect(normalizeAscentStatus({ status: null })).toBe('attempt');
  });
});

describe('pickHighestAscentStatus', () => {
  it('returns null on an empty input', () => {
    expect(pickHighestAscentStatus([])).toBeNull();
  });

  it('picks flash over send and attempt', () => {
    expect(pickHighestAscentStatus(['attempt', 'send', 'flash'])).toBe('flash');
    expect(pickHighestAscentStatus(['flash', 'attempt'])).toBe('flash');
  });

  it('picks send over attempt when flash is absent', () => {
    expect(pickHighestAscentStatus(['attempt', 'send'])).toBe('send');
    expect(pickHighestAscentStatus(['send'])).toBe('send');
  });

  it('returns attempt only when nothing better is present', () => {
    expect(pickHighestAscentStatus(['attempt'])).toBe('attempt');
    expect(pickHighestAscentStatus(['attempt', 'attempt'])).toBe('attempt');
  });

  it('deduplicates internally so order does not matter beyond priority', () => {
    const repeated: AscentStatusValue[] = ['send', 'send', 'send', 'flash', 'flash'];
    expect(pickHighestAscentStatus(repeated)).toBe('flash');
  });

  it('accepts any iterable, not just arrays', () => {
    function* gen(): Iterable<AscentStatusValue> {
      yield 'attempt';
      yield 'send';
    }
    expect(pickHighestAscentStatus(gen())).toBe('send');
  });
});
