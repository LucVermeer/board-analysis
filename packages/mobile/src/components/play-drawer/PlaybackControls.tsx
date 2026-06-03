import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from '../Text';
import { Icon } from '../Icon';
import type { IconName } from '../icon-map';
import { useTheme } from '../../providers/theme-provider';
import { hapticSelection } from '../../lib/haptics';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

// Range mirrors web's effective span (presets 0.5×/1× + a 1.1×–10× slider).
// A single continuous slider is simpler on touch and needs no preset chrome.
const MIN_SPEED = 0.5;
const MAX_SPEED = 10;
const THUMB_SIZE = 22;

type PlaybackControlsProps = {
  frameIndex: number;
  frameCount: number;
  isPlaying: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: number) => void;
};

// Trim a trailing `.0` like web (7.0 → "7", 6.3 → "6.3").
function formatSpeed(speed: number): string {
  const rounded = Math.round(speed * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(1)}×`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Hand-rolled speed slider on reanimated + gesture-handler — no native slider
 * dependency (which would force a fresh build and break OTA updates). The thumb
 * tracks a shared value on the UI thread; the label updates live during a drag,
 * but the speed is committed once on release so a drag is a single engine update
 * (and a single party-sync broadcast), not one per pixel.
 */
function SpeedSlider({ value, onChange }: { value: number; onChange: (speed: number) => void }) {
  const { systemColors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const usable = Math.max(0, trackWidth - THUMB_SIZE);
  const position = useSharedValue(0);
  const startPosition = useSharedValue(0);
  const dragging = useSharedValue(false);
  const [labelSpeed, setLabelSpeed] = useState(value);

  const ratioToSpeed = useCallback(
    (ratio: number) => Math.round((MIN_SPEED + clamp01(ratio) * (MAX_SPEED - MIN_SPEED)) * 10) / 10,
    [],
  );

  // Keep the thumb + label synced to the external value while not dragging
  // (peer sync, commit echoes, resets). The guard avoids fighting the gesture.
  useEffect(() => {
    if (dragging.value) return;
    position.value = clamp01((value - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * usable;
    setLabelSpeed(value);
  }, [value, usable, position, dragging]);

  const updateLabel = useCallback(
    (px: number) => setLabelSpeed(ratioToSpeed(usable > 0 ? px / usable : 0)),
    [ratioToSpeed, usable],
  );
  const commit = useCallback(
    (px: number) => onChange(ratioToSpeed(usable > 0 ? px / usable : 0)),
    [onChange, ratioToSpeed, usable],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          dragging.value = true;
          startPosition.value = position.value;
        })
        .onUpdate((event) => {
          const next = Math.max(0, Math.min(usable, startPosition.value + event.translationX));
          position.value = next;
          runOnJS(updateLabel)(next);
        })
        .onEnd(() => {
          runOnJS(commit)(position.value);
        })
        .onFinalize(() => {
          dragging.value = false;
        }),
    [usable, position, startPosition, dragging, updateLabel, commit],
  );

  // Tap-to-seek on the track.
  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((event) => {
        const next = Math.max(0, Math.min(usable, event.x - THUMB_SIZE / 2));
        position.value = next;
        runOnJS(updateLabel)(next);
        runOnJS(commit)(next);
      }),
    [usable, position, updateLabel, commit],
  );

  const composed = useMemo(() => Gesture.Race(pan, tap), [pan, tap]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: position.value + THUMB_SIZE / 2 }));

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.speedRow}>
      <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.speedLabel}>
        {formatSpeed(labelSpeed)}
      </Text>
      <GestureDetector gesture={composed}>
        <View style={styles.sliderTrackWrapper} onLayout={handleLayout}>
          <View style={[styles.sliderTrack, { backgroundColor: systemColors.fill }]} />
          <Animated.View style={[styles.sliderFill, fillStyle]} />
          <Animated.View style={[styles.sliderThumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

/**
 * Transport + speed controls for multi-frame route playback. Rendered only when
 * the active climb is a route (`isAnimatable`); boulders never mount it. Pure
 * React Native — the play/pause/seek/speed logic lives in the shared engine.
 */
export function PlaybackControls({
  frameIndex,
  frameCount,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
}: PlaybackControlsProps) {
  const { systemColors } = useTheme();
  const atFirstFrame = frameIndex <= 0;
  const atLastFrame = frameIndex >= frameCount - 1;
  // Pause while playing; replay (restart from 0) when stopped on the last frame;
  // otherwise play. The engine's play() already restarts from 0 at the end.
  const mainIcon: IconName = isPlaying ? 'pause' : atLastFrame ? 'refresh' : 'play.fill';

  const handleMain = useCallback(() => {
    hapticSelection();
    if (isPlaying) onPause();
    else onPlay();
  }, [isPlaying, onPlay, onPause]);

  const handlePrev = useCallback(() => {
    hapticSelection();
    onSeek(frameIndex - 1);
  }, [onSeek, frameIndex]);

  const handleNext = useCallback(() => {
    hapticSelection();
    onSeek(frameIndex + 1);
  }, [onSeek, frameIndex]);

  return (
    <View style={styles.container}>
      <View style={styles.transportRow}>
        <Pressable
          onPress={handlePrev}
          disabled={atFirstFrame}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous frame"
          style={styles.stepButton}
        >
          <Icon name="skip.previous" size={26} color={atFirstFrame ? systemColors.tertiaryLabel : systemColors.label} />
        </Pressable>

        <Pressable
          onPress={handleMain}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: isPlaying }}
          style={styles.playButton}
        >
          <Icon name={mainIcon} size={26} color={iosSystemColors.white} />
        </Pressable>

        <Pressable
          onPress={handleNext}
          disabled={atLastFrame}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Next frame"
          style={styles.stepButton}
        >
          <Icon name="skip.next" size={26} color={atLastFrame ? systemColors.tertiaryLabel : systemColors.label} />
        </Pressable>

        <View style={styles.counterWrapper}>
          <Text variant="footnote" color={systemColors.secondaryLabel}>{`${frameIndex + 1} / ${frameCount}`}</Text>
        </View>
      </View>

      <SpeedSlider value={speed} onChange={onSpeedChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandColors.primary,
  },
  counterWrapper: {
    flex: 1,
    alignItems: 'flex-end',
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  speedLabel: {
    minWidth: 44,
    fontVariant: ['tabular-nums'],
  },
  sliderTrackWrapper: {
    flex: 1,
    height: THUMB_SIZE,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: brandColors.primary,
  },
  sliderThumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: iosSystemColors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
});
