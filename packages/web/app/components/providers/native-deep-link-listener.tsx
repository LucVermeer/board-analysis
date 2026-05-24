'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signIn } from 'next-auth/react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { isNativeApp } from '@/app/lib/ble/capacitor-utils';
import { closeCapacitorBrowser } from '@/app/lib/ble/capacitor-browser';
import { NATIVE_OAUTH_CALLBACK_SCHEME } from '@/app/lib/auth/native-oauth-config';

async function handleAppUrlOpen(url: string): Promise<void> {
  if (!url.startsWith(NATIVE_OAUTH_CALLBACK_SCHEME)) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    await closeCapacitorBrowser();
    window.location.assign('/auth/login?error=OAuthCallback');
    return;
  }

  const callbackError = parsed.searchParams.get('error');
  const transferToken = parsed.searchParams.get('transferToken');
  const nextPath = parsed.searchParams.get('next') ?? '/';
  const safeCallbackUrl = nextPath.startsWith('/') ? nextPath : '/';

  if (callbackError || !transferToken) {
    await closeCapacitorBrowser();
    window.location.assign('/auth/login?error=OAuthCallback');
    return;
  }

  const result = await signIn('native-oauth', {
    transferToken,
    callbackUrl: safeCallbackUrl,
    redirect: false,
  });

  await closeCapacitorBrowser();

  if (result?.error) {
    window.location.assign('/auth/login?error=OAuthCallback');
    return;
  }

  window.location.assign(result?.url ?? safeCallbackUrl);
}

export default function NativeDeepLinkListener() {
  const { t } = useTranslation('settings');
  const [deepLinkError, setDeepLinkError] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) {
      return;
    }

    const appPlugin = window.Capacitor?.Plugins?.App;
    if (!appPlugin) {
      return;
    }

    let cancelled = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    // addListener may return a PluginListenerHandle directly (Capacitor 6+)
    // or a Promise<PluginListenerHandle> (Capacitor 5). Wrap with
    // Promise.resolve to handle both cases safely.
    const listenerResult = appPlugin.addListener('appUrlOpen', ({ url }) => {
      void handleAppUrlOpen(url).catch((error) => {
        console.error('[Native OAuth] Unexpected error handling appUrlOpen:', error);
      });
    });

    Promise.resolve(listenerResult)
      .then((handle) => {
        if (cancelled) {
          void handle.remove();
        } else {
          listenerHandle = handle;
        }
      })
      .catch((err) => {
        console.error('[Native OAuth] Failed to register appUrlOpen listener:', err);
        setDeepLinkError(true);
      });

    return () => {
      cancelled = true;
      void listenerHandle?.remove();
    };
  }, []);

  return (
    <Snackbar open={deepLinkError} autoHideDuration={8000} onClose={() => setDeepLinkError(false)}>
      <Alert severity="warning" onClose={() => setDeepLinkError(false)}>
        {t('sessionProvider.deepLinkError')}
      </Alert>
    </Snackbar>
  );
}
