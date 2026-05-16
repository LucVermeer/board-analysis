'use client';

import { useMutation } from '@tanstack/react-query';
import { useWsAuthToken } from './use-ws-auth-token';
import { useSession } from 'next-auth/react';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import {
  SAVE_CLIMB_MUTATION,
  UPDATE_CLIMB_MUTATION,
  type SaveClimbMutationVariables,
  type SaveClimbMutationResponse,
  type UpdateClimbMutationVariables,
  type UpdateClimbMutationResponse,
} from '@/app/lib/graphql/operations/new-climb-feed';
import { createGraphQLClient, execute, GraphQLOperationError } from '@/app/components/graphql-queue/graphql-client';
import { getBackendWsUrl } from '@/app/lib/backend-url';
import type { BoardName } from '@/app/lib/types';
import type { SaveClimbOptions } from '@/app/lib/api-wrappers/aurora/types';
import type { UpdateClimbInput } from '@boardsesh/shared-schema';

export type SaveClimbResponse = {
  uuid: string;
  createdAt?: string | null;
  publishedAt?: string | null;
};

export type UpdateClimbResponse = {
  uuid: string;
  createdAt?: string | null;
  publishedAt?: string | null;
  isDraft: boolean;
};

/**
 * Hook to save a new climb via GraphQL mutation.
 */
export function useSaveClimb(boardName: BoardName) {
  const { token } = useWsAuthToken();
  const { data: session, status: sessionStatus } = useSession();
  const { showMessage } = useSnackbar();

  return useMutation({
    mutationFn: async (options: Omit<SaveClimbOptions, 'setter_id' | 'user_id'>): Promise<SaveClimbResponse> => {
      if (sessionStatus !== 'authenticated' || !session?.user?.id || !token) {
        throw new Error('Authentication required to create climbs');
      }

      // Create a fresh client per mutation to avoid stale token refs.
      // The client is disposed immediately after the request completes.
      const client = createGraphQLClient({
        url: getBackendWsUrl()!,
        authToken: token,
      });

      try {
        const variables: SaveClimbMutationVariables = {
          input: {
            boardType: boardName,
            layoutId: options.layout_id,
            name: options.name,
            description: options.description || '',
            isDraft: options.is_draft,
            frames: options.frames,
            framesCount: options.frames_count,
            framesPace: options.frames_pace,
            angle: options.angle,
          },
        };

        const result = await execute<SaveClimbMutationResponse, SaveClimbMutationVariables>(client, {
          query: SAVE_CLIMB_MUTATION,
          variables,
        });

        return result.saveClimb;
      } finally {
        void client.dispose();
      }
    },
    onError: (err) => {
      // Duplicate-publish rejections render a richer inline UX in the form
      // (see create-climb-form), so suppress the generic snackbar for that
      // case and let the caller handle it explicitly.
      if (err instanceof GraphQLOperationError && err.extensions?.code === 'CLIMB_IS_DUPLICATE') {
        return;
      }
      showMessage('Failed to save climb', 'error');
    },
  });
}

/**
 * Hook to update an existing climb. Only the climb's owner may call this,
 * and only while the climb is still a draft or within 24h of first publish.
 * The backend enforces both rules.
 */
export function useUpdateClimb() {
  const { token } = useWsAuthToken();
  const { data: session, status: sessionStatus } = useSession();

  return useMutation({
    mutationFn: async (input: UpdateClimbInput): Promise<UpdateClimbResponse> => {
      if (sessionStatus !== 'authenticated' || !session?.user?.id || !token) {
        throw new Error('Authentication required to update climbs');
      }

      const client = createGraphQLClient({
        url: getBackendWsUrl()!,
        authToken: token,
      });

      try {
        const variables: UpdateClimbMutationVariables = { input };
        const result = await execute<UpdateClimbMutationResponse, UpdateClimbMutationVariables>(client, {
          query: UPDATE_CLIMB_MUTATION,
          variables,
        });
        return result.updateClimb;
      } finally {
        void client.dispose();
      }
    },
  });
}
