import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

type ScreenshotDevMenuPlugin = {
  applyScreenshotDevMenuInfoPlist: (
    infoPlist: Record<string, unknown>,
    env?: NodeJS.ProcessEnv,
  ) => Record<string, unknown>;
  resolveScreenshotMetroPort: (env?: NodeJS.ProcessEnv) => number;
  resolveScreenshotMetroUrl: (env?: NodeJS.ProcessEnv) => string;
};

const plugin = require('../../packages/mobile/plugins/with-screenshot-dev-menu.js') as ScreenshotDevMenuPlugin;

describe('with-screenshot-dev-menu', () => {
  it('defaults the baked dev-client launcher URL to the screenshot Metro port', () => {
    expect(plugin.resolveScreenshotMetroPort({})).toBe(8081);
    expect(plugin.resolveScreenshotMetroUrl({})).toBe('http://localhost:8081');
  });

  it('uses BOARDSESH_METRO_PORT for the baked dev-client launcher URL', () => {
    const infoPlist = plugin.applyScreenshotDevMenuInfoPlist({}, { BOARDSESH_METRO_PORT: '8091' });

    expect(infoPlist.DEV_CLIENT_DEFAULT_LAUNCHER_URL).toBe('http://localhost:8091');
    expect(infoPlist.EXDevMenuIsOnboardingFinished).toBe(true);
    expect(infoPlist.EXDevMenuShowFloatingActionButton).toBe(false);
    expect(infoPlist.EXDevMenuShowsAtLaunch).toBe(false);
  });
});
