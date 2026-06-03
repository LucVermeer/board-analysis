import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
  type BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Text } from '../Text';
import { getHttpClient } from '../../lib/graphql/client';
import { GET_ANGLES, type GetAnglesQueryResponse } from '../../lib/graphql/operations';
import { useClimbStatsHistory } from '../../lib/graphql/hooks';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { buildAngleStatsMap, type AngleStats } from './community-utils';
import { AngleBoardDiagram } from './AngleBoardDiagram';
import { AngleGlyph } from './AngleGlyph';
import { hapticSelection } from '../../lib/haptics';
import { iosSystemColors } from '../../theme/ios-colors';
import { brandColors } from '../../theme/colors';
import { spacing, sheetStyles } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type AngleSelectorSheetProps = {
  visible: boolean;
  onClose: () => void;
  boardName: string;
  layoutId: number;
  /** Current climb, used to fetch per-angle grade/quality/sends. Optional —
   *  the diagram + angle list still render without it. */
  climbUuid?: string;
  currentAngle: number;
  onAngleChange: (angle: number) => void;
};

type AngleItem = { angle: number };

export const AngleSelectorSheet = memo(function AngleSelectorSheet({
  visible,
  onClose,
  boardName,
  layoutId,
  climbUuid,
  currentAngle,
  onAngleChange,
}: AngleSelectorSheetProps) {
  const { t } = useTranslation('session');
  const { systemColors } = useTheme();
  const { gradeFormat } = useGradeFormat();
  const sheetRef = useRef<BottomSheet>(null);
  const flatListRef = useRef<BottomSheetFlatListMethods | null>(null);

  const snapPoints = useMemo(() => ['65%'], []);

  const { data: anglesData } = useQuery({
    queryKey: ['angles', boardName, layoutId],
    queryFn: async () => {
      const client = getHttpClient();
      const response = await client.request<GetAnglesQueryResponse>(GET_ANGLES, {
        boardName,
        layoutId,
      });
      return response.angles;
    },
  });

  const angles = useMemo(() => anglesData ?? [], [anglesData]);

  // Per-angle grade/quality/sends for the open climb. The all-angle history is
  // cached (shared with the Community section), so the grade columns fill in
  // shortly after the sheet opens and stay instant on reopen.
  const { data: statsHistory } = useClimbStatsHistory(boardName, climbUuid ?? null);
  const statsByAngle = useMemo(() => buildAngleStatsMap(statsHistory, gradeFormat), [statsHistory, gradeFormat]);

  // Refs to access latest values without adding deps that re-fire the effect
  const isOpenRef = useRef(false);
  const anglesRef = useRef(angles);
  anglesRef.current = angles;
  const currentAngleRef = useRef(currentAngle);
  currentAngleRef.current = currentAngle;

  useEffect(() => {
    if (visible) {
      if (isOpenRef.current) {
        // Already open — skip re-triggering
        return undefined;
      }
      isOpenRef.current = true;
      sheetRef.current?.snapToIndex(0);

      // Auto-scroll to current angle after a short delay to let the list render
      const currentIndex = anglesRef.current.findIndex((angleItem) => angleItem.angle === currentAngleRef.current);
      if (currentIndex >= 0) {
        const scrollTimer = setTimeout(() => {
          try {
            flatListRef.current?.scrollToIndex?.({
              index: currentIndex,
              animated: true,
              viewPosition: 0.5,
            });
          } catch {
            // scrollToIndex can throw if layout hasn't been computed yet
          }
        }, 300);
        return () => clearTimeout(scrollTimer);
      }
    } else {
      isOpenRef.current = false;
      sheetRef.current?.close();
    }
    return undefined;
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleAnglePress = useCallback(
    (angle: number) => {
      hapticSelection();
      onAngleChange(angle);
      onClose();
    },
    [onAngleChange, onClose],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const backgroundStyle = { ...sheetStyles.background, backgroundColor: systemColors.secondaryBackground };

  const renderAngleRow = useCallback(
    ({ item }: { item: AngleItem }) => {
      const isSelected = item.angle === currentAngle;
      const stats: AngleStats | undefined = statsByAngle.get(item.angle);
      const hasQuality = stats?.quality != null && stats.quality > 0;
      const sendsLabel = stats && stats.sends > 0 ? t('mobile.angleSelector.sends', { count: stats.sends }) : null;

      // Compose an accessible label so VoiceOver reads the stats, not just "40°".
      const a11yParts = [`${item.angle}°`];
      if (stats?.gradeName) a11yParts.push(stats.gradeName);
      if (hasQuality && stats) a11yParts.push(`★ ${stats.quality?.toFixed(1)}`);
      if (sendsLabel) a11yParts.push(sendsLabel);

      return (
        <Pressable
          onPress={() => handleAnglePress(item.angle)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={a11yParts.join(', ')}
          style={({ pressed }) => [
            styles.angleRow,
            isSelected && styles.angleRowSelected,
            pressed && styles.angleRowPressed,
          ]}
        >
          <View style={styles.angleRowLeft}>
            <AngleGlyph angle={item.angle} size={24} />
            <Text
              variant="body"
              style={[styles.angleText, { color: systemColors.label }, isSelected && styles.angleTextSelected]}
            >
              {item.angle}°
            </Text>
          </View>
          <View style={styles.angleRowRight}>
            {stats?.gradeName && (
              <Text variant="caption1" style={[styles.gradeText, { color: stats.color }]}>
                {stats.gradeName}
              </Text>
            )}
            {hasQuality && stats && (
              <Text variant="caption1" style={styles.qualityText}>
                ★ {stats.quality?.toFixed(1)}
              </Text>
            )}
            {sendsLabel && (
              <Text variant="caption2" style={[styles.sendsText, { color: systemColors.secondaryLabel }]}>
                {sendsLabel}
              </Text>
            )}
            {isSelected && <View style={styles.selectedIndicator} />}
          </View>
        </Pressable>
      );
    },
    [currentAngle, handleAnglePress, statsByAngle, t],
  );

  const keyExtractor = useCallback((item: AngleItem) => String(item.angle), []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={handleClose}
      handleIndicatorStyle={sheetStyles.indicator}
      backgroundStyle={backgroundStyle}
    >
      <View style={styles.hero}>
        <Text variant="headline">{t('mobile.angleSelector.title')}</Text>
        <AngleBoardDiagram
          angle={currentAngle}
          size={140}
          accessibilityLabel={t('mobile.angleSelector.diagramAria', { angle: currentAngle })}
        />
        <Text variant="caption2" style={[styles.hint, { color: systemColors.secondaryLabel }]}>
          {t('mobile.angleSelector.fromVerticalHint')}
        </Text>
      </View>
      <BottomSheetFlatList
        ref={flatListRef}
        data={angles}
        keyExtractor={keyExtractor}
        renderItem={renderAngleRow}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_data, index) => ({
          length: ANGLE_ROW_HEIGHT,
          offset: ANGLE_ROW_HEIGHT * index,
          index,
        })}
      />
    </BottomSheet>
  );
});

const ANGLE_ROW_HEIGHT = 52;

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    gap: spacing[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iosSystemColors.separator,
  },
  hint: {},
  listContent: {
    paddingBottom: spacing[8],
  },
  angleRow: {
    height: ANGLE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iosSystemColors.separator,
  },
  angleRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  angleRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  angleRowSelected: {
    backgroundColor: `${brandColors.primary}14`,
  },
  angleRowPressed: {
    opacity: 0.6,
  },
  angleText: {},
  angleTextSelected: {
    fontWeight: '600',
    color: brandColors.primary,
  },
  gradeText: {
    fontWeight: '600',
  },
  qualityText: {
    color: iosSystemColors.starGold,
  },
  sendsText: {},
  selectedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brandColors.primary,
  },
});
