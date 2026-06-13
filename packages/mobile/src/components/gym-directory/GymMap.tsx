import { Component, type ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export type GymMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
};

type GymMapProps = {
  center: { latitude: number; longitude: number };
  markers: GymMapMarker[];
  style?: StyleProp<ViewStyle>;
};

// Lazy-require so a native build that predates the expo-maps module degrades to
// "no map" instead of crashing. The gym list is the primary interaction, so a
// missing map is a soft loss.
let Maps: typeof import('expo-maps') | null = null;
try {
  Maps = require('expo-maps');
} catch {
  Maps = null;
}

/**
 * Catches a render/mount throw from the native map (e.g. the expo-maps native
 * view isn't linked in this build) so it degrades to no-map instead of taking
 * the whole gym screen down with a red box.
 */
class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[gym-map] native map unavailable, falling back to list-only:', error);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function NativeGymMap({ center, markers, style }: GymMapProps) {
  if (!Maps) return null;
  // requireNativeView can hand back a component that exists in JS but throws on
  // mount when the native side is absent — the boundary above is the real guard;
  // this short-circuits the obvious "undefined component" case.
  const MapView = Platform.OS === 'ios' ? Maps.AppleMaps?.View : Maps.GoogleMaps?.View;
  if (!MapView) return null;

  const cameraPosition = {
    coordinates: { latitude: center.latitude, longitude: center.longitude },
    zoom: 10,
  };
  const mapMarkers = markers.map((marker) => ({
    coordinates: { latitude: marker.latitude, longitude: marker.longitude },
    title: marker.name,
  }));

  return <MapView style={[styles.map, style]} cameraPosition={cameraPosition} markers={mapMarkers} />;
}

/**
 * Renders nearby gyms as pins on the platform map (Apple Maps on iOS, Google
 * Maps on Android — the latter needs GOOGLE_MAPS_API_KEY + a native build, else
 * blank). Marker taps aren't wired: selection happens in the gym list so the
 * flow works identically whether or not the map renders, and a missing/broken
 * native map never crashes the screen.
 */
export function GymMap({ center, markers, style }: GymMapProps) {
  return (
    <MapErrorBoundary>
      <NativeGymMap center={center} markers={markers} style={style} />
    </MapErrorBoundary>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
