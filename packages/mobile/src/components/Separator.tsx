import { View, StyleSheet } from 'react-native';
import { iosSystemColors } from '../theme/ios-colors';

type SeparatorProps = {
  inset?: number;
};

export function Separator({ inset = 0 }: SeparatorProps) {
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: iosSystemColors.separator,
  },
});
