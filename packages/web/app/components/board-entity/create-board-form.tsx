'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import {
  CREATE_BOARD,
  type CreateBoardMutationVariables,
  type CreateBoardMutationResponse,
} from '@boardsesh/graphql/operations';
import { useLocaleRouter } from '@/app/lib/i18n/use-locale-router';
import { constructBoardSlugListUrl } from '@/app/lib/url-utils';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { BoardName } from '@/app/lib/types';
import { ANGLES } from '@/app/lib/board-data';
import BoardForm from './board-form';

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

  const availableAngles = ANGLES[boardType as BoardName] ?? [];

  const { execute } = useEntityMutation<CreateBoardMutationResponse, CreateBoardMutationVariables>(CREATE_BOARD, {
    errorMessage: t('boardForm.create.errorMessage'),
    authRequiredMessage: t('boardForm.create.authRequired'),
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
