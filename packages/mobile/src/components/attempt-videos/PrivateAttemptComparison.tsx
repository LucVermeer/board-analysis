import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTranslation } from 'react-i18next';
import type { PrivateAttemptVideo } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { protectedPrivateAttemptVideoSource } from '../../lib/private-attempt-videos-client';
import {
  fullLoopRange,
  shouldRestartLoop,
  withLoopEnd,
  withLoopStart,
  type LoopRange,
} from '../../lib/private-attempt-loop';
import { borderRadius, spacing } from '../../theme/tokens';

type PlaybackSpeed = 0.25 | 0.5 | 1;

type PrivateAttemptComparisonProps = {
  video: PrivateAttemptVideo;
  index: number;
  count: number;
  speed: PlaybackSpeed;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
};

function secondsLabel(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function PrivateAttemptComparison({
  video,
  index,
  count,
  speed,
  onPrevious,
  onNext,
  onClose,
  style,
}: PrivateAttemptComparisonProps) {
  const { t } = useTranslation('climbs');
  const { systemColors, brandColors } = useTheme();
  const durationSeconds = Math.max(0.25, video.durationMs / 1000);
  const [sourceError, setSourceError] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [range, setRange] = useState<LoopRange>(() => fullLoopRange(durationSeconds));
  const rangeRef = useRef(range);
  const loopEnabledRef = useRef(loopEnabled);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const player = useVideoPlayer(null, (createdPlayer) => {
    createdPlayer.loop = false;
    createdPlayer.muted = true;
    createdPlayer.timeUpdateEventInterval = 0.1;
  });

  const commitRange = useCallback((nextRange: LoopRange) => {
    rangeRef.current = nextRange;
    setRange(nextRange);
  }, []);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!shouldRestartLoop(currentTime, rangeRef.current, loopEnabledRef.current)) return;
    player.currentTime = rangeRef.current.start;
    player.play();
  });

  useEffect(() => {
    let active = true;
    const nextRange = fullLoopRange(durationSeconds);
    commitRange(nextRange);
    setSourceError(false);
    player.pause();
    player.muted = true;
    player.playbackRate = speedRef.current;
    void protectedPrivateAttemptVideoSource(video.playbackPath)
      .then((source) => player.replaceAsync(source))
      .then(() => {
        if (!active) return;
        player.currentTime = nextRange.start;
        player.play();
      })
      .catch(() => {
        if (active) setSourceError(true);
      });
    return () => {
      active = false;
      player.pause();
    };
  }, [commitRange, durationSeconds, player, video.playbackPath]);

  useEffect(() => {
    player.playbackRate = speed;
  }, [player, speed]);

  const toggleLoop = useCallback(() => {
    setLoopEnabled((current) => {
      loopEnabledRef.current = !current;
      return !current;
    });
  }, []);

  const setStart = useCallback(() => {
    commitRange(withLoopStart(rangeRef.current, player.currentTime));
  }, [commitRange, player]);

  const setEnd = useCallback(() => {
    commitRange(withLoopEnd(rangeRef.current, player.currentTime, durationSeconds));
  }, [commitRange, durationSeconds, player]);

  const resetLoop = useCallback(() => {
    const nextRange = fullLoopRange(durationSeconds);
    commitRange(nextRange);
    player.currentTime = 0;
  }, [commitRange, durationSeconds, player]);

  return (
    <View style={[styles.card, { borderColor: systemColors.separator }, style]}>
      <View style={[styles.header, { borderColor: systemColors.separator }]}>
        <Pressable
          onPress={onPrevious}
          disabled={index <= 0}
          accessibilityRole="button"
          accessibilityLabel={t('analysisNavigation.previousRecording')}
          style={[styles.iconButton, index <= 0 && styles.disabled]}
        >
          <Icon name="chevron.left" color={brandColors.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="subheadline" numberOfLines={1}>
            {t('analysisNavigation.yourRecording')}
          </Text>
          <Text variant="caption2" color={systemColors.secondaryLabel} numberOfLines={1}>
            {index + 1}/{count} · {new Date(video.recordedAt).toLocaleDateString()}
          </Text>
        </View>
        <Pressable
          onPress={onNext}
          disabled={index >= count - 1}
          accessibilityRole="button"
          accessibilityLabel={t('analysisNavigation.nextRecording')}
          style={[styles.iconButton, index >= count - 1 && styles.disabled]}
        >
          <Icon name="chevron.right" color={brandColors.primary} />
        </Pressable>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('analysisNavigation.closeRecording')}
          style={styles.iconButton}
        >
          <Icon name="close" color={systemColors.secondaryLabel} />
        </Pressable>
      </View>

      {sourceError ? (
        <View style={[styles.video, styles.videoFallback, { backgroundColor: systemColors.fill }]}>
          <Icon name="video" size={34} color={systemColors.secondaryLabel} />
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('analysisNavigation.recordingUnavailable')}
          </Text>
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls
          surfaceType="textureView"
          accessibilityLabel={t('analysisNavigation.yourRecording')}
        />
      )}

      <View style={styles.loopControls}>
        <Pressable
          onPress={setStart}
          accessibilityRole="button"
          style={[styles.loopButton, { backgroundColor: systemColors.fill }]}
        >
          <Text variant="caption1">{t('analysisNavigation.loopStart', { time: secondsLabel(range.start) })}</Text>
        </Pressable>
        <Pressable
          onPress={setEnd}
          accessibilityRole="button"
          style={[styles.loopButton, { backgroundColor: systemColors.fill }]}
        >
          <Text variant="caption1">{t('analysisNavigation.loopEnd', { time: secondsLabel(range.end) })}</Text>
        </Pressable>
        <Pressable
          onPress={toggleLoop}
          accessibilityRole="switch"
          accessibilityState={{ checked: loopEnabled }}
          style={[
            styles.iconButton,
            styles.loopToggle,
            { backgroundColor: loopEnabled ? systemColors.fill : 'transparent' },
          ]}
        >
          <Icon name="repeat" color={loopEnabled ? brandColors.primary : systemColors.secondaryLabel} />
        </Pressable>
        <Pressable
          onPress={resetLoop}
          accessibilityRole="button"
          accessibilityLabel={t('analysisNavigation.resetLoop')}
          style={styles.iconButton}
        >
          <Icon name="refresh" color={systemColors.secondaryLabel} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    gap: spacing[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, minWidth: 0 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 620, backgroundColor: '#000000' },
  videoFallback: { alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  loopControls: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingBottom: spacing[2],
  },
  loopButton: {
    minHeight: 36,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingHorizontal: spacing[2],
  },
  loopToggle: { borderRadius: 6 },
});
