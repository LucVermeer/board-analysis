import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useTheme } from '../../providers/theme-provider';
import { hapticSelection } from '../../lib/haptics';

type AngleSliderProps = {
  angles: number[];
  value: number;
  /** Preview callback — fires frequently while dragging as the thumb snaps to a
   *  new angle. NOT a commit; the parent commits separately (e.g. on release or
   *  a confirm button). */
  onChange: (angle: number) => void;
};

const THUMB_SIZE = 26;
const THUMB_RADIUS = THUMB_SIZE / 2;
const TRACK_HEIGHT = 4;
const TICK_SIZE = 6;
const TICK_RADIUS = TICK_SIZE / 2;
const SNAP_DURATION = 120;
// The GestureDetector wraps the padded hit area, so its event.x is measured
// from the hit-area edge — THUMB_RADIUS to the left of the track's x=0. Stops
// and onLayout work in track-local coordinates, so we shift event.x by this.
const TRACK_INSET = THUMB_RADIUS;
// Fallback so the very first paint (before onLayout measures the real width)
// isn't collapsed to a zero-width track.
const DEFAULT_TRACK_WIDTH = 280;

/**
 * x-position of the stop at index `i` along a track of width `trackWidth`.
 * Stops are evenly spaced regardless of the underlying angle values, so
 * non-uniform sets (MoonBoard [25, 40]) render with even gaps. A single-angle
 * set centres its one stop.
 */
function stopX(index: number, count: number, trackWidth: number): number {
  'worklet';
  if (count <= 1) return trackWidth / 2;
  return (index / (count - 1)) * trackWidth;
}

/** Nearest stop index for an absolute x along the track. */
function indexForX(x: number, count: number, trackWidth: number): number {
  'worklet';
  if (count <= 1) return 0;
  const clampedX = Math.max(0, Math.min(trackWidth, x));
  const raw = Math.round((clampedX / trackWidth) * (count - 1));
  return Math.max(0, Math.min(count - 1, raw));
}

export function AngleSlider({ angles, value, onChange }: AngleSliderProps): React.JSX.Element {
  const { systemColors, brandColors } = useTheme();

  const count = angles.length;
  const valueIndex = useMemo(() => {
    const found = angles.indexOf(value);
    return found === -1 ? 0 : found;
  }, [angles, value]);

  const [trackWidth, setTrackWidth] = useState(DEFAULT_TRACK_WIDTH);

  // Reduce-motion is read once on mount (and on the OS change event). Default
  // false so a slow keychain/native read never blocks the first animation.
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) reduceMotionRef.current = enabled;
      })
      .catch(() => {
        // isReduceMotionEnabled can reject on some platforms; stay on the
        // false default so animations still run.
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotionRef.current = enabled;
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // currentX is the live thumb centre along the track (0..trackWidth). The fill
  // width tracks it directly. During a drag it follows the finger; on snap /
  // release / external change it animates with withTiming.
  const currentX = useSharedValue(stopX(valueIndex, count, trackWidth));
  // Mirror props onto the UI thread so the gesture worklets read fresh values
  // without rebuilding the gesture objects (recomposing gestures mid-session
  // leaves RNGH in a bad state on iOS — see use-zoom-pan-gesture).
  const countSV = useSharedValue(count);
  const trackWidthSV = useSharedValue(trackWidth);
  // Last index this gesture announced, so we only fire onChange + a haptic once
  // per crossing rather than every frame.
  const lastAnnouncedIndex = useSharedValue(valueIndex);
  // While true, the external-value effect leaves currentX alone so a live drag
  // isn't yanked back by an echoed onChange.
  const isDragging = useSharedValue(false);

  useEffect(() => {
    countSV.value = count;
  }, [count, countSV]);
  useEffect(() => {
    trackWidthSV.value = trackWidth;
  }, [trackWidth, trackWidthSV]);

  // Stable JS callback invoked from worklets via runOnJS. Both `onChange` and
  // `angles` are read through refs so this function's identity never changes —
  // keeping it out of the gesture `useMemo` deps so the gesture objects stay
  // stable across the session (recomposing gestures mid-session leaves RNGH
  // stuck on iOS; see use-zoom-pan-gesture). Parents frequently pass a fresh
  // `angles` array reference per render, which would otherwise churn the
  // gesture every parent render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const anglesRef = useRef(angles);
  anglesRef.current = angles;
  const emitAngleAtIndex = useCallback((index: number) => {
    const angle = anglesRef.current[index];
    if (angle !== undefined) onChangeRef.current(angle);
  }, []);

  // React to external `value` / angles / width changes while not dragging:
  // snap currentX to the matching stop, honouring reduce-motion.
  useEffect(() => {
    if (isDragging.value) return;
    const target = stopX(valueIndex, count, trackWidth);
    lastAnnouncedIndex.value = valueIndex;
    if (reduceMotionRef.current) {
      currentX.value = target;
    } else {
      currentX.value = withTiming(target, { duration: SNAP_DURATION });
    }
  }, [valueIndex, count, trackWidth, currentX, isDragging, lastAnnouncedIndex]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Claim the gesture only once the finger moves ~8px horizontally, and
        // bail (hand back to the bottom sheet's pan-to-dismiss) the moment a
        // ~12px vertical drift wins. Without these the sheet steals the drag or
        // the two gestures fight. The thresholds mirror the carousel's
        // intent: horizontal = slider, vertical = sheet.
        .activeOffsetX([-8, 8])
        .failOffsetY([-12, 12])
        .onStart((event) => {
          'worklet';
          isDragging.value = true;
          const x = Math.max(0, Math.min(trackWidthSV.value, event.x - TRACK_INSET));
          currentX.value = x;
          const index = indexForX(x, countSV.value, trackWidthSV.value);
          if (index !== lastAnnouncedIndex.value) {
            lastAnnouncedIndex.value = index;
            runOnJS(emitAngleAtIndex)(index);
            runOnJS(hapticSelection)();
          }
        })
        .onUpdate((event) => {
          'worklet';
          const x = Math.max(0, Math.min(trackWidthSV.value, event.x - TRACK_INSET));
          // Follow the finger live for a 1:1 feel.
          currentX.value = x;
          const index = indexForX(x, countSV.value, trackWidthSV.value);
          if (index !== lastAnnouncedIndex.value) {
            lastAnnouncedIndex.value = index;
            runOnJS(emitAngleAtIndex)(index);
            runOnJS(hapticSelection)();
          }
        })
        .onEnd(() => {
          'worklet';
          // Settle onto the snapped stop.
          const index = indexForX(currentX.value, countSV.value, trackWidthSV.value);
          currentX.value = withTiming(stopX(index, countSV.value, trackWidthSV.value), { duration: SNAP_DURATION });
          isDragging.value = false;
        })
        .onFinalize(() => {
          'worklet';
          // Covers cancellation (e.g. the sheet wins): drop the drag flag so the
          // external-value effect can re-take control.
          isDragging.value = false;
        }),
    [currentX, countSV, trackWidthSV, lastAnnouncedIndex, isDragging, emitAngleAtIndex],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((event, success) => {
        'worklet';
        if (!success) return;
        const x = Math.max(0, Math.min(trackWidthSV.value, event.x - TRACK_INSET));
        const index = indexForX(x, countSV.value, trackWidthSV.value);
        currentX.value = withTiming(stopX(index, countSV.value, trackWidthSV.value), { duration: SNAP_DURATION });
        if (index !== lastAnnouncedIndex.value) {
          lastAnnouncedIndex.value = index;
          runOnJS(emitAngleAtIndex)(index);
          runOnJS(hapticSelection)();
        }
      }),
    [currentX, countSV, trackWidthSV, lastAnnouncedIndex, emitAngleAtIndex],
  );

  // Race: whichever recognises first wins. The Pan claims a real drag (after
  // its 8px activation); a clean touch-and-release with no drag resolves as a
  // Tap and jumps to that stop.
  const composedGesture = useMemo(() => Gesture.Race(panGesture, tapGesture), [panGesture, tapGesture]);

  const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: currentX.value - THUMB_RADIUS }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: Math.max(0, currentX.value),
  }));

  // Step the index ±1 for VoiceOver, which never sees the pan drag.
  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const next =
        event.nativeEvent.actionName === 'increment'
          ? Math.min(count - 1, valueIndex + 1)
          : event.nativeEvent.actionName === 'decrement'
            ? Math.max(0, valueIndex - 1)
            : valueIndex;
      if (next !== valueIndex) emitAngleAtIndex(next);
    },
    [count, valueIndex, emitAngleAtIndex],
  );

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ text: `${value}°` }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <GestureDetector gesture={composedGesture}>
        {/* The hit area spans the full row so taps near the ends still register.
            onLayout measures the inner track (which the stops are spaced
            across); padding keeps the thumb from clipping at the edges. */}
        <View style={styles.hitArea}>
          <View style={styles.track} onLayout={onTrackLayout}>
            <View style={[styles.trackBase, { backgroundColor: systemColors.separator }]} />
            <Animated.View style={[styles.fill, { backgroundColor: brandColors.primary }, fillStyle]} />
            {angles.map((angle, index) => (
              <View
                key={angle}
                style={[
                  styles.tick,
                  {
                    backgroundColor: systemColors.fill,
                    left: stopX(index, count, trackWidth) - TICK_RADIUS,
                  },
                ]}
              />
            ))}
            <Animated.View
              style={[styles.thumb, { backgroundColor: brandColors.primary }, thumbStyle]}
              pointerEvents="none"
            />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const accessibilityActions = [{ name: 'increment' }, { name: 'decrement' }] as const;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  hitArea: {
    height: THUMB_SIZE + 16,
    justifyContent: 'center',
    // Inset by the thumb radius so the first and last stops (and the thumb
    // sitting on them) stay fully inside the row.
    paddingHorizontal: THUMB_RADIUS,
  },
  track: {
    height: THUMB_SIZE,
    justifyContent: 'center',
  },
  trackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  tick: {
    position: 'absolute',
    width: TICK_SIZE,
    height: TICK_SIZE,
    borderRadius: TICK_RADIUS,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
});
