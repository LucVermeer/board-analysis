import { useMemo } from 'react';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueue } from '../providers/queue-provider';
import { TAB_BAR_HEIGHT, TOOLBAR_GAP_ABOVE_TABBAR, TOOLBAR_RESERVE, glassSize } from '../theme/layout';
import { isTabsRoute } from '../lib/route-segments';
import { isBottomAccessoryAvailable } from './use-bottom-accessory';

export function useBottomChromeMetrics() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { state } = useQueue();

  const hasCurrentClimb = state.currentClimbQueueItem?.climb != null;
  const insideTabs = isTabsRoute(segments);
  const nativeAccessoryMounted = insideTabs && isBottomAccessoryAvailable();
  const nativeAccessoryVisible = nativeAccessoryMounted && hasCurrentClimb;
  const jsQueueToolbarVisible = hasCurrentClimb && !nativeAccessoryMounted;
  const tabBarHeight = insideTabs ? TAB_BAR_HEIGHT : 0;
  const jsQueueReserve = jsQueueToolbarVisible ? TOOLBAR_RESERVE : 0;
  const nativeAccessoryReserve = nativeAccessoryVisible ? glassSize.standard + TOOLBAR_GAP_ABOVE_TABBAR : 0;

  return useMemo(
    () => ({
      hasCurrentClimb,
      insideTabs,
      nativeAccessoryMounted,
      nativeAccessoryVisible,
      jsQueueToolbarVisible,
      tabBarHeight,
      tabBarBottom: insets.bottom + tabBarHeight,
      jsQueueReserve,
      nativeAccessoryReserve,
      scrollBottomPadding: insets.bottom + tabBarHeight + jsQueueReserve,
      floatingControlBottom: insets.bottom + tabBarHeight + Math.max(jsQueueReserve, nativeAccessoryReserve),
    }),
    [
      hasCurrentClimb,
      insets.bottom,
      insideTabs,
      jsQueueReserve,
      jsQueueToolbarVisible,
      nativeAccessoryMounted,
      nativeAccessoryReserve,
      nativeAccessoryVisible,
      tabBarHeight,
    ],
  );
}
