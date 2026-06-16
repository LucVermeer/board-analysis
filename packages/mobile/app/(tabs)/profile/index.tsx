import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useProfile, useYouProfileData } from '../../../src/lib/graphql/hooks';
import { useTheme } from '../../../src/providers/theme-provider';
import { ProfileTopChrome, type ProfileTabKey } from '../../../src/components/you/ProfileTopChrome';
import { YouFilterSheet } from '../../../src/components/you/YouFilterSheet';
import { ProgressTab } from '../../../src/components/you/ProgressTab';
import { SessionsTab } from '../../../src/components/you/SessionsTab';
import { LogbookTab } from '../../../src/components/you/LogbookTab';
import { SocialTab } from '../../../src/components/you/SocialTab';

export default function YouScreen() {
  const { systemColors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: profile } = useProfile();
  const userId = profile?.id;
  const youData = useYouProfileData(userId);

  const filterSheetRef = useRef<BottomSheet | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('progress');

  // The measured chrome height insets each sub-tab's scroll content; seed it to
  // the safe-area top plus the islands row + segmented control so the first paint
  // already clears the chrome before onLayout reports the real height.
  const [chromeHeight, setChromeHeight] = useState(() => insets.top + 96);

  const handleSelectTab = useCallback((key: ProfileTabKey) => {
    setActiveTab(key);
  }, []);

  const openFilters = useCallback(() => {
    filterSheetRef.current?.snapToIndex(0);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: systemColors.background }]}>
      <View style={styles.page}>
        {activeTab === 'progress' ? <ProgressTab data={youData} topInset={chromeHeight} /> : null}
        {activeTab === 'sessions' ? <SessionsTab userId={userId} topInset={chromeHeight} /> : null}
        {activeTab === 'logbook' ? <LogbookTab userId={userId} topInset={chromeHeight} /> : null}
        {activeTab === 'social' ? <SocialTab userId={userId} topInset={chromeHeight} /> : null}
      </View>

      <ProfileTopChrome
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        hasActiveFilters={youData.hasActiveFilters}
        onOpenFilters={openFilters}
        onHeightChange={setChromeHeight}
      />

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
  page: { flex: 1 },
});
