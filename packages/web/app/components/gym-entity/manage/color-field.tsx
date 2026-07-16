'use client';

// Hex colour field: a text input for the exact #RRGGBB value plus a swatch
// that proxies the browser's native colour picker. The swatch is a <label>
// wrapping a visually-hidden <input type="color">, so clicking the swatch
// opens the OS picker and the two inputs can never disagree — both write the
// same state.

import React from 'react';
import { z } from 'zod';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Box from '@mui/material/Box';
import { themeTokens } from '@/app/theme/theme-config';

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** True for a complete #RRGGBB value (what the backend's HexColorSchema accepts). */
export function isValidHexColor(value: string): boolean {
  return HexColorSchema.safeParse(value).success;
}

/** Keep typed input inside the #RRGGBB alphabet without blocking mid-edit states. */
function sanitizeHexInput(raw: string): string {
  const hexDigits = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  return raw.trim() === '' ? '' : `#${hexDigits}`;
}

type ColorFieldProps = {
  label: string;
  /** Current value: '' when unset, otherwise whatever the user typed so far. */
  value: string;
  onChange: (nextValue: string) => void;
  /** Shown when the value is a valid hex (or empty); the error text replaces it otherwise. */
  helperText?: string;
  errorText: string;
  disabled?: boolean;
  /** Swatch colour while the text value is empty/incomplete. */
  fallbackColor: string;
};

export default function ColorField({
  label,
  value,
  onChange,
  helperText,
  errorText,
  disabled = false,
  fallbackColor,
}: ColorFieldProps) {
  const isInvalid = value !== '' && !isValidHexColor(value);
  const swatchColor = isValidHexColor(value) ? value : fallbackColor;

  return (
    <TextField
      label={label}
      value={value}
      onChange={(event) => onChange(sanitizeHexInput(event.target.value))}
      size="small"
      fullWidth
      disabled={disabled}
      error={isInvalid}
      helperText={isInvalid ? errorText : helperText}
      // i18n-ignore-next-line -- hex format template, identical in every locale
      placeholder="#RRGGBB"
      slotProps={{
        htmlInput: { maxLength: 7, spellCheck: false },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Box
                component="label"
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: `${themeTokens.borderRadius.sm}px`,
                  border: '1px solid',
                  borderColor: 'divider',
                  backgroundColor: swatchColor,
                  cursor: disabled ? 'default' : 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              >
                <Box
                  component="input"
                  type="color"
                  value={swatchColor}
                  disabled={disabled}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
                  aria-label={label}
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'inherit',
                    border: 0,
                    padding: 0,
                  }}
                />
              </Box>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
