'use client';

import React from 'react';
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
        onCancel={onCancel}
        onSuccess={onSuccess}
      />
    </Box>
  );
};

export default BoardseshBetaAddPanel;
