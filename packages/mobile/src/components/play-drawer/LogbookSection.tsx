import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { iosSystemColors } from '../../theme/ios-colors';
import { spacing } from '../../theme/tokens';

type LogbookSectionProps = {
  climbUuid: string;
  boardName: string;
  angle: number;
  userAscents: number | null | undefined;
  userAttempts: number | null | undefined;
};

export const LogbookSection = memo(function LogbookSection({ userAscents, userAttempts }: LogbookSectionProps) {
  const { t } = useTranslation('session');

  const sends = userAscents ?? 0;
  const attempts = userAttempts ?? 0;

  if (sends === 0 && attempts === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="history" size={20} color={iosSystemColors.systemGray} />
        <Text variant="subheadline" color={iosSystemColors.systemGray}>
          {t('mobile.logbook.noEntries')}
        </Text>
      </View>
    );
  }

  let summaryText: string;
  if (sends > 0 && attempts > 0) {
    summaryText = t('mobile.logbook.sendsAndAttempts', { sends, attempts });
  } else if (sends > 0) {
    summaryText = t('mobile.logbook.sendsOnly', { sends });
  } else {
    summaryText = t('mobile.logbook.attemptsOnly', { attempts });
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Icon name="tick" size={20} color={iosSystemColors.systemGreen} />
        <Text variant="body">{summaryText}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
});
