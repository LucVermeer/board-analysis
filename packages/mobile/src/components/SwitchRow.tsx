import { Pressable, Switch as RNSwitch, View, StyleSheet } from 'react-native';
import { Switch as PaperSwitch } from 'react-native-paper';
import { Text } from './Text';
import { hapticSelection } from '../lib/haptics';
import { brandColors } from '../theme/colors';
import { iosSystemColors } from '../theme/ios-colors';
import { spacing } from '../theme/tokens';
import { useTheme } from '../providers/theme-provider';

type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

export function SwitchRow({ label, description, value, onValueChange, disabled = false }: SwitchRowProps) {
  const { variant: uiVariant } = useTheme();

  const handleToggle = (next: boolean) => {
    if (disabled) return;
    hapticSelection();
    onValueChange(next);
  };

  return (
    <Pressable
      onPress={() => handleToggle(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.rowPressed]}
    >
      <View style={styles.textColumn}>
        <Text variant="body" style={disabled ? styles.textDisabled : undefined}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" style={[styles.description, disabled && styles.textDisabled]}>
            {description}
          </Text>
        ) : null}
      </View>
      {uiVariant === 'material' ? (
        // Paper's Switch picks up the M3 colours from the global PaperProvider theme.
        <PaperSwitch value={value} onValueChange={handleToggle} disabled={disabled} />
      ) : (
        <RNSwitch
          value={value}
          onValueChange={handleToggle}
          disabled={disabled}
          trackColor={{ false: undefined, true: brandColors.primary }}
          ios_backgroundColor={iosSystemColors.systemGray4 as string}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minHeight: 44,
    gap: spacing[3],
  },
  rowPressed: {
    opacity: 0.6,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  description: {
    opacity: 0.55,
  },
  textDisabled: {
    opacity: 0.4,
  },
});
