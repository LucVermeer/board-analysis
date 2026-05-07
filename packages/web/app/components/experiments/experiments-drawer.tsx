'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';

import SwipeableDrawer from '../swipeable-drawer/swipeable-drawer';
import { EXPERIMENTS, setExperiment, useExperiment, type ExperimentKey } from '@/app/lib/experiments';

type ExperimentsDrawerProps = {
  open: boolean;
  onClose: () => void;
  onTransitionEnd?: (open: boolean) => void;
};

type ExperimentRowProps = {
  experimentKey: ExperimentKey;
  labelKey: string;
  descriptionKey: string;
};

const ExperimentRow: React.FC<ExperimentRowProps> = ({ experimentKey, labelKey, descriptionKey }) => {
  const { t } = useTranslation('common');
  const enabled = useExperiment(experimentKey);

  const handleToggle = useCallback(
    (_event: React.SyntheticEvent, checked: boolean) => {
      void setExperiment(experimentKey, checked);
    },
    [experimentKey],
  );

  const labelId = `experiment-${experimentKey}-label`;
  const descriptionId = `experiment-${experimentKey}-description`;

  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="flex-start"
      sx={{
        py: 1.5,
        px: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography id={labelId} variant="body1" component="div" fontWeight={600}>
          {t(labelKey)}
        </Typography>
        <Typography id={descriptionId} variant="body2" component="div" color="text.secondary" sx={{ mt: 0.25 }}>
          {t(descriptionKey)}
        </Typography>
      </Box>
      <Switch
        checked={enabled}
        onChange={handleToggle}
        inputProps={{
          'aria-labelledby': labelId,
          'aria-describedby': descriptionId,
        }}
      />
    </Stack>
  );
};

const ExperimentsDrawer: React.FC<ExperimentsDrawerProps> = ({ open, onClose, onTransitionEnd }) => {
  const { t } = useTranslation('common');

  return (
    <SwipeableDrawer
      placement="left"
      open={open}
      onClose={onClose}
      onTransitionEnd={onTransitionEnd}
      width={320}
      title={t('experiments.title')}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <ScienceOutlined sx={{ color: 'text.secondary', mt: 0.25 }} />
          <Typography variant="body2" color="text.secondary">
            {t('experiments.subtitle')}
          </Typography>
        </Stack>

        <Box>
          {EXPERIMENTS.map((experiment) => (
            <ExperimentRow
              key={experiment.key}
              experimentKey={experiment.key}
              labelKey={experiment.labelKey}
              descriptionKey={experiment.descriptionKey}
            />
          ))}
        </Box>
      </Box>
    </SwipeableDrawer>
  );
};

export default ExperimentsDrawer;
