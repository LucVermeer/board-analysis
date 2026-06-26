'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { extractGraphQLErrorMessage } from '@/app/lib/graphql/extract-error-message';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { Variables } from 'graphql-request';

type UseEntityMutationOptions = {
  successMessage?: string;
  errorMessage: string;
  authRequiredMessage?: string;
  // Called when the mutation throws. `serverMessage` is the resolver's
  // user-facing message when the failure is a GraphQL error (e.g. "You already
  // have a board with this configuration"), otherwise null. When provided, the
  // caller owns the error toast; otherwise the hook shows `serverMessage` (when
  // present) and falls back to the generic `errorMessage`.
  onError?: (error: unknown, serverMessage: string | null) => void | Promise<void>;
};

export function useEntityMutation<TResponse, TVariables extends Variables = Variables>(
  mutation: TypedDocumentNode | string,
  { successMessage, errorMessage, authRequiredMessage, onError }: UseEntityMutationOptions,
) {
  const { token } = useWsAuthToken();
  const { showMessage } = useSnackbar();
  const { t } = useTranslation('common');
  const resolvedAuthRequiredMessage = authRequiredMessage ?? t('auth.mustBeSignedIn');

  const execute = useCallback(
    async (variables: TVariables): Promise<TResponse | null> => {
      if (!token) {
        showMessage(resolvedAuthRequiredMessage, 'error');
        return null;
      }

      try {
        const client = createGraphQLHttpClient(token);
        const data = await client.request<TResponse>(mutation, variables as Variables);
        if (successMessage) {
          showMessage(successMessage, 'success');
        }
        return data;
      } catch (error) {
        console.error(errorMessage, error);
        const serverMessage = extractGraphQLErrorMessage(error);
        if (onError) {
          await onError(error, serverMessage);
        } else {
          showMessage(serverMessage ?? errorMessage, 'error');
        }
        return null;
      }
    },
    [token, mutation, successMessage, errorMessage, resolvedAuthRequiredMessage, onError, showMessage],
  );

  return { execute, token };
}
