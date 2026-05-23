import { View, StyleSheet } from 'react-native';

type SeparatorProps = {
  inset?: number;
};

export function Separator({ inset = 0 }: SeparatorProps) {
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.29)',
  },
});
