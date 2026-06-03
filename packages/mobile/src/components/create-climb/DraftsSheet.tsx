import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { BottomSheetModal, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { BoardName, Climb, ClimbSearchInput } from '@boardsesh/shared-schema';
import { ModalSheet } from '../ModalSheet';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { ActivityIndicator } from '../ActivityIndicator';
import { useTheme } from '../../providers/theme-provider';
import { useToast } from '../../providers/toast-provider';
import { useSearchClimbs, useDeleteDraftClimb } from '../../lib/graphql/hooks';
import { hapticLight } from '../../lib/haptics';
import { spacing, borderRadius } from '../../theme/tokens';
import { iosSystemColors } from '../../theme/ios-colors';

type BoardConfig = {
  boardName: BoardName;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number;
};

type DraftsSheetProps = {
  visible: boolean;
  board: BoardConfig;
  onLoadDraft: (climb: Climb) => void;
  onDismiss: () => void;
};

// Count painted holds in an Aurora frames string (`p{id}r{code}` per hold).
function countHolds(frames: string): number {
  const matches = frames.match(/p\d+r\d+/g);
  return matches ? matches.length : 0;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (seconds < 60) return formatter.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return formatter.format(-days, 'day');
  const months = Math.round(days / 30);
  if (months < 12) return formatter.format(-months, 'month');
  return formatter.format(-Math.round(months / 12), 'year');
}

/**
 * Lists the climber's saved draft climbs for the active board. Tapping a draft
 * loads it back into the editor; the trash icon deletes it (with confirm).
 */
export function DraftsSheet({ visible, board, onLoadDraft, onDismiss }: DraftsSheetProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();
  const { showToast } = useToast();
  const sheetRef = useRef<BottomSheetModal>(null);
  const deleteDraft = useDeleteDraftClimb();

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const searchInput = useMemo<ClimbSearchInput>(
    () => ({
      boardName: board.boardName,
      layoutId: board.layoutId,
      sizeId: board.sizeId,
      setIds: board.setIds,
      angle: board.angle,
      page: 1,
      pageSize: 50,
      onlyDrafts: true,
      sortBy: 'creation',
      sortOrder: 'desc',
    }),
    [board],
  );

  const { data, isLoading, isError } = useSearchClimbs(searchInput, visible);
  const drafts = data?.climbs ?? [];

  const handleDelete = useCallback(
    (climb: Climb) => {
      Alert.alert(t('draftsDrawer.delete.title'), t('draftsDrawer.delete.description'), [
        { text: t('createClimbForm.dismiss'), style: 'cancel' },
        {
          text: t('draftsDrawer.delete.confirm'),
          style: 'destructive',
          onPress: () => {
            deleteDraft.mutate(
              { uuid: climb.uuid, boardType: board.boardName },
              {
                onSuccess: () => showToast(t('draftsDrawer.delete.success'), 'success'),
                onError: () => showToast(t('draftsDrawer.delete.error'), 'error'),
              },
            );
          },
        },
      ]);
    },
    [board.boardName, deleteDraft, showToast, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: Climb }) => {
      const holdCount = countHolds(item.frames);
      const relative = formatRelativeTime(item.created_at);
      const subtitleParts = [t('mobile.create.drafts.holds', { count: holdCount }), relative].filter(Boolean);
      return (
        <View style={styles.row}>
          <Pressable
            onPress={() => {
              hapticLight();
              onLoadDraft(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={item.name || t('createClimbForm.draftBadge')}
            style={styles.rowMain}
          >
            <Text variant="body" numberOfLines={1}>
              {item.name || t('createClimbForm.draftBadge')}
            </Text>
            <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
              {subtitleParts.join(' · ')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleDelete(item)}
            accessibilityRole="button"
            accessibilityLabel={t('draftsDrawer.delete.tooltip')}
            hitSlop={8}
            style={styles.deleteButton}
          >
            <Icon name="delete" size={20} color={iosSystemColors.systemRed} />
          </Pressable>
        </View>
      );
    },
    [handleDelete, onLoadDraft, systemColors.secondaryLabel, t],
  );

  if (!visible) return null;

  return (
    <ModalSheet ref={sheetRef} snapPoints={['72%']} onDismiss={onDismiss}>
      <View style={styles.header}>
        <Text variant="title3">{t('draftsDrawer.title')}</Text>
        {drafts.length > 0 ? (
          <Text variant="footnote" color={systemColors.secondaryLabel}>
            {t('draftsDrawer.count', { count: drafts.length })}
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text variant="subheadline" color={systemColors.secondaryLabel}>
            {t('draftsDrawer.loadError')}
          </Text>
        </View>
      ) : drafts.length === 0 ? (
        <View style={styles.centered}>
          <Text variant="headline">{t('draftsDrawer.empty.title')}</Text>
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptySubtitle}>
            {t('draftsDrawer.empty.subtitle')}
          </Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={drafts}
          keyExtractor={(item) => item.uuid}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    alignItems: 'center',
    gap: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[2],
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iosSystemColors.separator,
    gap: spacing[2],
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  deleteButton: {
    padding: spacing[2],
    borderRadius: borderRadius.md,
  },
});
