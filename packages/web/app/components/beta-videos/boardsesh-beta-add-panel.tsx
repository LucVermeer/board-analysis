'use client';

import React, { useEffect, useRef } from 'react';
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

/**
 * Inline panel shown inside the Beta section when the user is adding a video.
 * Currently wraps the URL form; this is the single seam for adding richer
 * add-flow UI later (preview, screenshot upload, timestamp picker, etc.).
 */
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
  // Reset add-mode in the parent only when the panel unmounts via an
  // unhandled path (section collapse via lazy: true). When the user
  // explicitly cancels or successfully submits, the parent already flipped
  // isAddingBeta, so we set committedRef to suppress the cleanup and avoid
  // a redundant setState + re-render.
  const onCancelRef = useRef(onCancel);
  const committedRef = useRef(false);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });
  useEffect(
    () => () => {
      if (!committedRef.current) onCancelRef.current();
    },
    [],
  );

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
        submitLabel="Add"
        showCancel
        onCancel={handleCancel}
        onSuccess={handleSuccess}
      />
    </Box>
  );
};

export default BoardseshBetaAddPanel;
