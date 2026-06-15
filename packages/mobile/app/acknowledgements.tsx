import { useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { PressableSurface } from '../src/components/PressableSurface';
import { SectionHeader } from '../src/components/SectionHeader';
import { Text } from '../src/components/Text';
import { useBottomChromeMetrics } from '../src/hooks/use-bottom-chrome-metrics';
import {
  contributors,
  sponsors,
  privateSponsorCount,
  friends,
  partnerName,
  dogName,
  SPONSORS_URL,
} from '../src/lib/acknowledgements';
import { openExternalUrl } from '../src/lib/open-url';
import { useTheme } from '../src/providers/theme-provider';
import { borderRadius, spacing } from '../src/theme/tokens';
import type { IconName } from '../src/components/icon-map';

function Chip({ label, icon, onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  const { systemColors } = useTheme();
  return (
    <PressableSurface
      onPress={onPress}
      feedback="opacity"
      opacityTo={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.chip, { backgroundColor: systemColors.secondaryBackground }]}
    >
      {icon ? <Icon name={icon} size={13} color={systemColors.secondaryLabel} /> : null}
      <Text variant="subheadline" numberOfLines={1}>
        {label}
      </Text>
    </PressableSurface>
  );
}

function ThanksCard({
  icon,
  title,
  body,
  highlighted = false,
}: {
  icon: IconName;
  title: string;
  body: string;
  highlighted?: boolean;
}) {
  const { systemColors, brandColors } = useTheme();
  const background = highlighted ? brandColors.primaryFill : systemColors.secondaryBackground;
  const onColor = highlighted ? brandColors.onPrimary : undefined;
  const bodyColor = highlighted ? brandColors.onPrimary : systemColors.secondaryLabel;
  const iconColor = highlighted ? brandColors.onPrimary : systemColors.accent;
  return (
    <View style={[styles.card, { backgroundColor: background }]}>
      <View style={[styles.cardIcon, { backgroundColor: highlighted ? 'transparent' : systemColors.fill }]}>
        <Icon name={icon} size={highlighted ? 26 : 22} color={iconColor} />
      </View>
      <View style={styles.cardText}>
        <Text variant="headline" color={onColor} style={styles.cardTitle}>
          {title}
        </Text>
        <Text variant="subheadline" color={bodyColor} style={styles.cardBody}>
          {body}
        </Text>
      </View>
    </View>
  );
}

export default function AcknowledgementsScreen() {
  const { t } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const router = useRouter();
  const friendsLine = friends.join(', ');

  const handleOpenProfile = useCallback((url: string) => {
    void openExternalUrl(url, 'acknowledgements');
  }, []);
  const handleBecomeSponsor = useCallback(() => {
    void openExternalUrl(SPONSORS_URL, 'acknowledgements-sponsor');
  }, []);
  const handleOpenLicenses = useCallback(() => {
    router.push('/licenses');
  }, [router]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('mobile.acknowledgements.title'),
          headerShown: true,
          headerLargeTitle: false,
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'systemMaterial',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.container, { paddingBottom: bottomChrome.scrollBottomPadding + spacing[6] }]}
      >
        <View style={[styles.hero, { backgroundColor: systemColors.secondaryBackground }]}>
          <View style={[styles.heroIcon, { backgroundColor: brandColors.primaryFill }]}>
            <Icon name="favorite.fill" size={28} color={brandColors.onPrimary} />
          </View>
          <Text variant="body" color={systemColors.secondaryLabel} style={styles.heroBody}>
            {t('mobile.acknowledgements.intro')}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('mobile.acknowledgements.contributorsTitle')} />
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.sectionBody}>
            {t('mobile.acknowledgements.contributorsBody')}
          </Text>
          <View style={styles.chips}>
            {contributors.map((contributor) => (
              <Chip
                key={contributor.login}
                label={contributor.name ?? contributor.login}
                onPress={() => handleOpenProfile(contributor.htmlUrl)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('mobile.acknowledgements.sponsorsTitle')} />
          {sponsors.length > 0 ? (
            <>
              <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.sectionBody}>
                {t('mobile.acknowledgements.sponsorsBody')}
              </Text>
              <View style={styles.chips}>
                {sponsors.map((sponsor) => (
                  <Chip
                    key={sponsor.login}
                    icon="favorite.fill"
                    label={sponsor.name ?? sponsor.login}
                    onPress={() => handleOpenProfile(sponsor.url)}
                  />
                ))}
              </View>
              {privateSponsorCount > 0 ? (
                <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.privateThanks}>
                  {t('mobile.acknowledgements.privateSponsorsThanks', { count: privateSponsorCount })}
                </Text>
              ) : null}
            </>
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: systemColors.secondaryBackground }]}>
              <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.emptyText}>
                {privateSponsorCount > 0
                  ? t('mobile.acknowledgements.privateSponsorsThanks', { count: privateSponsorCount })
                  : t('mobile.acknowledgements.sponsorsEmpty')}
              </Text>
              <Button
                title={t('mobile.acknowledgements.becomeSponsor')}
                icon="favorite"
                size="large"
                variant="outlined"
                onPress={handleBecomeSponsor}
                style={styles.sponsorButton}
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('mobile.acknowledgements.personalTitle')} />
          <View style={styles.cardStack}>
            <ThanksCard
              icon="people"
              title={t('mobile.acknowledgements.friendsTitle')}
              body={t('mobile.acknowledgements.friendsBody', { names: friendsLine })}
            />
            <ThanksCard
              icon="favorite.fill"
              title={partnerName}
              body={t('mobile.acknowledgements.partnerThanksBody')}
              highlighted
            />
            <ThanksCard icon="paw" title={dogName} body={t('mobile.acknowledgements.dogBody')} />
          </View>
        </View>

        <PressableSurface
          onPress={handleOpenLicenses}
          feedback="opacity"
          opacityTo={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.acknowledgements.ossLicensesLink')}
          style={[styles.linkRow, { backgroundColor: systemColors.secondaryBackground }]}
        >
          <View style={[styles.cardIcon, { backgroundColor: systemColors.fill }]}>
            <Icon name="doc.text" size={22} color={systemColors.accent} />
          </View>
          <View style={styles.cardText}>
            <Text variant="headline" style={styles.cardTitle}>
              {t('mobile.acknowledgements.ossLicensesLink')}
            </Text>
            <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.cardBody}>
              {t('mobile.acknowledgements.ossLicensesBody')}
            </Text>
          </View>
          <Icon name="chevron.right" size={16} color={systemColors.secondaryLabel} />
        </PressableSurface>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    gap: spacing[6],
  },
  hero: {
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
  },
  heroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    marginBottom: spacing[4],
  },
  heroBody: {
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    gap: spacing[2],
  },
  sectionBody: {
    paddingHorizontal: spacing[1],
    lineHeight: 20,
  },
  privateThanks: {
    paddingHorizontal: spacing[1],
    marginTop: spacing[1],
    lineHeight: 20,
    fontStyle: 'italic',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
  },
  cardStack: {
    gap: spacing[3],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
  cardIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontWeight: '700',
  },
  cardBody: {
    marginTop: spacing[1],
    lineHeight: 20,
  },
  emptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  emptyText: {
    lineHeight: 20,
  },
  sponsorButton: {
    marginTop: spacing[4],
    alignSelf: 'flex-start',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
});
