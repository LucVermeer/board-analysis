import { useMutation, useQueryClient, type QueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  UPDATE_TICK,
  DELETE_TICK,
  type UpdateTickInput,
  type UpdateTickVariables,
  type UpdateTickResponse,
  type DeleteTickMutationVariables,
  type DeleteTickMutationResponse,
  type GetUserAscentsFeedQueryResponse,
} from '@boardsesh/graphql/operations';
import { useBoardAdapter } from './adapter';

// Stats / feed / climb-state caches that derive from a user's ticks. Editing or
// deleting a tick must refresh all of them. Prefix matching means the bare root
// key invalidates every variant (e.g. ['userTicks', '<any-userId>']).
function invalidateTickDependents(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['userTicks'] });
  void queryClient.invalidateQueries({ queryKey: ['userProfileStats'] });
  void queryClient.invalidateQueries({ queryKey: ['userClimbPercentile'] });
  void queryClient.invalidateQueries({ queryKey: ['userAscentsFeed'] });
  void queryClient.invalidateQueries({ queryKey: ['logbook'] });
  void queryClient.invalidateQueries({ queryKey: ['climb'] });
  void queryClient.invalidateQueries({ queryKey: ['searchClimbs'] });
  // The Sessions feed and session-detail screens aggregate sends/flashes/grade
  // pyramids straight from these caches; without busting them, editing or
  // deleting a tick leaves those cards showing stale totals until an unrelated
  // refetch (pull-to-refresh, remount past staleTime, or a comment add).
  void queryClient.invalidateQueries({ queryKey: ['sessionGroupedFeed'] });
  void queryClient.invalidateQueries({ queryKey: ['sessionDetail'] });
}

/** Edit an existing tick (status / date / grade / quality / attempts / comment). */
export function useUpdateTick() {
  const { isAuthenticated, executeHttp } = useBoardAdapter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { uuid: string; input: UpdateTickInput }) => {
      if (!isAuthenticated) throw new Error('Not authenticated');
      const response = await executeHttp<UpdateTickResponse, UpdateTickVariables>(UPDATE_TICK, variables);
      return response.updateTick;
    },
    onSuccess: () => invalidateTickDependents(queryClient),
  });
}

/**
 * Strip a deleted tick from every cached ascents-feed page by uuid. The
 * invalidation below refetches each loaded 20-item offset page sequentially —
 * seconds on a deep logbook — so without this edit the deleted row would sit
 * visibly in the list until the refetch lands. Lives here (beside the
 * invalidation list) so every delete path — swipe, edit sheet, web — behaves
 * the same and the query-key shape isn't duplicated at call sites.
 */
function stripTickFromAscentFeeds(queryClient: QueryClient, uuid: string) {
  queryClient.setQueriesData<InfiniteData<GetUserAscentsFeedQueryResponse>>(
    { queryKey: ['userAscentsFeed'] },
    (cached) => {
      if (!cached) return cached;
      // Each page carries a copy of the whole feed's totalCount — keep it
      // consistent with the strip so a surface reading the total isn't
      // stale-high until the background refetch reconciles. One tick = one off
      // the total, even if offset-pagination overlap duplicated its row across
      // cached pages (the duplicates are cache artifacts, not extra ticks).
      const anyRemoved = cached.pages.some((page) => page.userAscentsFeed.items.some((item) => item.uuid === uuid));
      if (!anyRemoved) return cached;
      return {
        ...cached,
        pages: cached.pages.map((page) => ({
          ...page,
          userAscentsFeed: {
            ...page.userAscentsFeed,
            items: page.userAscentsFeed.items.filter((item) => item.uuid !== uuid),
            totalCount: Math.max(0, page.userAscentsFeed.totalCount - 1),
          },
        })),
      };
    },
  );
}

/** Delete a tick by uuid. */
export function useDeleteTick() {
  const { isAuthenticated, executeHttp } = useBoardAdapter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uuid: string) => {
      if (!isAuthenticated) throw new Error('Not authenticated');
      const response = await executeHttp<DeleteTickMutationResponse, DeleteTickMutationVariables>(DELETE_TICK, {
        uuid,
      });
      return response.deleteTick;
    },
    onSuccess: (_data, uuid) => {
      stripTickFromAscentFeeds(queryClient, uuid);
      invalidateTickDependents(queryClient);
    },
  });
}
