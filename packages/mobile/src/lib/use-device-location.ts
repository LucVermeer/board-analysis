// One-shot device location for "Find Nearby". Mirrors the web's
// use-discover-boards geolocation step, but as a standalone hook: it owns only
// permission + coordinate resolution and exposes a small state machine. The
// actual board search is a separate concern (`useNearbyBoards(coords)`), so the
// mode card can reflect location status while the carousel reflects results.
//
// expo-location is a NATIVE module — a build that predates it will throw on
// import. We import lazily inside `request()` and treat a failure as
// `unavailable`, so the screen degrades gracefully on an older OTA build
// instead of crashing.

import { useCallback, useRef, useState } from 'react';

export type Coords = { latitude: number; longitude: number };

export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable';

export type DeviceLocation = {
  status: LocationStatus;
  coords: Coords | null;
  /** Kick off the permission prompt + one-shot fix. Safe to call repeatedly. */
  request: () => Promise<void>;
};

export function useDeviceLocation(): DeviceLocation {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);
  // Guard against double-taps / re-entrancy while a request is in flight.
  const inFlightRef = useRef(false);

  const request = useCallback(async () => {
    if (inFlightRef.current || coords) return;
    inFlightRef.current = true;
    setStatus('loading');

    try {
      const Location = await import('expo-location');
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setStatus('granted');
    } catch {
      // Module missing (pre-expo-location build) or a location error — either
      // way there's nothing to show; surface it as unavailable, not a crash.
      setStatus('unavailable');
    } finally {
      inFlightRef.current = false;
    }
  }, [coords]);

  return { status, coords, request };
}
