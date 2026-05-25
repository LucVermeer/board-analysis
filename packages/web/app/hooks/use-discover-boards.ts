import { useState, useEffect, useCallback, useRef } from 'react';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { SEARCH_BOARDS, type SearchBoardsQueryResponse } from '@boardsesh/graphql/operations';
import type { UserBoard } from '@boardsesh/shared-schema';

type UseDiscoverBoardsOptions = {
  /** Maximum number of boards to return */
  limit?: number;
  /** Whether to request geolocation from the browser */
  enableLocation?: boolean;
};

type DiscoverBoardsResult = {
  boards: UserBoard[];
  isLoading: boolean;
  hasLocation: boolean;
  error: string | null;
};

/**
 * Discovers nearby public boards for the home page.
 * Only fetches when enableLocation is true — resolves geolocation first,
 * then calls SEARCH_BOARDS with coordinates. Never calls SEARCH_BOARDS
 * without coordinates.
 *
 * Re-fetches when the auth token changes (e.g. user logs in) so that
 * board results can reflect authenticated context (isFollowedByMe, etc.).
 */
export function useDiscoverBoards({
  limit = 20,
  enableLocation = true,
}: UseDiscoverBoardsOptions = {}): DiscoverBoardsResult {
  const { token, isAuthenticated } = useWsAuthToken();
  const [boards, setBoards] = useState<UserBoard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache geolocation so we don't re-prompt on token changes
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const geoResolvedRef = useRef(false);

  const resolveGeolocation = useCallback((): Promise<{
    latitude: number;
    longitude: number;
  } | null> => {
    if (coordsRef.current) return Promise.resolve(coordsRef.current);
    if (geoResolvedRef.current) return Promise.resolve(null);

    if (!enableLocation || typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(null);
    }

    // Set after enableLocation check so toggling enableLocation from false→true can still trigger geo
    geoResolvedRef.current = true;

    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        maximumAge: 300000,
        enableHighAccuracy: false,
      });
    })
      .then((position) => {
        coordsRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        return coordsRef.current;
      })
      .catch(() => null);
  }, [enableLocation]);

  useEffect(() => {
    // Don't fetch anything until location is enabled
    if (!enableLocation) return;

    let cancelled = false;

    const doFetch = async () => {
      setIsLoading(true);
      setError(null);

      const coords = await resolveGeolocation();

      if (cancelled) return;

      if (!coords) {
        // Geolocation denied/unavailable — nothing to show
        setIsLoading(false);
        return;
      }

      const client = createGraphQLHttpClient(token ?? undefined);

      try {
        const result = await client.request<SearchBoardsQueryResponse>(SEARCH_BOARDS, {
          input: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            radiusKm: 1,
            limit,
          },
        });
        if (!cancelled) {
          setBoards(result.searchBoards.boards);
          setHasLocation(true);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load nearby boards');
        }
      }

      if (!cancelled) {
        setIsLoading(false);
      }
    };

    void doFetch();

    return () => {
      cancelled = true;
    };
    // Re-run when auth state changes so boards reflect authenticated context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, enableLocation, resolveGeolocation, limit]);

  return { boards, isLoading, hasLocation, error };
}
