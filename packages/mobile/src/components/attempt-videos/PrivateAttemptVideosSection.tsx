import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTranslation } from 'react-i18next';
import type { PrivateAttemptVideo } from '@boardsesh/shared-schema';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { useTheme } from '../../providers/theme-provider';
import { privateAttemptVideosQueryKey, usePrivateAttemptVideos } from '../../lib/graphql/hooks';
import {
  deletePrivateAttemptUpload,
  protectedPrivateAttemptVideoSource,
} from '../../lib/private-attempt-videos-client';
import { spacing } from '../../theme/tokens';
import {
  deleteLocalAttemptVideo,
  isLocalAttemptVideo,
  listLocalAttemptVideos,
  localAttemptVideosQueryKey,
} from '../../lib/local-attempt-videos';

type PrivateAttemptVideosSectionProps = {
  climbUuid: string;
  layoutId: number;
  angle: number;
};

const SPEEDS = [0.25, 0.5, 1] as const;

function AttemptVideoRow({ video, onDelete }: { video: PrivateAttemptVideo; onDelete: () => void }) {
  const { t } = useTranslation('climbs');
  const { systemColors, brandColors } = useTheme();
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [sourceError, setSourceError] = useState(false);
  const player = useVideoPlayer(null, (createdPlayer) => {
    createdPlayer.loop = true;
  });

  useEffect(() => {
    let active = true;
    setSourceError(false);
    void protectedPrivateAttemptVideoSource(video.playbackPath)
      .then((source) => {
        if (active) return player.replaceAsync(source);
      })
      .catch(() => {
        if (active) setSourceError(true);
      });
    return () => {
      active = false;
    };
  }, [player, video.playbackPath]);

  const handleSpeed = useCallback(
    (nextSpeed: (typeof SPEEDS)[number]) => {
      setSpeed(nextSpeed);
      player.playbackRate = nextSpeed;
    },
    [player],
  );

  return (
    <View style={[styles.videoRow, { borderColor: systemColors.separator }]}>
      {sourceError ? (
        <View style={[styles.video, styles.videoFallback, { backgroundColor: systemColors.fill }]}>
          <Icon name="video" size={34} color={systemColors.secondaryLabel} />
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls
          surfaceType="textureView"
          accessibilityLabel={t('attemptVideos.videoAria')}
        />
      )}
      <View style={styles.metaRow}>
        <View style={styles.metaText}>
          <Text variant="subheadline">{new Date(video.recordedAt).toLocaleString()}</Text>
          <Text variant="caption1" color={systemColors.secondaryLabel}>
            {t('attemptVideos.duration', { seconds: Math.max(1, Math.round(video.durationMs / 1000)) })}
          </Text>
        </View>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={t('attemptVideos.deleteAria')}
          style={styles.deleteButton}
        >
          <Icon name="delete" size={22} color={brandColors.error} />
        </Pressable>
      </View>
      <View accessibilityRole="radiogroup" style={[styles.speedControl, { backgroundColor: systemColors.fill }]}>
        {SPEEDS.map((candidate) => (
          <Pressable
            key={candidate}
            onPress={() => handleSpeed(candidate)}
            accessibilityRole="radio"
            accessibilityState={{ checked: speed === candidate }}
            accessibilityLabel={`${candidate}x`}
            style={[styles.speedButton, speed === candidate && { backgroundColor: systemColors.elevatedSurface }]}
          >
            <Text variant="caption1" color={speed === candidate ? brandColors.primary : systemColors.secondaryLabel}>
              {candidate}x
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function PrivateAttemptVideosSection({ climbUuid, layoutId, angle }: PrivateAttemptVideosSectionProps) {
  const { t } = useTranslation('climbs');
  const queryClient = useQueryClient();
  const { systemColors } = useTheme();
  const { data: cloudVideos, isLoading: cloudLoading } = usePrivateAttemptVideos(climbUuid, layoutId, angle);
  const localQueryKey = localAttemptVideosQueryKey(climbUuid, layoutId, angle);
  const { data: localVideos, isLoading: localLoading } = useQuery({
    queryKey: localQueryKey,
    queryFn: () => listLocalAttemptVideos(climbUuid, layoutId, angle),
  });
  const videos = [...(localVideos ?? []), ...(cloudVideos ?? [])];

  const confirmDelete = useCallback(
    (videoUuid: string) => {
      Alert.alert(t('attemptVideos.deleteTitle'), t('attemptVideos.deleteBody'), [
        { text: t('attemptVideos.cancel'), style: 'cancel' },
        {
          text: t('attemptVideos.delete'),
          style: 'destructive',
          onPress: () => {
            const video = videos.find((item) => item.uuid === videoUuid);
            const deletion =
              video && isLocalAttemptVideo(video)
                ? deleteLocalAttemptVideo(videoUuid)
                : deletePrivateAttemptUpload(videoUuid);
            void deletion.then(() =>
              queryClient.invalidateQueries({
                queryKey:
                  video && isLocalAttemptVideo(video)
                    ? localQueryKey
                    : privateAttemptVideosQueryKey(climbUuid, layoutId, angle),
              }),
            );
          },
        },
      ]);
    },
    [angle, climbUuid, layoutId, localQueryKey, queryClient, t, videos],
  );

  if (localLoading && cloudLoading && videos.length === 0) {
    return (
      <View style={styles.state} accessibilityLabel={t('attemptVideos.loading')}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!videos?.length) {
    return (
      <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.stateText}>
        {t('attemptVideos.empty')}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {videos.map((video) => (
        <AttemptVideoRow key={video.uuid} video={video} onDelete={() => confirmDelete(video.uuid)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[4] },
  videoRow: { gap: spacing[2], paddingBottom: spacing[4], borderBottomWidth: StyleSheet.hairlineWidth },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 520, backgroundColor: '#000000' },
  videoFallback: { alignItems: 'center', justifyContent: 'center' },
  metaRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  metaText: { flex: 1, gap: 2 },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  speedControl: { alignSelf: 'flex-start', flexDirection: 'row', padding: 3, borderRadius: 8 },
  speedButton: { minWidth: 54, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  state: { minHeight: 90, alignItems: 'center', justifyContent: 'center' },
  stateText: { paddingVertical: spacing[4] },
});
