// Mobile's data hook for FavoritesProvider + PlaylistsProvider — the analog of
// web's `useClimbActionsData`. Returns provider-shaped props the layout passes
// straight in.
//
// Scope: mutations are bound to the user's *default* board (boardType + angle
// + layoutId). Mobile mounts these providers above QueueProvider, so there's
// no per-climb board context available here; the default board is the only
// stable signal we have at this point in the tree. If/when mobile gains a
// "use a different board for a session" flow, this hook should accept a board
// override or move below the queue provider.
//
// Favorites Set is left empty for now: there's no single GraphQL query that
// returns just the favorited UUIDs for a board, and paginating
// `GET_USER_FAVORITE_CLIMBS` solely to populate a Set is wasteful when no
// mobile screen currently consumes it. When a screen needs per-climb
// favorited state, call `GET_FAVORITES` for the visible UUIDs and feed the
// result into `favoritesStore` directly. The `toggleFavorite` mutation is
// fully wired today.

import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TOGGLE_FAVORITE, type ToggleFavoriteMutationResponse } from '@boardsesh/graphql/operations/favorites';
import {
  GET_ALL_USER_PLAYLISTS,
  ADD_CLIMB_TO_PLAYLIST,
  REMOVE_CLIMB_FROM_PLAYLIST,
  CREATE_PLAYLIST,
  type Playlist,
  type GetAllUserPlaylistsQueryResponse,
  type AddClimbToPlaylistMutationResponse,
  type CreatePlaylistMutationResponse,
} from '@boardsesh/graphql/operations/playlists';
import { getHttpClient } from '../client';
import { useAuth } from '../../../providers/auth-provider';
import { useDefaultBoard } from '../hooks';

const EMPTY_FAVORITES: ReadonlySet<string> = new Set();
const EMPTY_PLAYLISTS: ReadonlyArray<Playlist> = [];
const EMPTY_MEMBERSHIPS: ReadonlyMap<string, Set<string>> = new Map();

type MobileClimbActionsData = {
  favoritesProviderProps: {
    favorites: Set<string>;
    toggleFavorite: (uuid: string) => Promise<boolean>;
    isLoading: boolean;
    isAuthenticated: boolean;
  };
  playlistsProviderProps: {
    playlists: Playlist[];
    playlistMemberships: Map<string, Set<string>>;
    addToPlaylist: (playlistId: string, climbUuid: string, angle: number) => Promise<void>;
    removeFromPlaylist: (playlistId: string, climbUuid: string) => Promise<void>;
    createPlaylist: (name: string, description?: string, color?: string, icon?: string) => Promise<Playlist>;
    isLoading: boolean;
    isAuthenticated: boolean;
    refreshPlaylists: () => Promise<void>;
  };
};

export function useMobileClimbActionsData(): MobileClimbActionsData {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { data: defaultBoard } = useDefaultBoard();
  const queryClient = useQueryClient();

  // === Playlists ===

  const playlistsQueryKey = useMemo(() => ['userPlaylists'] as const, []);

  const { data: playlists = EMPTY_PLAYLISTS as Playlist[], isLoading: playlistsLoading } = useQuery({
    queryKey: playlistsQueryKey,
    queryFn: async (): Promise<Playlist[]> => {
      const response = await getHttpClient().request<GetAllUserPlaylistsQueryResponse>(GET_ALL_USER_PLAYLISTS, {
        input: { pageSize: 200 },
      });
      return response.allUserPlaylists.playlists;
    },
    enabled: isAuthenticated && !isAuthLoading,
    staleTime: 5 * 60 * 1000,
  });

  // === Mutations ===

  // Bag of mutation deps in a single ref so the public callbacks below stay
  // referentially stable across renders (avoids cascading the entire provider
  // tree on every defaultBoard refresh).
  const mutationDepsRef = useRef({
    defaultBoard,
    queryClient,
    playlistsQueryKey,
    isAuthenticated,
  });
  mutationDepsRef.current = { defaultBoard, queryClient, playlistsQueryKey, isAuthenticated };

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (climbUuid: string): Promise<{ uuid: string; favorited: boolean }> => {
      const { defaultBoard: board } = mutationDepsRef.current;
      if (!board) throw new Error('Cannot toggle favorite: no default board configured.');
      const response = await getHttpClient().request<ToggleFavoriteMutationResponse>(TOGGLE_FAVORITE, {
        input: { boardName: board.boardType, climbUuid, angle: board.angle ?? 0 },
      });
      return { uuid: climbUuid, favorited: response.toggleFavorite.favorited };
    },
  });

  const addPlaylistMutation = useMutation({
    mutationFn: async (vars: { playlistId: string; climbUuid: string; angle: number }) => {
      return getHttpClient().request<AddClimbToPlaylistMutationResponse>(ADD_CLIMB_TO_PLAYLIST, {
        input: { playlistId: vars.playlistId, climbUuid: vars.climbUuid, angle: vars.angle },
      });
    },
  });

  const removePlaylistMutation = useMutation({
    mutationFn: async (vars: { playlistId: string; climbUuid: string }) => {
      return getHttpClient().request(REMOVE_CLIMB_FROM_PLAYLIST, {
        input: { playlistId: vars.playlistId, climbUuid: vars.climbUuid },
      });
    },
  });

  const createPlaylistMutation = useMutation({
    mutationFn: async (vars: { name: string; description?: string; color?: string; icon?: string }) => {
      const { defaultBoard: board } = mutationDepsRef.current;
      if (!board) throw new Error('Cannot create playlist: no default board configured.');
      const response = await getHttpClient().request<CreatePlaylistMutationResponse>(CREATE_PLAYLIST, {
        input: {
          boardType: board.boardType,
          layoutId: board.layoutId,
          name: vars.name,
          description: vars.description,
          color: vars.color,
          icon: vars.icon,
        },
      });
      return response.createPlaylist;
    },
  });

  // Keep mutateAsync refs so the callbacks below are stable. useMutation
  // returns a new wrapper object each render even when mutateAsync is
  // identity-stable; reading through a ref avoids cascading the provider.
  const toggleFavMutateRef = useRef(toggleFavoriteMutation.mutateAsync);
  toggleFavMutateRef.current = toggleFavoriteMutation.mutateAsync;
  const addPlaylistMutateRef = useRef(addPlaylistMutation.mutateAsync);
  addPlaylistMutateRef.current = addPlaylistMutation.mutateAsync;
  const removePlaylistMutateRef = useRef(removePlaylistMutation.mutateAsync);
  removePlaylistMutateRef.current = removePlaylistMutation.mutateAsync;
  const createPlaylistMutateRef = useRef(createPlaylistMutation.mutateAsync);
  createPlaylistMutateRef.current = createPlaylistMutation.mutateAsync;

  const toggleFavorite = useCallback(async (climbUuid: string): Promise<boolean> => {
    if (!mutationDepsRef.current.isAuthenticated) return false;
    const result = await toggleFavMutateRef.current(climbUuid);
    return result.favorited;
  }, []);

  const addToPlaylist = useCallback(async (playlistId: string, climbUuid: string, angle: number) => {
    await addPlaylistMutateRef.current({ playlistId, climbUuid, angle });
  }, []);

  const removeFromPlaylist = useCallback(async (playlistId: string, climbUuid: string) => {
    await removePlaylistMutateRef.current({ playlistId, climbUuid });
  }, []);

  const createPlaylist = useCallback(
    async (name: string, description?: string, color?: string, icon?: string): Promise<Playlist> => {
      const created = await createPlaylistMutateRef.current({ name, description, color, icon });
      // Optimistically prepend to the cached list so the picker shows the new
      // playlist immediately, without waiting for a refetch round-trip.
      const { queryClient: client, playlistsQueryKey: key } = mutationDepsRef.current;
      client.setQueryData<Playlist[]>(key, (prev) => (prev ? [created, ...prev] : [created]));
      return created;
    },
    [],
  );

  const refreshPlaylists = useCallback(async () => {
    const { queryClient: client, playlistsQueryKey: key } = mutationDepsRef.current;
    await client.invalidateQueries({ queryKey: key });
  }, []);

  return {
    favoritesProviderProps: {
      favorites: EMPTY_FAVORITES as Set<string>,
      toggleFavorite,
      isLoading: isAuthLoading,
      isAuthenticated,
    },
    playlistsProviderProps: {
      playlists,
      playlistMemberships: EMPTY_MEMBERSHIPS as Map<string, Set<string>>,
      addToPlaylist,
      removeFromPlaylist,
      createPlaylist,
      isLoading: playlistsLoading,
      isAuthenticated,
      refreshPlaylists,
    },
  };
}
