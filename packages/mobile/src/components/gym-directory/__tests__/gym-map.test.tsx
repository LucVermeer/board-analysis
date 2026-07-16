import { describe, it, expect, vi } from 'vitest';

// Issue #3187: mounting the native Android GoogleMaps view without
// GOOGLE_MAPS_API_KEY baked into the build is a FATAL native crash the instant
// the view attaches to the window (thrown outside React's render/commit cycle,
// so the component's MapErrorBoundary can't catch it). GymMap.tsx guards this
// with two pure decision functions, tested directly here — the actual
// expo-maps package is native-only and can't be exercised through a render in
// this Node/jsdom test environment (`require('expo-maps')` isn't interceptable
// by `vi.mock` the way a static `import` is, and the real package throws
// outside a React Native runtime), so a full-render test would only ever
// exercise the "module missing" branch regardless of the key flag. Testing the
// pure functions directly covers the actual bug fix without that limitation.
//
// react-native / expo-maps / expo-constants are mocked only so importing
// GymMap.tsx (for its exported pure functions) doesn't touch native/Flow
// source under vitest's node env; nothing below depends on the mocked values
// beyond `readGoogleMapsApiKeyConfigured` and `resolveMapView`'s own args.
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));
vi.mock('expo-maps', () => ({}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

const { readGoogleMapsApiKeyConfigured, resolveMapView } = await import('../GymMap');

describe('readGoogleMapsApiKeyConfigured', () => {
  it('is true only when extra.googleMapsApiKeyConfigured is exactly true', () => {
    expect(readGoogleMapsApiKeyConfigured({ googleMapsApiKeyConfigured: true })).toBe(true);
  });

  it('is false when the flag is absent, false, or the wrong type (dev-client build, or a build predating this fix)', () => {
    expect(readGoogleMapsApiKeyConfigured({ googleMapsApiKeyConfigured: false })).toBe(false);
    expect(readGoogleMapsApiKeyConfigured({})).toBe(false);
    expect(readGoogleMapsApiKeyConfigured(undefined)).toBe(false);
    expect(readGoogleMapsApiKeyConfigured(null)).toBe(false);
    expect(readGoogleMapsApiKeyConfigured('unexpected')).toBe(false);
    expect(readGoogleMapsApiKeyConfigured({ googleMapsApiKeyConfigured: 'true' })).toBe(false);
  });
});

describe('resolveMapView', () => {
  const AppleView = () => null;
  const GoogleView = () => null;
  const maps = {
    AppleMaps: { View: AppleView },
    GoogleMaps: { View: GoogleView },
  } as unknown as typeof import('expo-maps');

  it('never resolves GoogleMaps.View on Android when the build key is missing (the crash this issue fixes)', () => {
    expect(resolveMapView('android', maps, false)).toBeUndefined();
  });

  it('resolves GoogleMaps.View on Android when the build key is present', () => {
    expect(resolveMapView('android', maps, true)).toBe(GoogleView);
  });

  it('resolves AppleMaps.View on iOS regardless of the Android key flag (iOS never needs the key)', () => {
    expect(resolveMapView('ios', maps, false)).toBe(AppleView);
    expect(resolveMapView('ios', maps, true)).toBe(AppleView);
  });

  it('resolves undefined on any platform when the expo-maps module itself is unavailable', () => {
    expect(resolveMapView('android', null, true)).toBeUndefined();
    expect(resolveMapView('ios', null, true)).toBeUndefined();
  });
});
