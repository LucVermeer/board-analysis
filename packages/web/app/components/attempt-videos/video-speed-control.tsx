'use client';

import { useTranslation } from 'react-i18next';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

type VideoSpeedControlProps = {
  value: number;
  onChange: (speed: number) => void;
};

export default function VideoSpeedControl({ value, onChange }: VideoSpeedControlProps) {
  const { t } = useTranslation('climbs');
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_, speed: number | null) => {
        if (speed != null) onChange(speed);
      }}
      aria-label={t('attemptVideos.playbackSpeed')}
      sx={{ '& .MuiToggleButton-root': { minWidth: 48, minHeight: 40, textTransform: 'none' } }}
    >
      <ToggleButton value={0.25}>0.25x</ToggleButton>
      <ToggleButton value={0.5}>0.5x</ToggleButton>
      <ToggleButton value={1}>1x</ToggleButton>
    </ToggleButtonGroup>
  );
}
