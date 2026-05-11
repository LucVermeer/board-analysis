'use client';

import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { isAdminAnalyticsUrl } from '@/app/lib/analytics-paths';

// Function props (the beforeSend filter that drops /admin pageviews) cannot
// be passed from a Server Component (RootLayout) to a Client Component
// because React Flight tries to JSON-serialize them across the boundary,
// throwing: "Functions cannot be passed directly to Client Components
// unless you explicitly expose it by marking it with 'use server'."
//
// Regression fixed in #2043 / re-guarded in #2061 (Sentry BOARDSESH-65).
// Keep `dropAdminEvents` module-scoped and the exported wrappers prop-less
// — never re-shape these to accept a `beforeSend` from the caller, or the
// home route SSR will break for every visitor on the next deploy.
const dropAdminEvents = <Event extends { url: string }>(event: Event): Event | null => {
  return isAdminAnalyticsUrl(event.url) ? null : event;
};

export function VercelAnalytics() {
  return <Analytics beforeSend={dropAdminEvents} />;
}

export function VercelSpeedInsights() {
  return <SpeedInsights beforeSend={dropAdminEvents} />;
}
