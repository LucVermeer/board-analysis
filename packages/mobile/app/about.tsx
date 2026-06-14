import { useCallback } from 'react';
import { Stack } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { SectionHeader } from '../src/components/SectionHeader';
import { Text } from '../src/components/Text';
import { useBottomChromeMetrics } from '../src/hooks/use-bottom-chrome-metrics';
import { openDiscordInvite } from '../src/lib/discord';
import { useTheme } from '../src/providers/theme-provider';
import { borderRadius, spacing } from '../src/theme/tokens';
import type { IconName } from '../src/components/icon-map';

type AboutCard = {
  icon: IconName;
  title: string;
  body: string;
};

export default function AboutScreen() {
  const { t } = useTranslation('common');
  const { systemColors, brandColors } = useTheme();
  const bottomChrome = useBottomChromeMetrics();
  const handleJoinDiscord = useCallback(() => {
    void openDiscordInvite('about');
  }, []);
  const cards: AboutCard[] = [
    {
      icon: 'lightbulb',
      title: t('mobile.about.whatItDoesTitle'),
      body: t('mobile.about.whatItDoesBody'),
    },
    {
      icon: 'boards',
      title: t('mobile.about.boardsTitle'),
      body: t('mobile.about.boardsBody'),
    },
    {
      icon: 'people',
      title: t('mobile.about.openTitle'),
      body: t('mobile.about.openBody'),
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: t('mobile.about.title'),
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
            <Icon name="boards.fill" size={32} color={brandColors.onPrimary} />
          </View>
          <Text variant="title1" style={styles.heroTitle}>
            {t('mobile.about.heroTitle')}
          </Text>
          <Text variant="body" color={systemColors.secondaryLabel} style={styles.heroBody}>
            {t('mobile.about.heroBody')}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('mobile.about.sectionTitle')} />
          <View style={styles.cardStack}>
            {cards.map((card) => (
              <View key={card.title} style={[styles.card, { backgroundColor: systemColors.secondaryBackground }]}>
                <View style={[styles.cardIcon, { backgroundColor: systemColors.fill }]}>
                  <Icon name={card.icon} size={22} color={systemColors.accent} />
                </View>
                <View style={styles.cardText}>
                  <Text variant="headline" style={styles.cardTitle}>
                    {card.title}
                  </Text>
                  <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.cardBody}>
                    {card.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.notice, { backgroundColor: systemColors.secondaryBackground }]}>
          <Text variant="headline" style={styles.noticeTitle}>
            {t('mobile.about.independentTitle')}
          </Text>
          <Text variant="subheadline" color={systemColors.secondaryLabel} style={styles.noticeBody}>
            {t('mobile.about.independentBody')}
          </Text>
        </View>
        <Button title={t('mobile.about.joinDiscord')} icon="open.external" size="large" onPress={handleJoinDiscord} />
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
    paddingVertical: spacing[8],
  },
  heroIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    marginBottom: spacing[4],
  },
  heroTitle: {
    textAlign: 'center',
    fontWeight: '800',
  },
  heroBody: {
    marginTop: spacing[3],
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    gap: spacing[2],
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
  notice: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
  },
  noticeTitle: {
    fontWeight: '700',
  },
  noticeBody: {
    marginTop: spacing[2],
    lineHeight: 20,
  },
});
