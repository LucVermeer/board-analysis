// The bottom sheet that scopes the Home feed: pick the home board, another owned
// board, "Everyone" (global), or jump to gym discovery. Uses ModalSheet so it
// portals above the persistent play bar. Selecting a board row sets the feed to
// "My gym" on that board; "Everyone" drops the board filter; "Find a gym" routes
// to the gym-discovery flow.

import { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { toBoardName, formatBoardDisplayName } from '@boardsesh/board-config';
import type { UserBoard } from '@boardsesh/shared-schema';
import { ModalSheet } from '../ModalSheet';
import { PressableSurface } from '../PressableSurface';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { BoardImageNative } from '../BoardImageNative';
import { getBoardRenderData } from '../../lib/board-details';
import { withAlpha } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

const ROW_ART_SIZE = 40;

type FeedScopeSwitcherSheetProps = {
  /** The inferred home board (the highlighted "Your home board" row). */
  homeBoard: UserBoard | null;
  /** Every owned board (used to derive "Your other boards"). */
  boards: UserBoard[];
  /** The board the feed is currently scoped to; `null` means "Everyone". */
  selectedBoardUuid: string | null;
  /** Pick a board (scopes the feed to "My gym" on it). */
  onSelectBoard: (board: UserBoard) => void;
  /** Pick "Everyone" (drops the board filter). */
  onSelectEveryone: () => void;
  /** Route to gym discovery. */
  onFindGym: () => void;
  onDismiss?: () => void;
};

/** Square board-art thumbnail for a row, rendered from board config (no frames). */
function BoardArtThumbnail({ board }: { board: UserBoard }) {
  const { systemColors } = useTheme();
  const boardName = toBoardName(board.boardType);

  const render = useMemo(() => {
    if (boardName === null) return null;
    return getBoardRenderData({
      boardName,
      layoutId: board.layoutId,
      sizeId: board.sizeId,
      setIds: board.setIds.split(',').map(Number).filter(Number.isFinite),
    });
  }, [boardName, board.layoutId, board.sizeId, board.setIds]);

  return (
    <View
      style={[styles.art, { backgroundColor: systemColors.tertiaryBackground, borderColor: systemColors.separator }]}
    >
      {render && boardName ? (
        <BoardImageNative
          frames=""
          boardName={boardName}
          layoutId={board.layoutId}
          sizeId={board.sizeId}
          setIds={board.setIds}
          boardWidth={render.boardWidth}
          boardHeight={render.boardHeight}
          renderWidth={400}
          style={styles.artImage}
        />
      ) : (
        <View style={styles.artFallback}>
          <Icon name="boards" size={20} color={systemColors.tertiaryLabel} />
        </View>
      )}
    </View>
  );
}

function BoardRow({
  board,
  selected,
  onPress,
}: {
  board: UserBoard;
  selected: boolean;
  onPress: (board: UserBoard) => void;
}) {
  const { t } = useTranslation('feed');
  const { systemColors, brandColors } = useTheme();

  const handlePress = useCallback(() => onPress(board), [board, onPress]);

  const climbers = board.uniqueClimbers;
  const meta = climbers > 0 ? t('mobile.home.scope.climbersActive', { count: climbers }) : null;

  return (
    <PressableSurface
      onPress={handlePress}
      feedback="opacity"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={board.gymName ?? board.name}
      style={[styles.row, selected && { backgroundColor: withAlpha(brandColors.primary as string, 0.12) }]}
    >
      <BoardArtThumbnail board={board} />
      <View style={styles.rowText}>
        <Text variant="headline" numberOfLines={1}>
          {board.gymName ?? board.name}
        </Text>
        {meta ? (
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
            {formatBoardDisplayName(board.boardType)} · {meta}
          </Text>
        ) : (
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
            {formatBoardDisplayName(board.boardType)}
          </Text>
        )}
      </View>
      {selected ? <Icon name="tick" size={22} color={brandColors.primary} /> : null}
    </PressableSurface>
  );
}

function GlyphRow({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: 'people' | 'location';
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { systemColors, brandColors } = useTheme();

  return (
    <PressableSurface
      onPress={onPress}
      feedback="opacity"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={[styles.row, selected && { backgroundColor: withAlpha(brandColors.primary as string, 0.12) }]}
    >
      <View style={[styles.glyph, { backgroundColor: systemColors.tertiaryBackground }]}>
        <Icon name={icon} size={22} color={systemColors.secondaryLabel} />
      </View>
      <View style={styles.rowText}>
        <Text variant="headline" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color={systemColors.secondaryLabel} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="tick" size={22} color={brandColors.primary} /> : null}
    </PressableSurface>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { systemColors } = useTheme();
  return (
    <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
      {children}
    </Text>
  );
}

export const FeedScopeSwitcherSheet = forwardRef<BottomSheetModal, FeedScopeSwitcherSheetProps>(
  function FeedScopeSwitcherSheet(
    { homeBoard, boards, selectedBoardUuid, onSelectBoard, onSelectEveryone, onFindGym, onDismiss },
    ref,
  ) {
    const { t } = useTranslation('feed');
    const { systemColors } = useTheme();

    // Owned boards that aren't the home board (the "Your other boards" section).
    const otherBoards = useMemo(
      () => boards.filter((board) => board.uuid !== homeBoard?.uuid),
      [boards, homeBoard?.uuid],
    );

    return (
      // enableDynamicSizing measures the content's intrinsic height — keep the
      // body off `scrollable` (its flex:1 scroll view would defeat the measure)
      // and on a plain padded View, the way the other dynamically-sized sheets do.
      <ModalSheet ref={ref} enableDynamicSizing onDismiss={onDismiss}>
        <View style={styles.content}>
          <Text variant="title3" style={styles.title}>
            {t('mobile.home.scope.switcherTitle')}
          </Text>

          {homeBoard ? (
            <>
              <SectionLabel>{t('mobile.home.scope.homeBoardSection')}</SectionLabel>
              <BoardRow board={homeBoard} selected={selectedBoardUuid === homeBoard.uuid} onPress={onSelectBoard} />
            </>
          ) : null}

          {otherBoards.length > 0 ? (
            <>
              <SectionLabel>{t('mobile.home.scope.otherBoardsSection')}</SectionLabel>
              {otherBoards.map((board) => (
                <BoardRow
                  key={board.uuid}
                  board={board}
                  selected={selectedBoardUuid === board.uuid}
                  onPress={onSelectBoard}
                />
              ))}
            </>
          ) : null}

          <View style={[styles.divider, { backgroundColor: systemColors.separator }]} />

          <GlyphRow
            icon="people"
            title={t('mobile.home.scope.everyone')}
            subtitle={t('mobile.home.scope.everyoneSubtitle')}
            selected={selectedBoardUuid === null}
            onPress={onSelectEveryone}
          />
          <GlyphRow icon="location" title={t('mobile.home.scope.findGym')} selected={false} onPress={onFindGym} />
        </View>
      </ModalSheet>
    );
  },
);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
  },
  title: {
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingTop: spacing[3],
    paddingBottom: spacing[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  art: {
    width: ROW_ART_SIZE,
    height: ROW_ART_SIZE,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  artFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    width: ROW_ART_SIZE,
    height: ROW_ART_SIZE,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing[3],
  },
});
