import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/providers/theme-provider';
import { DevMetadataPanel } from '../../../src/components/DevMetadataPanel';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { ListRow } from '../../../src/components/ListRow';
import { Icon } from '../../../src/components/Icon';
import { isPreviewBuild } from '../../../src/lib/eas-api';

export default function MoreScreen() {
  const { systemColors } = useTheme();
  const { t } = useTranslation('common');
  const router = useRouter();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <DevMetadataPanel />

      {isPreviewBuild() ? (
        <>
          {/* i18n-ignore-next-line — preview-only section */}
          <SectionHeader title="Preview Build" />
          <ListRow
            // i18n-ignore-next-line
            title="Branch Switcher"
            // i18n-ignore-next-line
            subtitle="Switch EAS Update branch"
            leading={<Icon name="branch" size={22} color={systemColors.label} />}
            showChevron
            showSeparator={false}
            onPress={() => router.push('/(tabs)/more/branch-switcher')}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
  },
});
