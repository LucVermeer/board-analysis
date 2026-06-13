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

// Lazy-require so a JS-only OTA update landing on an older native build that
// predates the expo-maps module degrades to "no map" instead of crashing. The
// gym list is the primary interaction, so a missing map is a soft loss.
let Maps: typeof import('expo-maps') | null = null;
try {
  Maps = require('expo-maps');
} catch {
  Maps = null;
}

/**
 * Renders nearby gyms as pins on the platform map (Apple Maps on iOS, Google
 * Maps on Android — the latter needs GOOGLE_MAPS_API_KEY set + a native build,
 * else it shows blank). Marker taps aren't wired: selection happens in the gym
 * list so the flow works identically whether or not the map renders.
 */
export function GymMap({ center, markers, style }: GymMapProps) {
  if (!Maps) {
    return null;
  }

  const cameraPosition = {
    coordinates: { latitude: center.latitude, longitude: center.longitude },
    zoom: 10,
  };
  const mapMarkers = markers.map((marker) => ({
    coordinates: { latitude: marker.latitude, longitude: marker.longitude },
    title: marker.name,
  }));

  if (Platform.OS === 'ios') {
    return <Maps.AppleMaps.View style={[styles.map, style]} cameraPosition={cameraPosition} markers={mapMarkers} />;
  }
  return <Maps.GoogleMaps.View style={[styles.map, style]} cameraPosition={cameraPosition} markers={mapMarkers} />;
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
