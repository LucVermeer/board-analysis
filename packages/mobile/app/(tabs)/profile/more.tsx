import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GradeDisplayFormat } from '@boardsesh/play-view';
import type { ThemeOverride, UiVariantPreference } from '@boardsesh/key-value-storage';
import { useTheme } from '../../../src/providers/theme-provider';
import { useAuth } from '../../../src/providers/auth-provider';
import { useProfile } from '../../../src/lib/graphql/hooks';
import { spacing } from '../../../src/theme/tokens';
import { DevMetadataPanel } from '../../../src/components/DevMetadataPanel';
import { Icon } from '../../../src/components/Icon';
import { Text } from '../../../src/components/Text';
import { ListRow } from '../../../src/components/ListRow';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { SegmentedControl } from '../../../src/components/SegmentedControl';
import { isPreviewBuild } from '../../../src/lib/eas-api';
import { useGradeFormat } from '../../../src/hooks/use-grade-format';
import { useGlassCapability } from '../../../src/hooks/use-glass-capability';

export default function MoreScreen() {
  const {
    systemColors,
    brandColors,
    borderRadius,
    themeOverride,
    setThemeOverride,
    uiVariantPreference,
    setUiVariant,
  } = useTheme();
  const { t } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const { gradeFormat, setGradeFormat } = useGradeFormat();
  const glassCapable = useGlassCapability();

  const appearanceOptions: { key: ThemeOverride; label: string }[] = [
    { key: 'system', label: t('mobile.more.appearance.system') },
    { key: 'light', label: t('mobile.more.appearance.light') },
    { key: 'dark', label: t('mobile.more.appearance.dark') },
  ];

  const uiStyleOptions: { key: UiVariantPreference; label: string }[] = [
    { key: 'auto', label: t('mobile.more.uiStyle.auto') },
    { key: 'liquidGlass', label: t('mobile.more.uiStyle.liquidGlass') },
    { key: 'material', label: t('mobile.more.uiStyle.material') },
  ];
  // Liquid Glass can't render on Android / iOS < 26, so show it disabled there
  // rather than hide it — more honest than a no-op control.
  const disabledUiStyles = glassCapable ? undefined : new Set<UiVariantPreference>(['liquidGlass']);

  const gradeFormatOptions: { key: GradeDisplayFormat; label: string }[] = [
    { key: 'v-grade', label: t('mobile.more.gradeFormat.vGrade') },
    { key: 'font', label: t('mobile.more.gradeFormat.font') },
    { key: 'both', label: t('mobile.more.gradeFormat.both') },
  ];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <DevMetadataPanel />

      <View style={styles.section}>
        <SectionHeader title={t('mobile.more.appearance.title')} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: systemColors.secondaryBackground,
              borderRadius: borderRadius.lg,
              marginHorizontal: spacing[4],
              padding: spacing[3],
            },
          ]}
        >
          <SegmentedControl
            options={appearanceOptions}
            selectedKey={themeOverride}
            onSelect={(key) => void setThemeOverride(key)}
            trackColor={systemColors.fill}
            accessibilityLabel={t('mobile.more.appearance.title')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('mobile.more.uiStyle.title')} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: systemColors.secondaryBackground,
              borderRadius: borderRadius.lg,
              marginHorizontal: spacing[4],
              padding: spacing[3],
            },
          ]}
        >
          <SegmentedControl
            options={uiStyleOptions}
            selectedKey={uiVariantPreference}
            onSelect={(key) => void setUiVariant(key)}
            disabledKeys={disabledUiStyles}
            trackColor={systemColors.fill}
            accessibilityLabel={t('mobile.more.uiStyle.title')}
          />
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingHint}>
            {glassCapable ? t('mobile.more.uiStyle.description') : t('mobile.more.uiStyle.glassUnavailable')}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('mobile.more.gradeFormat.title')} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: systemColors.secondaryBackground,
              borderRadius: borderRadius.lg,
              marginHorizontal: spacing[4],
              padding: spacing[3],
            },
          ]}
        >
          <SegmentedControl
            options={gradeFormatOptions}
            selectedKey={gradeFormat}
            onSelect={setGradeFormat}
            trackColor={systemColors.fill}
            accessibilityLabel={t('mobile.more.gradeFormat.title')}
          />
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.settingHint}>
            {t('mobile.more.gradeFormat.description')}
          </Text>
        </View>
      </View>

      {__DEV__ ? (
        <View style={styles.section}>
          <SectionHeader title={t('mobile.more.development')} />
          <View
            style={[
              styles.card,
              {
                backgroundColor: systemColors.secondaryBackground,
                borderRadius: borderRadius.lg,
                marginHorizontal: spacing[4],
              },
            ]}
          >
            <ListRow
              title={t('mobile.more.metroServersTitle')}
              subtitle={t('mobile.more.metroServersSubtitle')}
              leading={<Icon name="server" size={22} color={systemColors.secondaryLabel} />}
              showChevron
              showSeparator={false}
              onPress={() => router.push('/(tabs)/profile/dev-servers')}
            />
          </View>
        </View>
      ) : null}

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
            onPress={() => router.push('/(tabs)/profile/branch-switcher')}
          />
        </>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title={tProfile('mobile.account')} />
        {profile?.email ? (
          <Text variant="footnote" color={systemColors.secondaryLabel} style={styles.accountEmail}>
            {profile.email}
          </Text>
        ) : null}
        <Pressable
          style={[styles.signOut, { borderColor: systemColors.separator, marginHorizontal: spacing[4] }]}
          onPress={signOut}
          accessibilityRole="button"
        >
          <Text variant="body" color={brandColors.error}>
            {tProfile('mobile.signOut')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
  },
  section: {
    width: '100%',
    marginBottom: spacing[6],
  },
  card: {
    overflow: 'hidden',
  },
  settingHint: {
    marginTop: spacing[2],
  },
  accountEmail: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
