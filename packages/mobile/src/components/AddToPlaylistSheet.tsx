import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { Climb } from '@boardsesh/shared-schema';
import { Sheet } from './Sheet';
import { ListRow } from './ListRow';
import { Icon } from './Icon';
import { Text } from './Text';
import { useToast } from '../providers/toast-provider';
import { usePlaylistsContext, type Playlist } from '../providers/playlists-provider';
import { useTheme } from '../providers/theme-provider';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing } from '../theme/tokens';

type AddToPlaylistSheetProps = {
  visible: boolean;
  climb: Climb | null;
  angle: number;
  onClose: () => void;
};

// Mirrors web's isValidHexColor gate before rendering a playlist's accent: a
// stray value would otherwise paint the leading swatch an undefined colour.
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function validHexColor(color: string | undefined): string | null {
  return color && HEX_COLOR.test(color) ? color : null;
}

function AddToPlaylistSheet({ visible, climb, angle, onClose }: AddToPlaylistSheetProps) {
  const { t } = useTranslation('climbs');
  const { brandColors, systemColors } = useTheme();
  const { showToast } = useToast();
  const { playlists, addToPlaylist, isLoading, isAuthenticated } = usePlaylistsContext();
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (visible && climb) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible, climb]);

  const handleAddToPlaylist = useCallback(
    async (playlist: Playlist) => {
      if (!climb) return;
      try {
        await addToPlaylist(playlist.id, climb.uuid, angle);
        showToast(t('actions.playlist.toast.added'), 'success');
      } catch (error) {
        // The toast is intentionally generic, but a swallowed error makes
        // "failed to add" impossible to diagnose. Log the real reason in dev.
        if (__DEV__) {
          console.warn('[playlist] add to playlist failed', {
            playlistId: playlist.id,
            climbUuid: climb.uuid,
            angle,
            error,
          });
        }
        showToast(t('actions.playlist.toast.addFailed'), 'error');
      } finally {
        onClose();
      }
    },
    [climb, angle, addToPlaylist, showToast, t, onClose],
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const snapPoints = useMemo(() => ['50%', '90%'], []);

  return (
    <Sheet ref={sheetRef} snapPoints={snapPoints} onClose={handleClose} enablePanDownToClose scrollable>
      <View style={styles.header}>
        <Icon name="playlist" size={20} color={systemColors.accent} />
        <Text variant="headline" style={styles.headerTitle}>
          {t('actions.playlist.popover.title')}
        </Text>
      </View>

      {!climb ? null : !isAuthenticated ? (
        <View style={styles.message}>
          <Text variant="subheadline" color={iosSystemColors.systemGray}>
            {t('actions.playlist.popover.signInBlurb')}
          </Text>
        </View>
      ) : isLoading ? (
        <View style={styles.message}>
          <ActivityIndicator />
        </View>
      ) : playlists.length === 0 ? (
        <View style={styles.message}>
          <Text variant="subheadline" color={iosSystemColors.systemGray}>
            {t('actions.playlist.popover.empty')}
          </Text>
        </View>
      ) : (
        playlists.map((playlist, index) => {
          const accent = validHexColor(playlist.color);
          return (
            <ListRow
              key={playlist.id}
              title={playlist.name}
              subtitle={t('multiboardList.count', { count: playlist.climbCount })}
              leading={<Icon name="playlist" size={22} color={accent ?? brandColors.primary} />}
              onPress={() => {
                void handleAddToPlaylist(playlist);
              }}
              showSeparator={index < playlists.length - 1}
            />
          );
        })
      )}
    </Sheet>
  );
}

export { AddToPlaylistSheet };

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  headerTitle: {
    flexShrink: 1,
  },
  message: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
  },
});
