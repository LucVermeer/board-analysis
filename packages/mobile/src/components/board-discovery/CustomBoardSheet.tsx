import { forwardRef, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { BoardName, UserBoard } from '@boardsesh/shared-schema';
import { SUPPORTED_BOARDS, ANGLES } from '@boardsesh/board-config';
import {
  getAllLayouts,
  getSizesForLayoutId,
  getSetsForLayoutAndSize,
  getDefaultSizeForLayout,
} from '@boardsesh/board-constants/product-sizes';
import { useCreateBoard } from '../../lib/graphql/hooks';
import { spacing, borderRadius } from '../../theme/tokens';
import { brandColors } from '../../theme/colors';
import { useTheme } from '../../providers/theme-provider';
import { Sheet } from '../Sheet';
import { Text } from '../Text';
import { Button } from '../Button';

type CustomBoardSheetProps = {
  /** Resolves once the board is created server-side (CREATE_BOARD). */
  onCreated: (board: UserBoard) => void;
  onError: () => void;
};

/**
 * Custom-board builder: cascading board → layout → size → sets → angle, driven
 * entirely by static `@boardsesh/board-config` + `@boardsesh/board-constants`
 * data (no server query). Confirming persists the config via CREATE_BOARD —
 * the active board needs a real UserBoard (uuid/slug), matching the web flow.
 */
export const CustomBoardSheet = forwardRef<BottomSheet, CustomBoardSheetProps>(function CustomBoardSheet(
  { onCreated, onError },
  ref,
) {
  const { systemColors } = useTheme();
  const { t } = useTranslation('boards');
  const createBoard = useCreateBoard();

  const [boardName, setBoardName] = useState<BoardName>(SUPPORTED_BOARDS[0]);
  const [layoutId, setLayoutId] = useState<number | null>(null);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [setIds, setSetIds] = useState<number[]>([]);
  const [angle, setAngle] = useState<number>(40);

  // Cascading option lists — each derives from the selection above it.
  const layouts = useMemo(() => getAllLayouts(boardName), [boardName]);
  const sizes = useMemo(() => (layoutId != null ? getSizesForLayoutId(boardName, layoutId) : []), [boardName, layoutId]);
  const sets = useMemo(
    () => (layoutId != null && sizeId != null ? getSetsForLayoutAndSize(boardName, layoutId, sizeId) : []),
    [boardName, layoutId, sizeId],
  );
  const angles = ANGLES[boardName] ?? [];

  // Reset everything below a changed level so the cascade stays consistent.
  const selectBoard = (next: BoardName) => {
    setBoardName(next);
    setLayoutId(null);
    setSizeId(null);
    setSetIds([]);
    setAngle((ANGLES[next] ?? []).includes(40) ? 40 : (ANGLES[next]?.[0] ?? 0));
  };
  const selectLayout = (next: number) => {
    setLayoutId(next);
    const defaultSize = getDefaultSizeForLayout(boardName, next);
    setSizeId(defaultSize);
    setSetIds(defaultSize != null ? getSetsForLayoutAndSize(boardName, next, defaultSize).map((s) => s.id) : []);
  };
  const selectSize = (next: number) => {
    setSizeId(next);
    // Pre-select all sets for the size (the common case).
    setSetIds(layoutId != null ? getSetsForLayoutAndSize(boardName, layoutId, next).map((s) => s.id) : []);
  };
  const toggleSet = (id: number) => {
    setSetIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const canCreate = layoutId != null && sizeId != null && setIds.length > 0 && !createBoard.isPending;

  const handleCreate = async () => {
    if (layoutId == null || sizeId == null || setIds.length === 0) return;
    const layoutName = layouts.find((l) => l.id === layoutId)?.name ?? boardName;
    try {
      const board = await createBoard.mutateAsync({
        boardType: boardName,
        layoutId,
        sizeId,
        setIds: setIds.join(','),
        name: layoutName,
        angle,
        isOwned: true,
      });
      onCreated(board);
    } catch {
      onError();
    }
  };

  const renderChips = <T,>(
    options: T[],
    getKey: (o: T) => number | string,
    getLabel: (o: T) => string,
    isSelected: (o: T) => boolean,
    onSelect: (o: T) => void,
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((option) => {
        const selected = isSelected(option);
        return (
          <Pressable
            key={getKey(option)}
            onPress={() => onSelect(option)}
            style={[
              styles.chip,
              {
                borderColor: selected ? brandColors.primary : systemColors.separator,
                backgroundColor: selected ? brandColors.primary : 'transparent',
              },
            ]}
          >
            <Text variant="footnote" color={selected ? '#fff' : systemColors.label}>
              {getLabel(option)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <Sheet ref={ref} snapPoints={['85%']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="title3" style={styles.heading}>
          {t('mobile.custom.title')}
        </Text>

        <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
          {t('mobile.custom.board')}
        </Text>
        {renderChips(
          SUPPORTED_BOARDS,
          (b) => b,
          (b) => b,
          (b) => b === boardName,
          (b) => selectBoard(b),
        )}

        <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
          {t('mobile.custom.layout')}
        </Text>
        {renderChips(
          layouts,
          (l) => l.id,
          (l) => l.name,
          (l) => l.id === layoutId,
          (l) => selectLayout(l.id),
        )}

        {sizes.length > 0 ? (
          <>
            <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
              {t('mobile.custom.size')}
            </Text>
            {renderChips(
              sizes,
              (s) => s.id,
              (s) => s.name,
              (s) => s.id === sizeId,
              (s) => selectSize(s.id),
            )}
          </>
        ) : null}

        {sets.length > 0 ? (
          <>
            <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
              {t('mobile.custom.sets')}
            </Text>
            {renderChips(
              sets,
              (s) => s.id,
              (s) => s.name,
              (s) => setIds.includes(s.id),
              (s) => toggleSet(s.id),
            )}
          </>
        ) : null}

        {angles.length > 0 ? (
          <>
            <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.sectionLabel}>
              {t('mobile.custom.angle')}
            </Text>
            {renderChips(
              angles,
              (a) => a,
              (a) => `${a}°`,
              (a) => a === angle,
              (a) => setAngle(a),
            )}
          </>
        ) : null}

        <Button
          title={t('mobile.custom.start')}
          onPress={handleCreate}
          variant="filled"
          size="large"
          disabled={!canCreate}
          loading={createBoard.isPending}
          style={styles.cta}
        />
      </ScrollView>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  content: {
    padding: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[2],
  },
  heading: {
    marginBottom: spacing[2],
  },
  sectionLabel: {
    marginTop: spacing[3],
    marginBottom: spacing[1],
    textTransform: 'uppercase',
  },
  chipRow: {
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    marginTop: spacing[6],
  },
});
