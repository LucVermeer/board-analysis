import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { glassStackScreenOptions } from '../../../src/theme/navigation';

/**
 * The Record tab renders the session screen inline (its `index` route). The
 * Stack also hosts `/record/summary` (which fires after `endSession()`) as a
 * modal, and gives future deep links / nested routes a place to land.
 */
export default function RecordLayout() {
  const { t } = useTranslation('common');

  return (
    <Stack screenOptions={glassStackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="summary"
        options={{
          title: t('summary.dialogTitle'),
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
