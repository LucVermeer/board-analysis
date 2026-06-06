import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useQueue } from '../../providers/queue-provider';
import { glassSize } from '../../theme/layout';
import { ClimbCapsule } from './ClimbCapsule';
import { LogAscentToolbarButton } from './LogAscentToolbarButton';

const ACCESSORY_MAX_WIDTH = 344;
const ACCESSORY_SCREEN_GUTTER = 32;

/**
 * iOS 26 tab-bar bottom accessory content. UIKit supplies the outer Liquid Glass
 * platter and swaps this subtree between regular and inline placements as the
 * tab bar minimizes, so the content stays bare: current climb plus tick only.
 */
export function QueueBottomAccessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const { width: screenWidth } = useWindowDimensions();
  const { state } = useQueue();
  const currentClimb = state.currentClimbQueueItem?.climb;

  const accessoryWidth = useMemo(() => {
    return Math.max(glassSize.standard * 2, Math.min(ACCESSORY_MAX_WIDTH, screenWidth - ACCESSORY_SCREEN_GUTTER));
  }, [screenWidth]);

  if (!currentClimb) return null;

  const actionSize = glassSize.inline;
  const capsuleHeight = placement === 'inline' ? glassSize.inline : glassSize.capsule;

  return (
    <View
      style={[styles.row, placement === 'inline' ? styles.inlineRow : styles.regularRow, { width: accessoryWidth }]}
    >
      <ClimbCapsule
        bare
        fillWidth
        height={capsuleHeight}
        endAction={<LogAscentToolbarButton climb={currentClimb} size={actionSize} />}
        endActionSize={actionSize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  regularRow: {
    height: glassSize.standard,
  },
  inlineRow: {
    height: glassSize.inline,
  },
});
