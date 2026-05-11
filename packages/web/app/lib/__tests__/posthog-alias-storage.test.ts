/* oxlint-disable no-restricted-globals -- tests cover PostHog alias localStorage durability */

import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { hasRecordedPosthogAlias, recordPosthogAlias } from '../posthog-alias-storage';

describe('posthog alias storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records alias pairs durably', () => {
    expect(hasRecordedPosthogAlias('profile-1', 'user-1')).toBe(false);

    recordPosthogAlias('profile-1', 'user-1');

    expect(hasRecordedPosthogAlias('profile-1', 'user-1')).toBe(true);
    expect(hasRecordedPosthogAlias('profile-1', 'user-2')).toBe(false);
  });

  it('ignores corrupt stored data', () => {
    window.localStorage.setItem('boardsesh:posthog-aliases', '{nope');

    expect(hasRecordedPosthogAlias('profile-1', 'user-1')).toBe(false);
  });

  it('bounds stored aliases to the most recent pairs', () => {
    for (let i = 0; i < 70; i += 1) {
      recordPosthogAlias(`profile-${i}`, `user-${i}`);
    }

    expect(hasRecordedPosthogAlias('profile-0', 'user-0')).toBe(false);
    expect(hasRecordedPosthogAlias('profile-5', 'user-5')).toBe(false);
    expect(hasRecordedPosthogAlias('profile-6', 'user-6')).toBe(true);
    expect(hasRecordedPosthogAlias('profile-69', 'user-69')).toBe(true);
  });
});
