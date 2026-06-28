import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChannelSwitcherScreen } from '../src/components/ChannelSwitcherScreen';
import { useStackScreenOptions } from '../src/hooks/use-stack-screen-options';

// Root-level route (sibling of changelog.tsx, where the "Try a preview" entry
// lives) rather than a profile-tab screen, so pushing it from the changelog
// stays in the same stack and gets a native header back button. Sets its own
// header (the root Stack defaults to headerShown: false), mirroring changelog.
export default function ChannelSwitcherRoute() {
  const { t } = useTranslation('common');
  const screenOptions = useStackScreenOptions();
  return (
    <>
      <Stack.Screen options={{ ...screenOptions, title: t('mobile.previewChannels.screenTitle'), headerShown: true }} />
      <ChannelSwitcherScreen />
    </>
  );
}
