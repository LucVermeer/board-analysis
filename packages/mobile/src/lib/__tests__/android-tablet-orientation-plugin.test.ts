import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

type OrientationPlugin = {
  addTabletOrientation(contents: string): string;
  MARKER: string;
};

const plugin = require('../../../plugins/with-android-tablet-orientation.js') as OrientationPlugin;

const MAIN_ACTIVITY = `package com.boardsesh.app

import android.os.Bundle
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    super.onCreate(null)
  }
}
`;

describe('with-android-tablet-orientation', () => {
  it('injects a sw600dp orientation guard after super.onCreate', () => {
    const result = plugin.addTabletOrientation(MAIN_ACTIVITY);

    expect(result).toContain(plugin.MARKER);
    expect(result).toContain('smallestScreenWidthDp >= 600');
    expect(result).toContain('SCREEN_ORIENTATION_UNSPECIFIED');
    expect(result).toContain('SCREEN_ORIENTATION_PORTRAIT');
    // The guard follows the super.onCreate call, not precedes it.
    expect(result.indexOf('super.onCreate(null)')).toBeLessThan(result.indexOf('smallestScreenWidthDp'));
  });

  it('preserves the onCreate indentation', () => {
    const result = plugin.addTabletOrientation(MAIN_ACTIVITY);
    // super.onCreate sits at 4-space indent, so the injected requestedOrientation does too.
    expect(result).toContain('\n    requestedOrientation =');
  });

  it('is idempotent — a second pass adds no duplicate guard', () => {
    const once = plugin.addTabletOrientation(MAIN_ACTIVITY);
    const twice = plugin.addTabletOrientation(once);

    expect(twice).toBe(once);
    expect(twice.match(new RegExp(plugin.MARKER, 'g'))).toHaveLength(1);
  });

  it('throws if the super.onCreate anchor is missing (Expo template drift)', () => {
    const drifted = 'class MainActivity : ReactActivity() {\n}\n';
    expect(() => plugin.addTabletOrientation(drifted)).toThrow(/super\.onCreate/);
  });
});
