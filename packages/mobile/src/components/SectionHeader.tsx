import { View, Platform, StyleSheet } from 'react-native';
import { Text } from './Text';

type SectionHeaderProps = {
  title: string;
};

export function SectionHeader({ title }: SectionHeaderProps) {
  const displayTitle = Platform.OS === 'ios' ? title.toUpperCase() : title;

  return (
    <View style={styles.container}>
      <Text variant="footnote" style={styles.text}>
        {displayTitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  text: {
    opacity: 0.6,
    letterSpacing: 0.5,
  },
});
