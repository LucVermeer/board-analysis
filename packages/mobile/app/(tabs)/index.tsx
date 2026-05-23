import { View, StyleSheet } from 'react-native';
import { Text, Card, ActivityIndicator } from 'react-native-paper';
import { useMyBoards } from '../../src/lib/graphql/hooks';

export default function BoardSelection() {
  const { data: boardConnection, isLoading } = useMyBoards();
  const boards = boardConnection?.boards ?? [];

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (boards.length === 0) {
    return (
      <View style={styles.centered}>
        <Text variant="titleMedium">No boards yet</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Search for a board to get started
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {boards.map((board) => (
        <Card key={board.uuid} style={styles.card} mode="outlined">
          <Card.Title title={board.name} subtitle={`${board.boardType} · ${board.sizeName ?? ''}`} />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { marginBottom: 8 },
  subtitle: { marginTop: 8, opacity: 0.6 },
});
