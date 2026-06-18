import React, { useMemo } from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import type { BoardName, Climb } from '@boardsesh/shared-schema';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { BoardImageNative } from '../BoardImageNative';
import { ClimbAttributeIcons } from '../ClimbAttributeIcons';
import { getBoardRenderData } from '../../lib/board-details';
import { useGradeFormat } from '../../hooks/use-grade-format';
import type { BoardConfig } from '../../providers/drawer-host-provider';
import { spacing, borderRadius } from '../../theme/tokens';

// Longest edge of the floated board art — ~2× the 76×96 list cell so the climb
// reads as "blown up" in the preview.
const PREVIEW_ART_MAX_SIZE = 176;

type ClimbContextPreviewProps = {
  climb: Climb;
  boardConfig: BoardConfig;
};

// Fit the native board aspect ratio into a square of `maxSize` (mirrors
// AccessoryClimbThumbnail) so a portrait board doesn't stretch.
function fitBoardArt(boardWidth: number, boardHeight: number, maxSize: number) {
  const aspect = boardWidth / boardHeight;
  if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxSize, height: maxSize };
  return aspect >= 1 ? { width: maxSize, height: maxSize / aspect } : { width: maxSize * aspect, height: maxSize };
}

/**
 * The "larger version of the climb" that floats above the blurred background when a
 * row is long-pressed on iOS. Rendered into `react-native-context-menu-view`'s
 * `preview` slot — a standalone card (enlarged board art + name + grade) sized to its
 * own intrinsic content, independent of the list row it lifted from.
 *
 * Perf: the library mounts the preview eagerly for every wrapped row, so the art is
 * drawn via `BoardImageNative` with `filledStyle renderWidth={400}` — the SAME cache
 * key the list thumbnails use (`_f_` + `_w400_`), so a climb already seen in the list
 * is an instant cache hit and no second, larger PNG is rendered per visible row. The
 * 400px source is displayed at ~176px, so it stays crisp. Memoized by climb identity.
 */
export const ClimbContextPreview = React.memo(function ClimbContextPreview({
  climb,
  boardConfig,
}: ClimbContextPreviewProps) {
  const { formatGrade } = useGradeFormat();

  const gradeColor = getGradeColor(climb.difficulty) ?? DEFAULT_GRADE_COLOR;
  const formattedGrade = formatGrade(climb.difficulty);

  const boardRenderData = useMemo(() => {
    const setIdValues = boardConfig.setIds
      .split(',')
      .map((setIdText) => Number(setIdText))
      .filter((setIdValue) => Number.isFinite(setIdValue));
    if (setIdValues.length === 0) return null;
    return getBoardRenderData({
      boardName: boardConfig.boardName as BoardName,
      layoutId: boardConfig.layoutId,
      sizeId: boardConfig.sizeId,
      setIds: setIdValues,
    });
  }, [boardConfig]);

  const artStyle = useMemo<ViewStyle | null>(() => {
    if (!boardRenderData) return null;
    const fitted = fitBoardArt(boardRenderData.boardWidth, boardRenderData.boardHeight, PREVIEW_ART_MAX_SIZE);
    return { width: fitted.width, height: fitted.height, borderRadius: borderRadius.md, overflow: 'hidden' };
  }, [boardRenderData]);

  // No background here: the native context-menu container supplies it via
  // `previewBackgroundColor` + `borderRadius`, so the rounded corners and the fill
  // can't mismatch.
  return (
    <View style={styles.card}>
      {boardRenderData && artStyle ? (
        <BoardImageNative
          frames={climb.frames}
          boardName={boardConfig.boardName as BoardName}
          layoutId={boardConfig.layoutId}
          sizeId={boardConfig.sizeId}
          setIds={boardConfig.setIds}
          boardWidth={boardRenderData.boardWidth}
          boardHeight={boardRenderData.boardHeight}
          mirrored={climb.mirrored === true}
          filledStyle
          renderWidth={400}
          style={artStyle}
        />
      ) : null}
      <View style={styles.textColumn}>
        <View style={styles.nameRow}>
          <Text variant="headline" numberOfLines={2} style={styles.name}>
            {climb.name}
          </Text>
          <ClimbAttributeIcons isNoMatch={climb.is_no_match} benchmarkDifficulty={climb.benchmark_difficulty} />
        </View>
        <Text variant="title3" numberOfLines={1} style={[styles.grade, { color: gradeColor }]}>
          {formattedGrade ?? climb.difficulty}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
    // Cap the width so a long climb name wraps instead of stretching the preview
    // across the whole screen; the native preview sizes to this intrinsic width.
    maxWidth: 248,
  },
  textColumn: {
    alignItems: 'center',
    gap: spacing[1],
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  name: {
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  grade: {
    fontWeight: '700',
  },
});
