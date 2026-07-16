import { describe, expect, it } from 'vitest';
import { isChromeLessPath } from '../chrome-less-routes';

describe('isChromeLessPath', () => {
  it('matches kiosk routes at any depth', () => {
    expect(isChromeLessPath('/kiosk')).toBe(true);
    expect(isChromeLessPath('/kiosk/my-gym')).toBe(true);
    expect(isChromeLessPath('/kiosk/my-gym/front-tv')).toBe(true);
  });

  it('matches embed routes (pre-gated for the embeds PR)', () => {
    expect(isChromeLessPath('/embed')).toBe(true);
    expect(isChromeLessPath('/embed/board/abc-123')).toBe(true);
  });

  it('does not match lookalike prefixes', () => {
    expect(isChromeLessPath('/kiosks')).toBe(false);
    expect(isChromeLessPath('/embedded')).toBe(false);
    expect(isChromeLessPath('/kiosk-manager')).toBe(false);
  });

  it('does not match unrelated routes', () => {
    expect(isChromeLessPath('/')).toBe(false);
    expect(isChromeLessPath('/you')).toBe(false);
    expect(isChromeLessPath('/gym/my-gym')).toBe(false);
  });

  it('expects locale-stripped input (locale prefixes are the caller contract)', () => {
    // usePathnameWithoutLocale strips /es → callers never pass this shape,
    // documented here as the contract rather than handled.
    expect(isChromeLessPath('/es/kiosk/my-gym')).toBe(false);
  });
});
