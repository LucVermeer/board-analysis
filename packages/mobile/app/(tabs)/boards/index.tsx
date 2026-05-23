import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMyBoards } from '../../../src/lib/graphql/hooks';
import { useTheme } from '../../../src/providers/theme-provider';

export default function BoardSelection() {
  const { data: boardConnection, isLoading } = useMyBoards();
  const boards = boardConnection?.boards ?? [];
  const { systemColors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('boards');

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (boards.length === 0) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered}>
        <Text style={[styles.emptyTitle, { color: systemColors.label }]}>{t('mobile.emptyTitle')}</Text>
        <Text style={[styles.emptySubtitle, { color: systemColors.secondaryLabel }]}>{t('mobile.emptySubtitle')}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.flex} contentContainerStyle={styles.container}>
      {boards.map((board) => (
        <Pressable
          key={board.uuid}
          onPress={() => router.navigate('/(tabs)/climbs')}
          style={[
            styles.card,
            {
              backgroundColor: systemColors.secondaryBackground,
              borderColor: systemColors.separator,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: systemColors.label }]}>{board.name}</Text>
          <Text style={[styles.cardSubtitle, { color: systemColors.secondaryLabel }]}>
            {board.boardType} · {board.sizeName ?? ''}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 16,
    gap: 12,
  },
  centered: {
    flexGrow: 1,
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
