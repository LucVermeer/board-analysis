'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

type WsAuthResponse = {
  token: string | null;
  authenticated: boolean;
  error?: string;
};

async function fetchWsAuthToken(): Promise<WsAuthResponse> {
  const response = await fetch('/api/internal/ws-auth');
  if (!response.ok) {
    throw new Error(`Failed to fetch auth token: ${response.status}`);
  }
  return response.json();
}

/**
 * Hook to get a WebSocket authentication token from the server.
 * Uses TanStack Query for deduplication and caching — all callers
 * share a single fetch via the shared query key.
 *
 * Includes the NextAuth session status in the query key so the token
 * is automatically re-fetched when the user logs in or out.
 */
export function useWsAuthToken(enabled = true) {
  const { status } = useSession();

  const { data, isLoading, error } = useQuery({
    queryKey: ['wsAuthToken', status],
    queryFn: fetchWsAuthToken,
    staleTime: Infinity,
    retry: 1,
    enabled: enabled && status !== 'loading',
  });

  let errorMessage: string | null;
  if (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
  } else {
    errorMessage = data?.error ?? null;
  }

  return {
    token: enabled ? (data?.token ?? null) : null,
    isAuthenticated: enabled ? (data?.authenticated ?? false) : false,
    isLoading: enabled && (isLoading || status === 'loading'),
    error: enabled ? errorMessage : null,
  };
}
