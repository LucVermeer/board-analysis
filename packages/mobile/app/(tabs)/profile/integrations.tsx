import type { ComponentType } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { AppleHealthCard } from '../../../src/components/integrations/AppleHealthCard';
import { StravaCard } from '../../../src/components/integrations/StravaCard';
import { getSupportedIntegrations, type IntegrationId } from '../../../src/lib/integrations';
import { spacing } from '../../../src/theme/tokens';

// One card per supported integration. The registry decides which integrations
// are available on this platform; this lookup maps each id to its UI.
const INTEGRATION_CARDS: Record<IntegrationId, ComponentType> = {
  'apple-health': AppleHealthCard,
  strava: StravaCard,
};

export default function IntegrationsScreen() {
  const { t } = useTranslation('settings');
  const integrations = getSupportedIntegrations();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      {integrations.map((integration) => {
        const Card = INTEGRATION_CARDS[integration.id];
        return (
          <View key={integration.id} style={styles.section}>
            {/* titleKey is a registry-driven dynamic lookup; the concrete keys are
                static and present in every locale.
                i18n-keep integrations.appleHealth.title
                i18n-keep integrations.strava.title */}
            <SectionHeader title={t(integration.titleKey)} />
            <Card />
          </View>
        );
      })}
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
});
