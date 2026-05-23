import { View, Text, Pressable, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { useMyBoards } from '../../../src/lib/graphql/hooks';

export default function BoardSelection() {
  const { data: boardConnection, isLoading } = useMyBoards();
  const boards = boardConnection?.boards ?? [];
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#FFFFFF' : '#000000';
  const subtitleColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  const cardBackground = isDark ? '#1C1C1E' : '#FFFFFF';
  const cardBorder = isDark ? '#38383A' : '#E5E5EA';

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
        <Text style={[styles.emptyTitle, { color: textColor }]}>No boards yet</Text>
        <Text style={[styles.emptySubtitle, { color: subtitleColor }]}>
          Search for a board to get started
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {boards.map((board) => (
        <Pressable
          key={board.uuid}
          style={[styles.card, { backgroundColor: cardBackground, borderColor: cardBorder }]}
        >
          <Text style={[styles.cardTitle, { color: textColor }]}>{board.name}</Text>
          <Text style={[styles.cardSubtitle, { color: subtitleColor }]}>
            {board.boardType} · {board.sizeName ?? ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  emptySubtitle: {
    fontSize: 15,
    marginTop: 8,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 15,
    marginTop: 4,
  },
});
