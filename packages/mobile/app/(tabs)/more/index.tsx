import { Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../../src/providers/theme-provider';

export default function MoreScreen() {
  const { systemColors } = useTheme();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.text, { color: systemColors.secondaryLabel }]}>More</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 17,
  },
});
