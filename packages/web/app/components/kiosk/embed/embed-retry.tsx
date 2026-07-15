// Transient-failure state shared by both embed routes: the self-healing
// KioskRetryScreen rendered INSIDE the embed shell, so the non-removable
// "Powered by Boardsesh" bar stays visible even while the widget is
// recovering from a backend blip. Unbranded theme on purpose — the gym
// branding lives in the payload the page just failed to fetch.

import React from 'react';
import type { Locale } from '@/app/lib/i18n/config';
import I18nProvider from '../../providers/i18n-provider';
import KioskRetryScreen from '../kiosk-retry-screen';
import EmbedShell from './embed-shell';

export default function EmbedRetryState({ locale }: { locale: Locale }) {
  return (
    <I18nProvider locale={locale} namespaces={['common', 'kiosk']}>
      <EmbedShell brandGym={null} attributionHref="https://boardsesh.com">
        <KioskRetryScreen fill="container" />
      </EmbedShell>
    </I18nProvider>
  );
}
