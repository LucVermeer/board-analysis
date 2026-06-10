import { useCallback } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { FAB } from 'react-native-paper';
import { Button } from '../Button';
import { PinnedActionBar } from '../PinnedActionBar';
import { iconMap, type IconName } from '../icon-map';
import { useTheme } from '../../providers/theme-provider';
import { useBottomChromeMetrics } from '../../hooks/use-bottom-chrome-metrics';
import { spacing } from '../../theme/tokens';

type SessionActionFooterProps = {
  /** Visible label — the Start/End copy (Material renders it as the extended FAB
   *  label; Liquid Glass as the pinned button title). */
  label: string;
  /** Glyph for the Material extended FAB (maps to its Android icon). */
  materialIcon: IconName;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** M3 FAB colour role for the action's prominence (primary = Start, secondary
   *  = End). Maps to Paper's `variant`. */
  emphasis: 'primary' | 'secondary';
  /** Liquid Glass button style for the same action (filled = Start, outlined =
   *  End). */
  glassButtonVariant: 'filled' | 'outlined';
  testID?: string;
  /** Fires with the measured footer height (excluding the bottom-chrome offset)
   *  so the host list reserves `measuredHeight + fixedFooterBottom`, matching the
   *  PinnedActionBar contract. */
  onHeightChange?: (height: number) => void;
};

/**
 * The session Start/End footer action, routed by UI variant. Liquid Glass keeps
 * the exact pinned glass toolbar + Button it always had; Material draws an M3
 * extended FAB (Paper supplies its disabled / loading states) anchored bottom-end
 * over the same bottom-chrome offset. Both branches measure their own height and
 * report it through `onHeightChange`, so the host list reserves the right bottom
 * inset either way (the existing `measuredHeight + fixedFooterBottom` contract).
 */
export function SessionActionFooter({
  label,
  materialIcon,
  onPress,
  disabled,
  loading,
  emphasis,
  glassButtonVariant,
  testID,
  onHeightChange,
}: SessionActionFooterProps) {
  const { variant } = useTheme();

  if (variant === 'material') {
    return (
      <SessionActionFooterMaterial
        label={label}
        materialIcon={materialIcon}
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        emphasis={emphasis}
        testID={testID}
        onHeightChange={onHeightChange}
      />
    );
  }

  return (
    <PinnedActionBar testID={testID} onHeightChange={onHeightChange}>
      <Button
        title={label}
        onPress={onPress}
        variant={glassButtonVariant}
        size="large"
        disabled={disabled}
        loading={loading}
      />
    </PinnedActionBar>
  );
}

function SessionActionFooterMaterial({
  label,
  materialIcon,
  onPress,
  disabled,
  loading,
  emphasis,
  testID,
  onHeightChange,
}: Omit<SessionActionFooterProps, 'glassButtonVariant'>) {
  const bottomChrome = useBottomChromeMetrics();

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange?.(event.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  // The FAB floats bottom-end over the same fixed-footer offset the glass bar
  // used; the container is box-none so the list scrolls under it everywhere
  // except the FAB itself. Measuring the container (not the FAB) keeps the host's
  // reserved bottom inset honest.
  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      onLayout={onHeightChange ? handleLayout : undefined}
      style={[styles.materialContainer, { bottom: bottomChrome.fixedFooterBottom }]}
    >
      <FAB
        icon={iconMap[materialIcon].android}
        label={label}
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        variant={emphasis}
        mode="elevated"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  materialContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
});
