// Top chrome for the Profile ("You") tab. Composes the board-agnostic
// CollapsingLargeTitleHeader (no board pill — unlike Climbs/Discover) with a
// settings-gear island on the left, an optional filter island on the right (the
// Progress sub-tab only), and the Progress/Sessions/Logbook segmented control as
// its below-row content. The collapsing large title + glass islands degrade for
// free on the Material variant via GlassSurface / SegmentedControl.

import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../providers/theme-provider';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { spacing, shadows } from '../../theme/tokens';
import { Icon } from '../Icon';
import { GlassSurface } from '../GlassSurface';
import { SegmentedControl } from '../SegmentedControl';
import { CollapsingLargeTitleHeader, GlassActionToolbar, GlassToolbarAction } from '../chrome';

// The segmented control floats over the chrome's faded scrim with scrolling
// content behind it, so it needs its own glass track to stay legible and to give
// the opaque selected thumb something to pop against (matching the Climbs search
// capsule's treatment). 10 leaves a hair of glass around the thumb's radius-7 tile.
const SEGMENT_TRACK_RADIUS = 10;

export type ProfileTabKey = 'progress' | 'sessions' | 'logbook';

type ProfileTopChromeProps = {
  /** Selected sub-tab; drives the segmented control's pill. */
  activeTab: ProfileTabKey;
  onSelectTab: (key: ProfileTabKey) => void;
  /** Tints the filter island accent when the Progress filters are narrowed. */
  hasActiveFilters: boolean;
  /** Open the Progress filter sheet (only reachable from the Progress sub-tab). */
  onOpenFilters: () => void;
  /** Active sub-tab's scroll offset, driving the large title collapse. */
  scrollY: SharedValue<number>;
  /** Tapping the collapsed title capsule scrolls the active sub-tab to the top. */
  onPressTitle: () => void;
  /** Report the measured chrome height so each sub-tab can inset its top padding. */
  onHeightChange: (height: number) => void;
};

export function ProfileTopChrome({
  activeTab,
  onSelectTab,
  hasActiveFilters,
  onOpenFilters,
  scrollY,
  onPressTitle,
  onHeightChange,
}: ProfileTopChromeProps) {
  const { t } = useTranslation('you');
  const { systemColors, brandColors } = useTheme();
  const nativeGlass = useNativeGlass();

  const dashboardTitle = t('metadata.dashboard.title');

  const handleOpenSettings = useCallback(() => {
    router.push('/(tabs)/profile/more');
  }, []);

  const segmentOptions = useMemo(
    () => [
      { key: 'progress' as const, label: t('tabs.progress') },
      { key: 'sessions' as const, label: t('tabs.sessions') },
      { key: 'logbook' as const, label: t('tabs.logbook') },
    ],
    [t],
  );

  const leftActions = (
    <GlassActionToolbar actionCount={1}>
      <GlassToolbarAction onPress={handleOpenSettings} accessibilityLabel={t('mobile.settings')}>
        <Icon name="settings" size={22} color={systemColors.label} />
      </GlassToolbarAction>
    </GlassActionToolbar>
  );

  // The filter island only makes sense on Progress (the only sub-tab the filter
  // sheet narrows); Sessions/Logbook show no right island.
  const rightActions =
    activeTab === 'progress' ? (
      <GlassActionToolbar actionCount={1}>
        <GlassToolbarAction onPress={onOpenFilters} accessibilityLabel={t('mobile.filter.title')}>
          <Icon name="filter" size={22} color={hasActiveFilters ? brandColors.primary : systemColors.label} />
        </GlassToolbarAction>
      </GlassActionToolbar>
    ) : undefined;

  return (
    <CollapsingLargeTitleHeader
      title={dashboardTitle}
      scrollY={scrollY}
      onPressTitle={onPressTitle}
      onHeightChange={onHeightChange}
      leftActions={leftActions}
      rightActions={rightActions}
    >
      <View pointerEvents="box-none" style={styles.segmentStack}>
        <View
          style={[
            styles.segmentTrack,
            !nativeGlass && shadows.sm,
            !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
          ]}
        >
          <GlassSurface
            glassEffectStyle="regular"
            fallbackColor={systemColors.fill}
            borderRadius={SEGMENT_TRACK_RADIUS}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <SegmentedControl
            options={segmentOptions}
            selectedKey={activeTab}
            onSelect={onSelectTab}
            trackColor="transparent"
            textVariant="subheadline"
            accessibilityLabel={dashboardTitle}
          />
        </View>
      </View>
    </CollapsingLargeTitleHeader>
  );
}

const styles = StyleSheet.create({
  segmentStack: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  segmentTrack: {
    borderRadius: SEGMENT_TRACK_RADIUS,
    // Clip the absolutely-filled GlassSurface to the rounded corners on Android.
    overflow: 'hidden',
  },
});
