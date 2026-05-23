import { View, Text, StyleSheet } from 'react-native';

export default function Queue() {
  return (
    <View style={styles.container}>
      <Text>Queue</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
