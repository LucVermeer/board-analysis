// The grade front door. Grade is 68% of searches and the most-touched control
// in the app, so this is the spine of the search UX:
//   • single tap on a chip = pick that grade and auto-dismiss (the 60% fast path)
//   • a quick second tap extends to a range (the 33% case), keeping the sheet open
//   • the "Any" chip clears
// A low sheet (not the 90% filter mega-sheet) keeps it one-handed. Tap rules are
// the shared, web-identical state machine in @boardsesh/climb-filters.

import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  RANGE_EXTEND_WINDOW_MS,
  clearGradeBound,
  computeGradeTap,
  isAnyGrade,
  isGradeEndpoint,
  isGradeInRange,
  isRangeGrade,
  isSingleGrade,
  type GradeBound,
} from '@boardsesh/climb-filters';
import { getGradeColor, DEFAULT_GRADE_COLOR } from '@boardsesh/board-constants/grade-colors';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { useTheme } from '../../providers/theme-provider';
import { useGrades } from '../../lib/graphql/hooks';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { gradeRailCenter } from '../../lib/grade-seed';
import { hapticSelection } from '../../lib/haptics';
import { spacing } from '../../theme/tokens';
import { brandColors } from '../../theme/colors';
import { iosSystemColors } from '../../theme/ios-colors';

// After a single-grade tap the sheet lingers so a second tap can extend to a
// range, then auto-dismisses (the one-tap fast path). Scrolling the rail (the
// climber is still deciding) cancels the pending dismiss, so a deliberate
// browse → tap is never cut off mid-decision.
const AUTO_DISMISS_MS = 900;
const CLEAR_DISMISS_MS = 300;

type GradePopoverProps = {
  boardName: string;
  grade: GradeBound;
  /** Recent send difficulty ids, used to center the rail on "my grade". */
  sendDifficultyIds?: number[];
  onChange: (next: GradeBound) => void;
  onDismiss: () => void;
};

function PopoverContainer({ children }: PropsWithChildren) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}
const modalContainerComponent = Platform.OS === 'ios' ? PopoverContainer : undefined;

/** Translucent tint for in-range (non-endpoint) chips from a 6-digit hex. */
function withAlpha(hexColor: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hexColor) ? `${hexColor}2E` : hexColor;
}

export function GradePopover({ boardName, grade, sendDifficultyIds = [], onChange, onDismiss }: GradePopoverProps) {
  const { t } = useTranslation('climbs');
  const { systemColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { data: gradesData } = useGrades(boardName);

  const grades = useMemo(() => [...(gradesData ?? [])].sort((a, b) => a.difficultyId - b.difficultyId), [gradesData]);
  const gradeIds = useMemo(() => grades.map((entry) => entry.difficultyId), [grades]);

  const [bound, setBound] = useState<GradeBound>(grade);
  const lastSingleAtRef = useRef<number | undefined>(isSingleGrade(grade) ? Date.now() : undefined);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapPoints = useMemo(() => ['42%'], []);

  useEffect(() => {
    sheetRef.current?.present();
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(
    (delay: number) => {
      clearDismissTimer();
      dismissTimerRef.current = setTimeout(() => {
        sheetRef.current?.dismiss();
      }, delay);
    },
    [clearDismissTimer],
  );

  // Center the rail on the current selection, else "my grade", else the band
  // center — once, after grades load and the row has measured its children.
  const chipLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const [railWidth, setRailWidth] = useState(0);
  const didCenterRef = useRef(false);
  const centerId = useMemo(
    () => gradeRailCenter(bound, grades, sendDifficultyIds),
    // Only the initial center matters; recomputing as `bound` changes would
    // fight the user's scroll. Depend on grades/sends, not bound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grades, sendDifficultyIds],
  );

  const maybeCenter = useCallback(() => {
    if (didCenterRef.current || railWidth === 0 || centerId == null) return;
    const layout = chipLayouts.current[centerId];
    if (!layout) return;
    didCenterRef.current = true;
    const target = Math.max(0, layout.x + layout.width / 2 - railWidth / 2);
    scrollRef.current?.scrollTo({ x: target, animated: false });
  }, [railWidth, centerId]);

  const apply = useCallback(
    (next: GradeBound) => {
      setBound(next);
      onChange(next);
      lastSingleAtRef.current = isSingleGrade(next) ? Date.now() : undefined;
    },
    [onChange],
  );

  const handleTapGrade = useCallback(
    (gradeId: number) => {
      hapticSelection();
      clearDismissTimer();
      const withinWindow =
        lastSingleAtRef.current !== undefined && Date.now() - lastSingleAtRef.current < RANGE_EXTEND_WINDOW_MS;
      const result = computeGradeTap(bound, gradeIds, gradeId, withinWindow);
      apply(result.next);
      // Range building keeps the sheet open (the user is mid-gesture); a single
      // grade or a clear is the terminal fast-path action, so dismiss shortly.
      if (!isRangeGrade(result.next)) {
        scheduleDismiss(AUTO_DISMISS_MS);
      }
    },
    [bound, gradeIds, apply, clearDismissTimer, scheduleDismiss],
  );

  const handleClear = useCallback(() => {
    hapticSelection();
    apply(clearGradeBound());
    scheduleDismiss(CLEAR_DISMISS_MS);
  }, [apply, scheduleDismiss]);

  const handleDone = useCallback(() => {
    clearDismissTimer();
    sheetRef.current?.dismiss();
  }, [clearDismissTimer]);

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...backdropProps} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.35} />
    ),
    [],
  );

  const anySelected = isAnyGrade(bound);
  const showDone = isRangeGrade(bound);

  const backgroundStyle: ViewStyle = {
    backgroundColor: systemColors.secondaryBackground as string,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      name="grade-popover"
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      stackBehavior="push"
      containerComponent={modalContainerComponent}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={backgroundStyle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + spacing[3] }]}>
        <View style={styles.header}>
          <Text variant="title3">{t('mobile.search.grade')}</Text>
          {showDone ? (
            <Pressable onPress={handleDone} hitSlop={8} accessibilityRole="button">
              <Text variant="subheadline" color={brandColors.primary}>
                {t('mobile.filter.done')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          onScrollBeginDrag={clearDismissTimer}
          onLayout={(event) => {
            setRailWidth(event.nativeEvent.layout.width);
            maybeCenter();
          }}
        >
          <Pressable
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityState={{ selected: anySelected }}
            accessibilityLabel={t('mobile.search.gradeClear')}
            style={[
              styles.chip,
              {
                borderColor: anySelected ? brandColors.primary : (systemColors.fill as string),
                backgroundColor: anySelected ? brandColors.primary : (systemColors.fill as string),
              },
            ]}
          >
            <Text variant="footnote" color={anySelected ? iosSystemColors.white : undefined} style={styles.chipText}>
              {t('mobile.search.gradeClear')}
            </Text>
          </Pressable>

          {grades.map((entry) => {
            const color = getGradeColor(entry.name) ?? DEFAULT_GRADE_COLOR;
            const endpoint = isGradeEndpoint(bound, entry.difficultyId);
            const inside = !endpoint && isGradeInRange(bound, entry.difficultyId);
            const label = formatGrade(entry.name) ?? entry.name;
            const backgroundColor = endpoint ? color : inside ? withAlpha(color) : (systemColors.fill as string);
            const borderColor = endpoint || inside ? color : (systemColors.fill as string);
            return (
              <Pressable
                key={entry.difficultyId}
                onPress={() => handleTapGrade(entry.difficultyId)}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  chipLayouts.current[entry.difficultyId] = { x, width };
                  maybeCenter();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: endpoint }}
                accessibilityLabel={label}
                style={[styles.chip, { backgroundColor, borderColor }]}
              >
                <Text variant="footnote" color={endpoint ? iosSystemColors.white : undefined} style={styles.chipText}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.hintRow}>
          <Icon name="search" size={13} color={iosSystemColors.systemGray} />
          <Text variant="caption1" color={systemColors.secondaryLabel} style={styles.hint}>
            {t('mobile.search.gradeHint')}
          </Text>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: iosSystemColors.separator,
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  rail: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingRight: spacing[4],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  hint: {
    flex: 1,
  },
});
