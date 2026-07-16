'use client';

import * as React from 'react';
import { useId } from 'react';
import Box from '@mui/material/Box';
import FormLabel from '@mui/material/FormLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { themeTokens } from '@/app/theme/theme-config';

/** Counter is emphasised once the value reaches 80% of its max. */
const COUNTER_EMPHASIS_RATIO = 0.8;

/**
 * The wiring object handed to a FormField render-prop child. Spread the relevant bits
 * onto the control:
 *  - TextField:  `id={field.id}` + `error={Boolean(field.error)}` +
 *                `inputProps={{ 'aria-describedby': field.describedBy }}`
 *  - Select:     `labelId={field.labelId}` + `id={field.id}` + `error={Boolean(field.error)}`
 *  - pickers:    map `id` / `error` / `describedBy` into the picker's textField slot
 *                (see `FormDateTimePicker`)
 */
export type FormFieldRenderState = {
  /** id for the control; set as `id` on a TextField / picker text field. */
  id: string;
  /** id of the helper/error text; pass to the control's `aria-describedby`. Undefined when there is no helper/error. */
  describedBy: string | undefined;
  /** Current error — a string message, a truthy element, or a boolean flag (ReactNode covers booleans). `false` when clean. */
  error: React.ReactNode;
  /** Whether the field is required. */
  required: boolean;
  /** id of the visible label. MUI `Select` needs this as its `labelId` to be announced. */
  labelId: string;
};

export type FormFieldProps = {
  label: React.ReactNode;
  required?: boolean;
  helper?: React.ReactNode;
  /** Error message (string, replaces the helper) or a boolean flag (error styling only; ReactNode covers booleans). */
  error?: React.ReactNode;
  /** Character counter, right-aligned in the helper row. Emphasised at >= 80% of max. */
  counter?: { value: number; max: number };
  /** Right-aligned content next to the label (e.g. an "optional" chip or a help link). */
  labelAccessory?: React.ReactNode;
  /** Explicit control id. When omitted a stable id is generated with `useId`. */
  htmlFor?: string;
  /**
   * Either a render-prop `(field) => ReactNode` (preferred for TextField / Select /
   * pickers, which bring their own FormControl) or a plain element (a custom / non-MUI
   * control, wrapped in `role="group"` + `aria-labelledby`).
   */
  children: React.ReactNode | ((field: FormFieldRenderState) => React.ReactNode);
  sx?: SxProps<Theme>;
};

/**
 * Build the trio of ids (`id`, `labelId`, `describedById`) a field needs, honouring an
 * explicit id when supplied. Exposed for consumers composing controls outside FormField.
 */
export function useFormFieldIds(providedId?: string): { id: string; labelId: string; describedById: string } {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return { id, labelId: `${id}-label`, describedById: `${id}-helper` };
}

/**
 * FormField renders the label row, the control, and the helper/counter row for a single
 * field. It deliberately does NOT wrap the control in its own `FormControl`: MUI's
 * TextField (and Select-via-TextField) ship their own FormControl, and nesting them
 * fights over context. Instead:
 *
 *  - Render-prop children receive an explicit wiring object (`id`, `describedBy`,
 *    `error`, `required`, `labelId`) to spread onto the control. This is the path for
 *    MUI inputs and date/time pickers.
 *  - Plain-element children (custom / non-MUI controls) are wrapped in a
 *    `role="group"` + `aria-labelledby` container so the visible label still names them.
 *
 * The helper row only renders when a helper, an error, or a counter is present
 * (conditional reservation — no empty gap under clean fields). When `error` is a string
 * it replaces the helper text.
 */
export function FormField({
  label,
  required = false,
  helper,
  error,
  counter,
  labelAccessory,
  htmlFor,
  children,
  sx,
}: FormFieldProps) {
  const { id: inputId, labelId, describedById } = useFormFieldIds(htmlFor);

  const isRenderProp = typeof children === 'function';
  const errorText = typeof error === 'string' ? error : null;
  const hasError = Boolean(error);
  const helperContent = errorText ?? helper;
  const hasHelperRow = helperContent != null || counter != null;
  const describedBy = helperContent != null ? describedById : undefined;

  const nearMax = counter != null && counter.max > 0 && counter.value >= counter.max * COUNTER_EMPHASIS_RATIO;

  return (
    <Box sx={[{ display: 'flex', flexDirection: 'column' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: '4px',
          minHeight: 20,
        }}
      >
        <FormLabel
          id={labelId}
          htmlFor={isRenderProp ? inputId : undefined}
          required={required}
          error={hasError}
          sx={{ m: 0 }}
        >
          {label}
        </FormLabel>
        {labelAccessory != null ? (
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{labelAccessory}</Box>
        ) : null}
      </Box>

      {isRenderProp ? (
        (children as (field: FormFieldRenderState) => React.ReactNode)({
          id: inputId,
          describedBy,
          error: error ?? false,
          required,
          labelId,
        })
      ) : (
        <Box role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
          {children}
        </Box>
      )}

      {hasHelperRow ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            // Counter-only rows right-align without a placeholder element.
            justifyContent: helperContent != null ? 'space-between' : 'flex-end',
            gap: 1,
            mt: '4px',
          }}
        >
          {helperContent != null ? (
            <FormHelperText id={describedById} error={hasError} sx={{ m: 0 }}>
              {helperContent}
            </FormHelperText>
          ) : null}
          {counter != null ? (
            <Typography
              variant="caption"
              component="span"
              data-emphasized={nearMax ? 'true' : 'false'}
              color={nearMax ? 'text.primary' : 'text.secondary'}
              sx={{
                flexShrink: 0,
                fontWeight: nearMax
                  ? themeTokens.typography.fontWeight.semibold
                  : themeTokens.typography.fontWeight.normal,
                whiteSpace: 'nowrap',
              }}
            >
              {counter.value} / {counter.max}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
