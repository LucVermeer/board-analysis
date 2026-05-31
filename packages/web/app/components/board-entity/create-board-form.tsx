'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import {
  CREATE_BOARD,
  GET_MY_BOARDS,
  type CreateBoardMutationVariables,
  type CreateBoardMutationResponse,
  type GetMyBoardsQueryResponse,
} from '@boardsesh/graphql/operations';
import { useLocaleRouter } from '@/app/lib/i18n/use-locale-router';
import { useWsAuthToken } from '@/app/hooks/use-ws-auth-token';
import { createGraphQLHttpClient } from '@/app/lib/graphql/client';
import { constructBoardSlugListUrl } from '@/app/lib/url-utils';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { BoardName } from '@/app/lib/types';
import { ANGLES } from '@/app/lib/board-data';
import BoardForm from './board-form';

type BoardConfig = { boardType: string; layoutId: number; sizeId: number; setIds: string };

// Looked up only on a create failure, so the happy path doesn't pay for it. The
// duplicate error doesn't carry the existing board's slug, so we fetch the
// user's boards and match the config to offer a jump to it. A lookup failure
// must not mask the original error, so we swallow it and fall back to the message.
async function findBoardForConfig(token: string, config: BoardConfig): Promise<UserBoard | null> {
  try {
    const client = createGraphQLHttpClient(token);
    const pageSize = 50;
    const maxPages = 20;
    for (let page = 0; page < maxPages; page++) {
      const data = await client.request<GetMyBoardsQueryResponse>(GET_MY_BOARDS, {
        input: { limit: pageSize, offset: page * pageSize },
      });
      const match = data.myBoards.boards.find(
        (board) =>
          board.boardType === config.boardType &&
          board.layoutId === config.layoutId &&
          board.sizeId === config.sizeId &&
          board.setIds === config.setIds,
      );
      if (match) return match;
      if (!data.myBoards.hasMore) return null;
    }
    return null;
  } catch {
    return null;
  }
}

type CreateBoardFormProps = {
  boardType: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  defaultAngle: number;
  onSuccess?: (board: UserBoard) => void;
  onCancel?: () => void;
};

export default function CreateBoardForm({
  boardType,
  layoutId,
  sizeId,
  setIds,
  defaultAngle,
  onSuccess,
  onCancel,
}: CreateBoardFormProps) {
  const { t } = useTranslation('boards');
  const { showMessage } = useSnackbar();
  const router = useLocaleRouter();
  const { token } = useWsAuthToken();

  const availableAngles = ANGLES[boardType as BoardName] ?? [];

  const handleCreateError = useCallback(
    async (_error: unknown, serverMessage: string | null) => {
      const existing = token ? await findBoardForConfig(token, { boardType, layoutId, sizeId, setIds }) : null;
      if (existing) {
        showMessage(
          t('boardForm.create.duplicateNamed', { name: existing.name }),
          'error',
          {
            label: t('boardForm.create.goToExisting'),
            onClick: () => router.push(constructBoardSlugListUrl(existing.slug, existing.angle)),
          },
          8000,
        );
        return;
      }
      showMessage(serverMessage ?? t('boardForm.create.errorMessage'), 'error');
    },
    [token, boardType, layoutId, sizeId, setIds, showMessage, router, t],
  );

  const { execute } = useEntityMutation<CreateBoardMutationResponse, CreateBoardMutationVariables>(CREATE_BOARD, {
    errorMessage: t('boardForm.create.errorMessage'),
    authRequiredMessage: t('boardForm.create.authRequired'),
    onError: handleCreateError,
  });

  const handleSubmit = useCallback(
    async (values: {
      name: string;
      description: string;
      locationName: string;
      latitude?: number | null;
      longitude?: number | null;
      isPublic: boolean;
      isUnlisted: boolean;
      hideLocation: boolean;
      isOwned: boolean;
      angle?: number;
      isAngleAdjustable?: boolean;
    }) => {
      if (!values.name) {
        showMessage(t('boardForm.create.nameRequired'), 'error');
        return;
      }

      const data = await execute({
        input: {
          boardType,
          layoutId,
          sizeId,
          setIds,
          name: values.name,
          description: values.description || undefined,
          locationName: values.locationName || undefined,
          latitude: values.latitude ?? undefined,
          longitude: values.longitude ?? undefined,
          isPublic: values.isPublic,
          isUnlisted: values.isUnlisted,
          hideLocation: values.hideLocation,
          isOwned: values.isOwned,
          angle: values.angle,
          isAngleAdjustable: values.isAngleAdjustable,
        },
      });

      if (data) {
        const board = data.createBoard;
        showMessage(t('boardForm.create.createdNamed', { name: board.name }), 'success');

        if (onSuccess) {
          onSuccess(board);
        } else {
          router.push(constructBoardSlugListUrl(board.slug, defaultAngle));
        }
      }
    },
    [execute, boardType, layoutId, sizeId, setIds, defaultAngle, showMessage, router, onSuccess, t],
  );

  return (
    <BoardForm
      title=""
      submitLabel={t('boardForm.create.submit')}
      initialValues={{
        name: '',
        description: '',
        locationName: '',
        isPublic: true,
        isUnlisted: false,
        hideLocation: false,
        isOwned: true,
      }}
      namePlaceholder={t('boardForm.create.namePlaceholder')}
      locationPlaceholder={t('boardForm.create.locationPlaceholder')}
      availableAngles={availableAngles}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
