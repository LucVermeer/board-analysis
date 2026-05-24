'use client';

import React, { type ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

type SessionProviderWrapperProps = {
  children: ReactNode;
};

export default function SessionProviderWrapper({ children }: SessionProviderWrapperProps) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      {children}
    </SessionProvider>
  );
}
