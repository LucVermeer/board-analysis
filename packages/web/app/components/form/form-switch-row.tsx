'use client';

import * as React from 'react';
import { useId } from 'react';
import Box from '@mui/material/Box';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

export type FormSwitchRowProps = {
  label: React.ReactNode;
  /** Supporting copy under the label. Wired to the switch via `aria-describedby`. */
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/**
 * FormSwitchRow is a full-width, 44px-min tappable row (>=64px with a description): the
 * text block sits left, the switch right. The whole row is a `<label>` that wraps the
 * switch, so a tap anywhere on the row toggles it; the switch also carries `htmlFor` for
 * an explicit association, and the description is linked with `aria-describedby`.
 */
export function FormSwitchRow({ label, description, checked, onChange, disabled = false }: FormSwitchRowProps) {
  const switchId = useId();
  const descriptionId = `${switchId}-description`;
  return (
    <Box
      component="label"
      htmlFor={switchId}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        width: '100%',
        minHeight: description != null ? 64 : 44,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <Typography variant="body1" component="span" color={disabled ? 'text.disabled' : 'text.primary'}>
          {label}
        </Typography>
        {description != null ? (
          <Typography id={descriptionId} variant="caption" component="span" color="text.secondary">
            {description}
          </Typography>
        ) : null}
      </Box>
      <Switch
        id={switchId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        slotProps={{ input: { 'aria-describedby': description != null ? descriptionId : undefined } }}
      />
    </Box>
  );
}
