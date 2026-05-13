'use client';

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import AttachBetaLinkForm from './attach-beta-link-form';

type BoardseshBetaAddPanelProps = {
  boardType: string;
  climbUuid: string;
  angle: number;
  climbName?: string;
  grade?: string | null;
  setter?: string | null;
  layoutId?: number | null;
  onCancel: () => void;
  onSuccess: () => void;
};

const BoardseshBetaAddPanel: React.FC<BoardseshBetaAddPanelProps> = ({
  boardType,
  climbUuid,
  angle,
  climbName,
  grade,
  setter,
  layoutId,
  onCancel,
  onSuccess,
}) => {
  const { t } = useTranslation('feed');

  // Reset add-mode in the parent only when the panel unmounts via an
  // unhandled path (section collapse via lazy: true). Explicit
  // cancel/success paths flip committedRef first to suppress this.
  // The setTimeout defer is what makes this strict-mode-safe: in React 18
  // dev, the mount → cleanup → remount double-invoke fires the cleanup
  // between the two mounts; the next setup clears the pending timer so
  // the spurious cancel never lands.
  const onCancelRef = useRef(onCancel);
  const committedRef = useRef(false);
  const pendingCancelRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });
  useEffect(() => {
    if (pendingCancelRef.current !== null) {
      clearTimeout(pendingCancelRef.current);
      pendingCancelRef.current = null;
    }
    return () => {
      if (committedRef.current) return;
      pendingCancelRef.current = setTimeout(() => {
        pendingCancelRef.current = null;
        onCancelRef.current();
      }, 0);
    };
  }, []);

  const handleCancel = () => {
    committedRef.current = true;
    onCancel();
  };
  const handleSuccess = () => {
    committedRef.current = true;
    onSuccess();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, px: 1.5, pt: 1.5, pb: 0.5 }}>
      <AttachBetaLinkForm
        boardType={boardType}
        climbUuid={climbUuid}
        climbName={climbName}
        angle={angle}
        grade={grade}
        setter={setter}
        layoutId={layoutId}
        surface="play-view"
        autoFocus
        compact
        showStepsGuide
        submitLabel={t('betaVideos.addSubmit')}
        showCancel
        onCancel={handleCancel}
        onSuccess={handleSuccess}
      />
    </Box>
  );
};

export default BoardseshBetaAddPanel;
