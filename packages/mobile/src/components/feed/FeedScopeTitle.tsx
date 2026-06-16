// The Home feed's scope control: a glass header pill showing the active scope
// ("My crew" / a gym name / "Everyone") with a down-caret. Tapping it opens a
// dropdown menu (a Material 3 Paper menu on Material, the native iOS UIMenu on
// Liquid Glass) to switch scope / pick a gym — a title-menu button in the floating
// chrome rather than a large in-body title.

import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { GlassSurface } from '../GlassSurface';
import { AppMenu, type AppMenuAction } from '../AppMenu';
import { useNativeGlass } from '../../hooks/use-native-glass';
import { spacing, shadows } from '../../theme/tokens';
import { glassSize } from '../../theme/layout';
import { useTheme } from '../../providers/theme-provider';

const PILL_HEIGHT = glassSize.capsule;
const PILL_RADIUS = PILL_HEIGHT / 2;

type FeedScopeTitleProps = {
  /** The active scope, shown in the pill. */
  title: string;
  /** Menu items, in render order; `onSelectIndex` is called with the tapped index. */
  actions: AppMenuAction[];
  onSelectIndex: (index: number) => void;
  /** VoiceOver hint — the pill is a menu, so cue what activating it does. */
  accessibilityHint?: string;
};

export function FeedScopeTitle({ title, actions, onSelectIndex, accessibilityHint }: FeedScopeTitleProps) {
  const { systemColors } = useTheme();
  const nativeGlass = useNativeGlass();
  // `AppMenu` owns the per-variant menu (Paper menu vs native dropdown) and the
  // selected-row marker; the actions are already in its neutral shape.
  return (
    <AppMenu
      actions={actions}
      onSelectIndex={onSelectIndex}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      style={styles.menu}
    >
      <View
        style={[
          styles.pill,
          !nativeGlass && shadows.sm,
          !nativeGlass && { borderWidth: StyleSheet.hairlineWidth, borderColor: systemColors.separator },
        ]}
      >
        {/* `clear` (lighter, content-forward) so the floating pill reads as a
            translucent control rather than frosted chrome. */}
        <GlassSurface
          glassEffectStyle="clear"
          // Floating scope pill = M3 surfaceContainer tone on Material.
          role="base"
          fallbackColor={systemColors.elevatedSurface}
          borderRadius={PILL_RADIUS}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text variant="headline" color={systemColors.label} numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Icon name="chevron.down" size={18} color={systemColors.secondaryLabel} />
      </View>
    </AppMenu>
  );
}

const styles = StyleSheet.create({
  // Size the anchor to its content so the tap target is the pill.
  menu: { alignSelf: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
    paddingHorizontal: spacing[4],
    overflow: 'hidden',
    maxWidth: 240,
  },
  title: { fontWeight: '700', flexShrink: 1 },
});
