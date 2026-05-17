'use client';

import React, { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useSession } from 'next-auth/react';
import { createIdbPersister } from '@/app/lib/react-query-idb-persister';

type QueryClientProviderProps = {
  children: ReactNode;
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export default function QueryClientProvider({ children }: QueryClientProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [persister] = useState(() => createIdbPersister());
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  const persistOptions = useMemo(
    () => ({
      persister,
      maxAge: MAX_AGE_MS,
      buster: sessionUserId ?? 'anon',
      dehydrateOptions: {
        shouldDehydrateQuery: (query: { meta?: Record<string, unknown>; state: { status: string } }) =>
          query.meta?.persist === true && query.state.status === 'success',
      },
    }),
    [persister, sessionUserId],
  );

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <SessionCacheBuster persister={persister} sessionUserId={sessionUserId} />
      {children}
    </PersistQueryClientProvider>
  );
}

type SessionCacheBusterProps = {
  persister: ReturnType<typeof createIdbPersister>;
  sessionUserId: string | null;
};

// Belt-and-braces companion to the persister `buster`: when the signed-in user
// changes (sign-out, switch account), wipe the in-memory persist-flagged
// queries and clear the IDB blob so the next user can't ever see a stale frame
// from the previous identity.
function SessionCacheBuster({ persister, sessionUserId }: SessionCacheBusterProps) {
  const queryClient = useQueryClient();
  const lastUserIdRef = useRef<string | null>(sessionUserId);

  useEffect(() => {
    if (lastUserIdRef.current === sessionUserId) return;
    lastUserIdRef.current = sessionUserId;
    queryClient.removeQueries({ predicate: (query) => query.meta?.persist === true });
    void persister.removeClient();
  }, [queryClient, persister, sessionUserId]);

  return null;
}
