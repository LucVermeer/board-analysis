'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import YouProgressContent from './you-progress-content';
import YouPageSkeleton from './you-page-skeleton';

export default function YouPageClient() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  // The /you layout server-redirects unauthenticated visitors to /. If that
  // redirect is ever bypassed we don't want to render a forever-skeleton —
  // bail out cleanly instead.
  if (status === 'unauthenticated') {
    return null;
  }

  if (status === 'loading' || !userId) {
    return <YouPageSkeleton />;
  }

  return <YouProgressContent userId={userId} />;
}
