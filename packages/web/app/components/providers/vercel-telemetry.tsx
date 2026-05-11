'use client';

import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { isAdminAnalyticsUrl } from '@/app/lib/analytics-paths';

// Function props (the beforeSend filter that drops /admin pageviews) cannot be
// passed from a Server Component (RootLayout) to a Client Component, so the
// configuration lives here in the client boundary.
const dropAdminEvents = <Event extends { url: string }>(event: Event): Event | null => {
  const baseUrl = typeof window === 'undefined' ? undefined : window.location.origin;
  return isAdminAnalyticsUrl(event.url, baseUrl) ? null : event;
};

export function VercelAnalytics() {
  return <Analytics beforeSend={dropAdminEvents} />;
}

export function VercelSpeedInsights() {
  return <SpeedInsights beforeSend={dropAdminEvents} />;
}
