/**
 * Safely close the Capacitor in-app browser (SFSafariViewController on iOS,
 * Chrome Custom Tabs on Android).
 *
 * On iOS the plugin throws `Error: No active window to close!` when
 * `Browser.close()` is called and there is no in-app browser currently
 * presented. That happens regularly during the native OAuth flow: the OS
 * dismisses SFSafariViewController automatically when the custom-scheme
 * deep link fires, so by the time our `appUrlOpen` listener runs the
 * browser is already gone. The error is benign — there is nothing to do
 * but ignore it — but it bubbles up as an unhandled promise rejection
 * (Sentry BOARDSESH-29) on iOS Capacitor builds.
 *
 * See: https://github.com/ionic-team/capacitor-plugins/issues/1899
 */

const NO_ACTIVE_WINDOW_MESSAGES = [
  'no active window to close',
  // Older plugin versions phrased it slightly differently; match defensively.
  'no browser is open',
];

const isExpectedCloseFailure = (error: unknown): boolean => {
  if (!error) return false;
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '';
  const normalized = message.toLowerCase();
  return NO_ACTIVE_WINDOW_MESSAGES.some((needle) => normalized.includes(needle));
};

/**
 * Call `Browser.close()` if the plugin is available, and swallow the
 * "no active window to close" error that iOS throws when the in-app
 * browser was already dismissed. Other errors are logged but never
 * re-thrown — the caller is in a cleanup path and shouldn't have its
 * happy path broken by a teardown hiccup.
 */
export async function closeCapacitorBrowser(): Promise<void> {
  if (typeof window === 'undefined') return;
  const browserPlugin = window.Capacitor?.Plugins?.Browser;
  if (!browserPlugin || typeof browserPlugin.close !== 'function') return;

  try {
    await browserPlugin.close();
  } catch (error) {
    if (isExpectedCloseFailure(error)) {
      // Expected on iOS when the OS already dismissed SFSafariViewController.
      return;
    }
    console.warn('[Capacitor Browser] close() failed unexpectedly:', error);
  }
}
