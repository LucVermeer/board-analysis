import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { UserBoard } from '@boardsesh/shared-schema';
import { useMyBoards } from '../../../src/lib/graphql/hooks';
import { useAuth } from '../../../src/providers/auth-provider';
import { useTheme, type ResolvedSystemColors } from '../../../src/providers/theme-provider';
import { setStoredBoardConfig, getStoredBoardConfig } from '../../../src/lib/board-store';
import { hapticSelection } from '../../../src/lib/haptics';
import { Text } from '../../../src/components/Text';
import { Card } from '../../../src/components/Card';
import { Icon } from '../../../src/components/Icon';
import { Button } from '../../../src/components/Button';
import { ActivityIndicator } from '../../../src/components/ActivityIndicator';
import { brandColors } from '../../../src/theme/colors';
import { iosSystemColors } from '../../../src/theme/ios-colors';
import { spacing } from '../../../src/theme/tokens';

export default function BoardSelection() {
  const { isAuthenticated, refreshAuthState } = useAuth();
  // Don't fire myBoards while signed out — it would only 401. (Defensive: the
  // app shell normally redirects signed-out users to login before this tab.)
  const {
    data: boardConnection,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useMyBoards(undefined, {
    enabled: isAuthenticated,
  });
  const boards = boardConnection?.boards ?? [];
  const { systemColors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation('boards');

  const [activeBoardUuid, setActiveBoardUuid] = useState<string | null>(null);

  useEffect(() => {
    getStoredBoardConfig().then((config) => {
      if (config) setActiveBoardUuid(config.boardUuid);
    });
  }, []);

  // A hard 401 makes the auth interceptor clear tokens via signOut(), but that
  // doesn't flip the provider's isAuthenticated, so without this the user would
  // be stranded on the error state with a retry that keeps failing. Re-validate
  // on error: an expired session flips to signed-out (the shell then redirects
  // to login), while a transient failure keeps the retryable error state.
  useEffect(() => {
    if (isError) {
      void refreshAuthState();
    }
  }, [isError, refreshAuthState]);

  const handleBoardPress = async (board: UserBoard) => {
    hapticSelection();
    await setStoredBoardConfig({
      boardUuid: board.uuid,
      boardName: board.boardType,
      layoutId: board.layoutId,
      sizeId: board.sizeId,
      setIds: board.setIds,
      angle: board.angle,
    });
    setActiveBoardUuid(board.uuid);
    queryClient.setQueryData(['defaultBoard'], { defaultBoard: board });
    router.navigate('/(tabs)/climbs');
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Boards live on the account, so a signed-out user has none to show. Prompt a
  // sign-in instead of implying they have no boards. (Defensive: the app shell
  // normally redirects signed-out users to the login screen before this tab.)
  if (!isAuthenticated) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered}>
        <Icon name="person" size={40} color={iosSystemColors.systemGray} />
        <Text variant="headline" style={styles.stateTitle}>
          {t('mobile.signInTitle')}
        </Text>
        <Text variant="subheadline" style={styles.stateSubtitle}>
          {t('mobile.signInSubtitle')}
        </Text>
        <Button title={t('mobile.signInCta')} onPress={() => router.push('/auth/login')} style={styles.stateButton} />
      </ScrollView>
    );
  }

  // The query failed (network, or a token that no longer resolves to a user).
  // Surface it with a retry instead of the misleading "no boards" state.
  if (isError) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered}>
        <Icon name="error" size={40} color={iosSystemColors.systemRed} />
        <Text variant="headline" style={styles.stateTitle}>
          {t('mobile.errorTitle')}
        </Text>
        <Button
          title={t('mobile.errorRetry')}
          variant="outlined"
          loading={isRefetching}
          onPress={() => {
            void refetch();
          }}
          style={styles.stateButton}
        />
      </ScrollView>
    );
  }

  if (boards.length === 0) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered}>
        <Text variant="headline" style={styles.emptyTitle}>
          {t('mobile.emptyTitle')}
        </Text>
        <Text variant="subheadline" style={styles.emptySubtitle}>
          {t('mobile.emptySubtitle')}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.flex} contentContainerStyle={styles.container}>
      {boards.map((board) => {
        const isActive = board.uuid === activeBoardUuid;

        return (
          <Card key={board.uuid} onPress={() => handleBoardPress(board)} style={cardStyle(systemColors, isActive)}>
            <View style={styles.cardContent}>
              <View style={styles.cardTextContent}>
                <Text variant="headline">{board.name}</Text>
                <Text variant="subheadline" style={styles.cardSubtitle}>
                  {board.boardType} · {board.sizeName ?? ''}
                </Text>
              </View>
              {isActive && <Icon name="tick" size={22} color={brandColors.primary} />}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

function cardStyle(systemColors: ResolvedSystemColors, isActive: boolean) {
  return {
    backgroundColor: systemColors.secondaryBackground,
    borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
    borderColor: isActive ? brandColors.primary : systemColors.separator,
  } as const;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: spacing[4],
    gap: spacing[3],
  },
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    opacity: 0.6,
  },
  emptySubtitle: {
    marginTop: spacing[2],
    opacity: 0.4,
  },
  stateTitle: {
    marginTop: spacing[3],
    textAlign: 'center',
  },
  stateSubtitle: {
    marginTop: spacing[1],
    textAlign: 'center',
    opacity: 0.6,
  },
  stateButton: {
    marginTop: spacing[4],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTextContent: {
    flex: 1,
  },
  cardSubtitle: {
    marginTop: spacing[1],
    opacity: 0.6,
  },
});
