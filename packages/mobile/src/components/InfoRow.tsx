import { View, Platform, StyleSheet } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../providers/theme-provider';

type InfoRowProps = {
  label: string;
  value: string;
  showSeparator?: boolean;
};

export function InfoRow({ label, value, showSeparator = true }: InfoRowProps) {
  const { systemColors } = useTheme();

  return (
    <View>
      <View style={styles.row}>
        <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.label}>
          {label}
        </Text>
        <Text variant="footnote" color={systemColors.label} style={styles.value} selectable>
          {value}
        </Text>
      </View>
      {showSeparator && <View style={[styles.separator, { backgroundColor: systemColors.separator }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  label: {
    flexShrink: 0,
  },
  value: {
    flex: 1,
    textAlign: 'right',
    ...Platform.select({
      ios: { fontFamily: 'Menlo' },
      android: { fontFamily: 'monospace' },
    }),
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
});
