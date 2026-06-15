// The Home feed's scope control: the large title IS the active scope ("My crew"
// / a gym name / "Everyone"), and tapping it opens a native iOS menu (UIMenu via
// react-native-context-menu-view's dropdown mode) to switch scope / pick a gym.
// Replaces the old segmented control + scope pill — one HIG-native line instead
// of a persistent toggle eating vertical space.

import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from 'react-native-context-menu-view';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { spacing } from '../../theme/tokens';
import { useTheme } from '../../providers/theme-provider';

type FeedScopeTitleProps = {
  /** The active scope, shown as the large title. */
  title: string;
  /** Menu items, in render order; `onSelectIndex` is called with the tapped index. */
  actions: ContextMenuAction[];
  onSelectIndex: (index: number) => void;
};

export function FeedScopeTitle({ title, actions, onSelectIndex }: FeedScopeTitleProps) {
  const { systemColors } = useTheme();
  return (
    <ContextMenu
      dropdownMenuMode
      actions={actions}
      onPress={(event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => onSelectIndex(event.nativeEvent.index)}
      style={styles.menu}
    >
      <View style={styles.row} accessibilityRole="button" accessibilityLabel={title}>
        <Text variant="largeTitle" color={systemColors.label} style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Icon name="chevron.down" size={22} color={systemColors.secondaryLabel} />
      </View>
    </ContextMenu>
  );
}

const styles = StyleSheet.create({
  // Anchor only as wide as its content so the tap target is the title, not the row.
  menu: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  title: { fontWeight: '700' },
});
