import { View, Text, StyleSheet } from 'react-native';

export default function Climbs() {
  return (
    <View style={styles.container}>
      <Text>Climbs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
