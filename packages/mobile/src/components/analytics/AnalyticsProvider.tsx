import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { PostHogProvider } from 'posthog-react-native';
import { getAnalyticsClient } from '../../lib/analytics';

// PostHogProvider renders a touch-capturing View around its subtree; without
// flex:1 it would collapse the app layout to zero height.
const styles = StyleSheet.create({ root: { flex: 1 } });

// Wraps the app in PostHogProvider when analytics is live. Touch and screen
// autocapture stay OFF: the app has auth forms and free-text fields, and
// posthog-react-native can't read Expo Router's navigation container reliably
// anyway. AnalyticsScreenTracker emits explicit $screen events instead, and
// user actions are tracked from reviewed call sites. When analytics is disabled
// (dev / no key) this renders children untouched — mirroring how wrapWithSentry
// returns the component unchanged when Sentry is off.
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const client = getAnalyticsClient();
  if (!client) return <>{children}</>;
  return (
    <PostHogProvider client={client} autocapture={{ captureTouches: false, captureScreens: false }} style={styles.root}>
      {children}
    </PostHogProvider>
  );
}
