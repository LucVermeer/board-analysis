import { View, Text, StyleSheet } from 'react-native';

export default function MoreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>More</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 17,
    color: '#8E8E93',
  },
});
