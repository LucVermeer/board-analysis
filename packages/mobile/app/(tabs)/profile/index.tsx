import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import PagerView, { type PagerViewOnPageScrollEvent, type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { router, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useProfile, useYouProfileData } from '../../../src/lib/graphql/hooks';
import { useTheme } from '../../../src/providers/theme-provider';
import { YouTabBar, type YouTab } from '../../../src/components/you/YouTabBar';
import { YouFilterSheet } from '../../../src/components/you/YouFilterSheet';
import { ProgressTab } from '../../../src/components/you/ProgressTab';
import { SessionsTab } from '../../../src/components/you/SessionsTab';
import { LogbookTab } from '../../../src/components/you/LogbookTab';
import { Icon } from '../../../src/components/Icon';
import { brandColors } from '../../../src/theme/colors';
import { iosSystemColors } from '../../../src/theme/ios-colors';

type TabKey = 'progress' | 'sessions' | 'logbook';

export default function YouScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation('you');
  const { systemColors } = useTheme();

  const { data: profile } = useProfile();
  const userId = profile?.id;
  const youData = useYouProfileData(userId);

  const pagerRef = useRef<PagerView>(null);
  const filterSheetRef = useRef<BottomSheet | null>(null);
  const scrollPosition = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const tabs = useMemo<YouTab<TabKey>[]>(
    () => [
      { key: 'progress', label: t('tabs.progress') },
      { key: 'sessions', label: t('tabs.sessions') },
      { key: 'logbook', label: t('tabs.logbook') },
    ],
    [t],
  );

  const handleTabPress = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
  }, []);

  const handlePageScroll = useCallback(
    (event: PagerViewOnPageScrollEvent) => {
      scrollPosition.value = event.nativeEvent.position + event.nativeEvent.offset;
    },
    [scrollPosition],
  );

  const handlePageSelected = useCallback((event: PagerViewOnPageSelectedEvent) => {
    setActiveIndex(event.nativeEvent.position);
  }, []);

  const openFilters = useCallback(() => {
    filterSheetRef.current?.snapToIndex(0);
  }, []);

  // Opaque header (overrides the stack's transparent/blur default for this
  // screen) so the fixed profile header + tab bar sit cleanly below it. A
  // settings gear (left) reaches More; the filter button (right) shows only on
  // the Progress tab.
  useEffect(() => {
    navigation.setOptions({
      title: t('metadata.dashboard.title'),
      headerTransparent: false,
      headerLeft: () => (
        <Pressable
          onPress={() => router.push('/(tabs)/profile/more')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.settings')}
        >
          <Icon name="settings" size={22} color={iosSystemColors.systemGray} />
        </Pressable>
      ),
      headerRight:
        activeIndex === 0
          ? () => (
              <Pressable
                onPress={openFilters}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.filter.title')}
              >
                <Icon
                  name="filter"
                  size={22}
                  color={youData.hasActiveFilters ? brandColors.primary : iosSystemColors.systemGray}
                />
              </Pressable>
            )
          : undefined,
    });
  }, [navigation, t, activeIndex, openFilters, youData.hasActiveFilters]);

  return (
    <View style={[styles.container, { backgroundColor: systemColors.background }]}>
      <YouTabBar tabs={tabs} activeIndex={activeIndex} scrollPosition={scrollPosition} onTabPress={handleTabPress} />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        offscreenPageLimit={1}
        onPageScroll={handlePageScroll}
        onPageSelected={handlePageSelected}
      >
        <View key="progress" style={styles.page}>
          <ProgressTab data={youData} />
        </View>
        <View key="sessions" style={styles.page}>
          <SessionsTab userId={userId} />
        </View>
        <View key="logbook" style={styles.page}>
          <LogbookTab userId={userId} />
        </View>
      </PagerView>

      <YouFilterSheet
        sheetRef={filterSheetRef}
        selectedBoard={youData.selectedBoard}
        onSelectBoard={youData.setSelectedBoard}
        timeframe={youData.timeframe}
        onSelectTimeframe={youData.setTimeframe}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
});
