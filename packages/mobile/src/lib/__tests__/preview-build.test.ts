import { describe, it, expect, vi, beforeEach } from 'vitest';

// `isPreviewBuild` keys off the build-time channel from expo-updates, so drive it
// per test by swapping the mocked `channel` value. (vi.mock is hoisted above the
// import, and the hoisted ref lets each test mutate what the module sees.)
const updates = vi.hoisted(() => ({ channel: null as string | null }));

vi.mock('expo-updates', () => ({
  get channel() {
    return updates.channel;
  },
}));

import { isPreviewBuild } from '../preview-build';

describe('isPreviewBuild', () => {
  beforeEach(() => {
    updates.channel = null;
  });

  it('is true on a preview channel build', () => {
    updates.channel = 'preview-1';
    expect(isPreviewBuild()).toBe(true);
  });

  it('is true for any preview-N channel', () => {
    updates.channel = 'preview-4';
    expect(isPreviewBuild()).toBe(true);
  });

  it('is false on a production build', () => {
    updates.channel = 'production';
    expect(isPreviewBuild()).toBe(false);
  });

  it('is false on a development channel build', () => {
    updates.channel = 'development';
    expect(isPreviewBuild()).toBe(false);
  });

  it('is false on a bare "preview" channel (no suffix dash)', () => {
    updates.channel = 'preview';
    expect(isPreviewBuild()).toBe(false);
  });

  it('is false when there is no channel (dev / Expo Go)', () => {
    updates.channel = null;
    expect(isPreviewBuild()).toBe(false);
  });
});
