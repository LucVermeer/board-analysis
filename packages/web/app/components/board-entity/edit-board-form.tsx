'use client';

import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from '@/app/components/providers/snackbar-provider';
import { useEntityMutation } from '@/app/hooks/use-entity-mutation';
import {
  UPDATE_BOARD,
  type UpdateBoardMutationVariables,
  type UpdateBoardMutationResponse,
} from '@boardsesh/graphql/operations';
import type { UserBoard } from '@boardsesh/shared-schema';
import type { BoardName } from '@/app/lib/types';
import { ANGLES } from '@/app/lib/board-data';
import { getBoardSelectorOptions } from '@/app/lib/board-constants';
import BoardForm from './board-form';

type EditBoardFormProps = {
  board: UserBoard;
  totalAscents?: number;
  onSuccess?: (board: UserBoard) => void;
  onCancel?: () => void;
};

export default function EditBoardForm({ board, totalAscents, onSuccess, onCancel }: EditBoardFormProps) {
  const { t } = useTranslation('boards');
  const { showMessage } = useSnackbar();

  const availableAngles = ANGLES[board.boardType as BoardName] ?? [];

  const { execute } = useEntityMutation<UpdateBoardMutationResponse, UpdateBoardMutationVariables>(UPDATE_BOARD, {
    successMessage: t('editBoard.snackbar.updated'),
    errorMessage: t('editBoard.snackbar.updateFailed'),
  });

  const configEditable = useMemo(() => {
    if (totalAscents !== 0) return undefined;
    const options = getBoardSelectorOptions();
    const boardType = board.boardType as BoardName;
    const layouts = options.layouts[boardType] ?? [];
    if (layouts.length === 0) return undefined;
    return { boardType, layouts, sizes: options.sizes, sets: options.sets };
  }, [totalAscents, board.boardType]);

  const handleSubmit = useCallback(
    async (values: {
      name: string;
      slug?: string;
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
      layoutId?: number;
      sizeId?: number;
      setIds?: string;
      serialNumber?: string;
    }) => {
      if (!values.name) {
        showMessage(t('boardForm.create.nameRequired'), 'error');
        return;
      }

      const data = await execute({
        input: {
          boardUuid: board.uuid,
          name: values.name,
          slug: values.slug || undefined,
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
          ...(configEditable
            ? {
                layoutId: values.layoutId,
                sizeId: values.sizeId,
                setIds: values.setIds,
              }
            : {}),
          serialNumber: values.serialNumber,
        },
      });

      if (data) {
        onSuccess?.(data.updateBoard);
      }
    },
    [execute, board.uuid, showMessage, onSuccess, configEditable, t],
  );

  return (
    <BoardForm
      title={t('editBoard.title')}
      submitLabel={t('editBoard.submitLabel')}
      initialValues={{
        name: board.name,
        slug: board.slug,
        description: board.description ?? '',
        locationName: board.locationName ?? '',
        latitude: board.latitude ?? null,
        longitude: board.longitude ?? null,
        isPublic: board.isPublic,
        isUnlisted: board.isUnlisted,
        hideLocation: board.hideLocation,
        isOwned: board.isOwned,
        angle: board.angle,
        isAngleAdjustable: board.isAngleAdjustable,
        layoutId: board.layoutId,
        sizeId: board.sizeId,
        setIds: board.setIds,
        serialNumber: board.serialNumber ?? '',
      }}
      showSlugField
      availableAngles={availableAngles}
      configEditable={configEditable}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
