import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../Text';
import { Avatar } from '../Avatar';
import { spacing } from '../../theme/tokens';

type HeaderProfile = {
  displayName?: string | null;
  avatarUrl?: string | null;
};

type YouProfileHeaderProps = {
  profile: HeaderProfile | null;
};

/** Fixed header shown above the swipeable tabs: avatar + name. */
export function YouProfileHeader({ profile }: YouProfileHeaderProps) {
  const { t } = useTranslation('you');
  const displayName = profile?.displayName || t('mobile.unknownName');

  return (
    <View style={styles.container}>
      <Avatar uri={profile?.avatarUrl} name={profile?.displayName} size={72} />
      <Text variant="title2" style={styles.name} numberOfLines={1}>
        {displayName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
  },
  name: {
    marginTop: spacing[3],
  },
});
