import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { toBoardName } from '@boardsesh/board-config';
import { SHARED_EVENTS } from '@boardsesh/analytics';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import type { ClimbQueueItem } from '@boardsesh/queue';
import { track } from '../../../lib/analytics';
import { Button } from '../../Button';
import { Text } from '../../Text';
import type { QueueItemRowBoard } from '../../QueueItemRow';
import { useTheme } from '../../../providers/theme-provider';
import { borderRadius, spacing } from '../../../theme/tokens';
import { useActiveBoard } from '../../../lib/graphql/use-active-board';
import { useAuth } from '../../../providers/auth-provider';
import { useQueueActions } from '../../../providers/queue-provider';
import { useToast } from '../../../providers/toast-provider';
import { useDrawerHost } from '../../../providers/drawer-host-provider';
import { useBottomChromeMetrics } from '../../../hooks/use-bottom-chrome-metrics';
import { BoardSummaryCard } from './BoardSummaryCard';
import { GeneratorPickerCard, type GeneratorSelection } from './GeneratorPickerCard';
import { WorkoutPreviewRow } from './WorkoutPreviewRow';
import { useWorkoutPreview } from './use-workout-preview';
import type { PreviewItem } from './workout-preview-pool';

/**
 * First screen of the session overlay before a session is live: pick a board,
 * optionally generate a workout, review (and tweak) a live preview of the queue,
 * then tap Start. The preview is built/refreshed by `useWorkoutPreview`; Start
 * replaces the user's queue with the preview and lazily creates the session, so
 * SessionScreen re-renders into InSessionView when `sessionId` flips.
 */
function previewKeyExtractor(previewItem: PreviewItem): string {
  return previewItem.item.uuid;
}

export function PreSessionView() {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const { data: activeBoard } = useActiveBoard();
  const { isAuthenticated } = useAuth();
  const { startSession, setQueue } = useQueueActions();
  const { openPlayDrawer } = useDrawerHost();
  const { showToast } = useToast();

  const [selection, setSelection] = useState<GeneratorSelection>({ type: 'off' });
  const [isStarting, setIsStarting] = useState(false);
  const [activePreviewUuid, setActivePreviewUuid] = useState<string | null>(null);

  const preview = useWorkoutPreview(selection, activeBoard ?? null, { isAuthenticated });
  const { items: previewItems, status, refreshingUuids, plannedCount, refreshSlot, toQueueItems } = preview;

  // Board context for the preview rows (thumbnails + grade colours).
  const previewBoard = useMemo<QueueItemRowBoard | null>(() => {
    if (!activeBoard) return null;
    return {
      boardName: activeBoard.boardType as BoardName,
      layoutId: activeBoard.layoutId,
      sizeId: activeBoard.sizeId,
      setIds: activeBoard.setIds,
      angle: activeBoard.angle,
    };
  }, [activeBoard]);

  // Preview-only: show the climb in the play drawer and highlight the row, but
  // leave the real queue untouched until Start.
  const handlePreviewPress = useCallback(
    (item: ClimbQueueItem) => {
      setActivePreviewUuid(item.uuid);
      openPlayDrawer(item.climb as Climb, { setAsCurrent: false, previewQueueItem: item });
    },
    [openPlayDrawer],
  );

  const renderPreviewRow = useCallback(
    ({ item: previewItem }: { item: PreviewItem }) => {
      if (!previewBoard) return null;
      return (
        <WorkoutPreviewRow
          item={previewItem.item}
          board={previewBoard}
          isActive={previewItem.item.uuid === activePreviewUuid}
          isRefreshing={refreshingUuids.has(previewItem.item.uuid)}
          onPress={handlePreviewPress}
          onRefresh={refreshSlot}
        />
      );
    },
    [previewBoard, activePreviewUuid, refreshingUuids, handlePreviewPress, refreshSlot],
  );

  const handleStart = useCallback(async () => {
    if (!activeBoard) return;
    const generatedItems = selection.type === 'on' ? toQueueItems() : [];
    if (selection.type === 'on' && (status !== 'ready' || refreshingUuids.size > 0 || generatedItems.length === 0)) {
      return;
    }

    setIsStarting(true);
    try {
      const newSessionId = await startSession();
      if (!newSessionId) {
        // startSession already toasted on failure; just bail.
        return;
      }

      if (selection.type === 'on') {
        // Replace the queue with the reviewed preview (set the first climb
        // current so the session opens on climb #1). setQueue dispatches
        // UPDATE_QUEUE locally + best-effort party sync.
        setQueue(generatedItems, generatedItems[0]);
        track(SHARED_EVENTS.SessionQueueGenerated, {
          workoutType: selection.options.type,
          boardName: activeBoard.boardType,
          angle: activeBoard.angle,
          savedCount: generatedItems.length,
          failedCount: plannedCount - generatedItems.length,
        });
      }
    } catch {
      showToast(t('mobile.session.preStartError'), 'error');
    } finally {
      setIsStarting(false);
    }
  }, [
    activeBoard,
    selection,
    toQueueItems,
    status,
    refreshingUuids,
    plannedCount,
    startSession,
    setQueue,
    showToast,
    t,
  ]);

  const generatorPreviewReady =
    selection.type !== 'on' || (status === 'ready' && previewItems.length > 0 && refreshingUuids.size === 0);
  const canStart = activeBoard != null && !isStarting && generatorPreviewReady;
  const footerBottomPadding = bottomChrome.scrollBottomPadding + spacing[3];

  // Inline status copy shown above an empty preview (loading / no results /
  // error). When rows are already present a rebuild keeps them mounted, so these
  // only render while the preview is empty.
  const showPreviewSection = selection.type === 'on';
  const previewStateMessage =
    previewItems.length > 0
      ? null
      : status === 'loading'
        ? t('mobile.session.preWorkoutPreviewGenerating')
        : status === 'error'
          ? t('mobile.session.preWorkoutPreviewError')
          : status === 'ready'
            ? t('mobile.session.preWorkoutPreviewEmpty')
            : null;

  const listHeader = (
    <View style={styles.header}>
      <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.eyebrow}>
        {t('mobile.session.headerStart')}
      </Text>

      <BoardSummaryCard board={activeBoard ?? null} />

      <GeneratorPickerCard
        boardName={activeBoard ? toBoardName(activeBoard.boardType) : null}
        layoutId={activeBoard?.layoutId ?? null}
        sizeId={activeBoard?.sizeId ?? null}
        angle={activeBoard?.angle ?? null}
        selection={selection}
        onChange={setSelection}
      />

      {showPreviewSection ? (
        <View style={styles.previewSection}>
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
            {t('mobile.session.preWorkoutPreviewTitle')}
          </Text>
          {previewStateMessage ? (
            <View style={[styles.stateCard, { backgroundColor: systemColors.secondaryBackground }]}>
              <Text variant="body" color={systemColors.secondaryLabel}>
                {previewStateMessage}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlashList
        style={styles.list}
        data={previewItems}
        renderItem={renderPreviewRow}
        keyExtractor={previewKeyExtractor}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingBottom: 100 + footerBottomPadding }}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.footer, { backgroundColor: systemColors.background, paddingBottom: footerBottomPadding }]}>
        <Button
          title={isStarting ? t('mobile.session.preStarting') : t('mobile.session.preStart')}
          onPress={() => void handleStart()}
          variant="filled"
          size="large"
          disabled={!canStart}
          loading={isStarting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[4],
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewSection: {
    gap: spacing[2],
  },
  sectionLabel: {
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0,
  },
  stateCard: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
});
