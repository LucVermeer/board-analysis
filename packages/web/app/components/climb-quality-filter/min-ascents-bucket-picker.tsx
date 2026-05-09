'use client';

import React from 'react';
import MuiBox from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { SxProps, Theme } from '@mui/material/styles';
import { getMinAscentsFilterOptions, normalizeMinAscentsFilter } from '@/app/lib/climb-quality-filter-options';

type MinAscentsBucketPickerProps = {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  getOptionLabel: (value: number) => string;
};

const bucketPickerWrapperSx: SxProps<Theme> = {
  maxWidth: '100%',
  overflowX: 'auto',
};

const bucketPickerGroupSx: SxProps<Theme> = (theme) => ({
  display: 'inline-flex',
  flexWrap: 'nowrap',
  gap: theme.spacing(0.5),
  '& .MuiToggleButtonGroup-grouped': {
    border: 1,
    borderColor: 'divider',
    borderRadius: theme.shape.borderRadius,
    margin: 0,
  },
  '& .MuiToggleButton-root': {
    flex: '0 0 auto',
    minHeight: theme.spacing(4.5),
    minWidth: theme.spacing(6.5),
    px: 1.25,
    py: 0.5,
    textTransform: 'none',
  },
});

const MinAscentsBucketPicker: React.FC<MinAscentsBucketPickerProps> = ({
  value,
  onChange,
  ariaLabel,
  getOptionLabel,
}) => {
  const normalizedValue = normalizeMinAscentsFilter(value);
  const minAscentsOptions = getMinAscentsFilterOptions(normalizedValue);

  return (
    <MuiBox sx={bucketPickerWrapperSx}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={normalizedValue}
        aria-label={ariaLabel}
        onChange={(_, nextValue: number | null) => {
          if (nextValue !== null) {
            onChange(normalizeMinAscentsFilter(nextValue));
          }
        }}
        sx={bucketPickerGroupSx}
      >
        {minAscentsOptions.map((minAscents) => (
          <ToggleButton key={minAscents} value={minAscents} aria-label={getOptionLabel(minAscents)}>
            {getOptionLabel(minAscents)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </MuiBox>
  );
};

export default MinAscentsBucketPicker;
