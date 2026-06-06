// The bottom toolbar's search affordance (Climbs tab only): a collapsed glass FAB
// pinned bottom-LEFT — into the gutter the global capsule + tick reserve — that
// speed-dials open to its RIGHT into a single row: [🔍/✕] [search field] [grade]
// [filter]. The FAB morphs 🔍→✕ and stays put; the row rides above the keyboard
// (useAnimatedKeyboard on iOS) so the field stays usable. While expanded it
// signals `setSearchExpanded`, so the global capsule + tick fade out and the
// field has the full width. Tapping the scrim or ✕ collapses; while typing the
// grade/filter swap for a "done" ✓. Collapsed, the FAB carries a filter-count
// badge. Controls are individual glass elements over the list (no glass-on-glass).

import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import type { Grade } from '@boardsesh/shared-schema';
import { isAnyGrade, type GradeBound } from '@boardsesh/climb-filters';
import { getGradeColor } from '@boardsesh/board-constants/grade-colors';
import { useTheme } from '../../providers/theme-provider';
import { spacing } from '../../theme/tokens';
import { TOOLBAR_FAB_SIZE, TOOLBAR_SIDE_MARGIN } from '../../theme/layout';
import { hapticLight, hapticSelection } from '../../lib/haptics';
import { useReduceMotion } from '../../hooks/use-reduce-motion';
import { useGradeFormat } from '../../hooks/use-grade-format';
import { setSearchExpanded } from '../../lib/search-expanded-state';
import { withAlpha } from '../../theme/colors';
import { SearchHeader, type SearchHeaderHandle } from '../SearchHeader';
import { GlassIconButton } from '../GlassIconButton';
import { GlassCluster } from '../GlassCluster';
import { GradePill } from './GradePill';
import { FilterButton } from './FilterButton';
import { GradeRangeRail } from '../grade';
import { formatGradePillLabel } from './grade-pill-label';

type SearchFabProps = {
  searchFieldRef: RefObject<SearchHeaderHandle | null>;
  searchInitialValue: string;
  searchPlaceholder: string;
  onSearchChange: (text: string) => void;
  /** Commit the current text immediately (flush the debounce) — fired by "done". */
  onSearchSubmit: (text: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  bound: GradeBound;
  grades: readonly Grade[];
  activeFilterCount: number;
  gradeRailVisible: boolean;
  onOpenGrade: () => void;
  onCloseGrade: () => void;
  onGradeChange: (grade: GradeBound) => void;
  onOpenFilters: () => void;
  /** Resting bottom for the cluster (clears the tab bar + floating toolbar). */
  toolbarBottom: number;
};

export function SearchFab({
  searchFieldRef,
  searchInitialValue,
  searchPlaceholder,
  onSearchChange,
  onSearchSubmit,
  onSearchFocus,
  onSearchBlur,
  bound,
  grades,
  activeFilterCount,
  gradeRailVisible,
  onOpenGrade,
  onCloseGrade,
  onGradeChange,
  onOpenFilters,
  toolbarBottom,
}: SearchFabProps) {
  const { t } = useTranslation('climbs');
  const { systemColors, brandColors } = useTheme();
  const { formatGrade } = useGradeFormat();
  const reduceMotion = useReduceMotion();
  const keyboard = useAnimatedKeyboard();
  const [expanded, setExpanded] = useState(false);
  // While the field is focused (actively typing) we swap grade/filter for a
  // "done typing" tick that dismisses the keyboard and commits the live search.
  const [focused, setFocused] = useState(false);

  // The cluster's bottom slides with the toolbar (toolbarBottom) and rises above
  // the keyboard when the field focuses. `useAnimatedKeyboard` reports the IME
  // height on BOTH platforms (0 when closed), which matters on Android: this app
  // runs edge-to-edge, so the window doesn't resize and a bottom-anchored cluster
  // wouldn't otherwise clear the keyboard. The fab sits at the cluster's bottom-left.
  const restingBottom = useSharedValue(toolbarBottom);
  useEffect(() => {
    restingBottom.value = reduceMotion ? toolbarBottom : withTiming(toolbarBottom, { duration: 200 });
  }, [toolbarBottom, reduceMotion, restingBottom]);

  const clusterStyle = useAnimatedStyle(() => {
    return { bottom: Math.max(restingBottom.value, keyboard.height.value + spacing[2]) };
  });

  const handleCollapse = useCallback(() => {
    searchFieldRef.current?.blur();
    Keyboard.dismiss();
    onCloseGrade();
    setExpanded(false);
    setSearchExpanded(false);
  }, [searchFieldRef, onCloseGrade]);

  // The tabs stay mounted across switches, so an unmount cleanup never fires on a
  // tab change. Collapse on blur instead — fully resetting local + global state —
  // so leaving the Climbs tab mid-search makes the global capsule + tick reappear
  // on the other tabs, and returning never lands on a half-open search. This also
  // covers unmount-while-focused (e.g. switching search layouts).
  useFocusEffect(useCallback(() => () => handleCollapse(), [handleCollapse]));

  const handleFabPress = useCallback(() => {
    hapticLight();
    if (expanded) {
      handleCollapse();
    } else {
      setExpanded(true);
      setSearchExpanded(true);
    }
  }, [expanded, handleCollapse]);

  const handleFocus = useCallback(() => {
    onCloseGrade();
    setFocused(true);
    onSearchFocus();
  }, [onCloseGrade, onSearchFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onSearchBlur();
  }, [onSearchBlur]);

  // "Finished typing": commit the current text immediately (flush the debounce),
  // drop the keyboard, and shrink the field back to its small state with
  // grade/filter beside it. We flip `focused` here directly rather than waiting
  // on the blur→onBlur round-trip, so the row reflows immediately on tap.
  const handleDone = useCallback(() => {
    setFocused(false);
    hapticSelection();
    onSearchSubmit(searchFieldRef.current?.getText() ?? '');
    searchFieldRef.current?.blur();
    Keyboard.dismiss();
  }, [searchFieldRef, onSearchSubmit]);

  const handleOpenGrade = useCallback(() => {
    hapticLight();
    searchFieldRef.current?.blur();
    Keyboard.dismiss();
    setFocused(false);
    if (gradeRailVisible) {
      onCloseGrade();
    } else {
      onOpenGrade();
    }
  }, [gradeRailVisible, onCloseGrade, onOpenGrade, searchFieldRef]);

  const gradeActive = !isAnyGrade(bound);
  const gradeLabel = useMemo(
    () => formatGradePillLabel(bound, grades, formatGrade, t),
    [bound, grades, formatGrade, t],
  );
  const gradeAccent = useMemo(() => {
    const selectedDifficultyId = bound.minGradeId ?? bound.maxGradeId;
    if (selectedDifficultyId == null) return brandColors.primary;
    const selectedGrade = grades.find((grade) => grade.difficultyId === selectedDifficultyId);
    return selectedGrade ? (getGradeColor(selectedGrade.name) ?? brandColors.primary) : brandColors.primary;
  }, [bound.maxGradeId, bound.minGradeId, brandColors.primary, grades]);

  const enter = reduceMotion ? undefined : FadeIn.duration(200);
  const exit = reduceMotion ? undefined : FadeOut.duration(150);
  const searchFabLabel =
    expanded || !gradeActive ? t('mobile.search.fab.open') : `${t('mobile.search.fab.open')}, ${gradeLabel}`;

  return (
    <>
      {expanded ? (
        <Pressable
          style={styles.scrim}
          onPress={gradeRailVisible ? undefined : handleCollapse}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      <Animated.View pointerEvents="box-none" style={[styles.cluster, clusterStyle]}>
        {expanded && gradeRailVisible ? (
          <Animated.View entering={enter} exiting={exit} style={styles.gradeRailSlot}>
            <GradeRangeRail grades={grades} bound={bound} onChange={onGradeChange} onRequestClose={onCloseGrade} />
          </Animated.View>
        ) : null}
        <GlassCluster pointerEvents="box-none" style={styles.fabRow} spacing={spacing[2]}>
          {/* The FAB is pinned LEFT and morphs 🔍→✕; everything speed-dials to its
              right. Collapsed, it carries the active-filter count as a badge. */}
          <GlassIconButton
            iconName="search"
            secondaryIconName="close"
            active={expanded}
            iconColor={systemColors.label as string}
            tintColor={!expanded && gradeActive ? withAlpha(gradeAccent, 0.2) : undefined}
            fallbackColor={!expanded && gradeActive ? withAlpha(gradeAccent, 0.16) : systemColors.fill}
            onPress={handleFabPress}
            accessibilityLabel={expanded ? t('mobile.search.fab.close') : searchFabLabel}
            accessibilityHint={expanded ? undefined : t('mobile.search.fab.hint')}
            badgeCount={expanded ? undefined : activeFilterCount}
            size={TOOLBAR_FAB_SIZE}
          />
          {expanded ? (
            <Animated.View entering={enter} exiting={exit} style={styles.searchSlot}>
              <SearchHeader
                ref={searchFieldRef}
                initialValue={searchInitialValue}
                placeholder={searchPlaceholder}
                onChangeText={onSearchChange}
                onSubmit={onSearchSubmit}
                onFocus={handleFocus}
                onBlur={handleBlur}
                height={TOOLBAR_FAB_SIZE}
              />
            </Animated.View>
          ) : null}
          {expanded && !focused ? (
            <Animated.View entering={enter} exiting={exit}>
              <GradePill
                bound={bound}
                grades={grades}
                onPress={handleOpenGrade}
                expanded={gradeRailVisible}
                maxWidth={140}
              />
            </Animated.View>
          ) : null}
          {expanded && !focused ? (
            <Animated.View entering={enter} exiting={exit}>
              <FilterButton activeFilterCount={activeFilterCount} onPress={onOpenFilters} />
            </Animated.View>
          ) : null}
          {expanded && focused ? (
            <Animated.View entering={enter} exiting={exit}>
              <GlassIconButton
                iconName="tick"
                iconColor={systemColors.label as string}
                fallbackColor={systemColors.fill}
                onPress={handleDone}
                accessibilityLabel={t('mobile.search.fab.done')}
                size={TOOLBAR_FAB_SIZE}
              />
            </Animated.View>
          ) : null}
        </GlassCluster>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 18,
  },
  cluster: {
    position: 'absolute',
    left: TOOLBAR_SIDE_MARGIN,
    right: TOOLBAR_SIDE_MARGIN,
    zIndex: 19,
  },
  searchSlot: {
    flex: 1,
    flexDirection: 'row',
  },
  fabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing[2],
  },
  gradeRailSlot: {
    marginBottom: spacing[2],
  },
});
