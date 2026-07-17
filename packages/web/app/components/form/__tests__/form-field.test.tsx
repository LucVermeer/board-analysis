import { describe, it, expect } from 'vite-plus/test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import TextField from '@mui/material/TextField';
import { FormField } from '../form-field';

describe('FormField', () => {
  describe('render-prop path (TextField)', () => {
    it('associates the label with the input via htmlFor / id', () => {
      render(
        <FormField label="Display name">
          {(field) => <TextField id={field.id} inputProps={{ 'aria-describedby': field.describedBy }} />}
        </FormField>,
      );
      // getByLabelText resolves the input through the FormLabel's htmlFor -> input id link.
      expect(screen.getByLabelText('Display name')).toBeTruthy();
    });

    it('replaces the helper with the error string and wires aria-describedby + aria-invalid', () => {
      render(
        <FormField label="Email" helper="We never share it" error="Enter a valid email">
          {(field) => (
            <TextField
              id={field.id}
              error={Boolean(field.error)}
              inputProps={{ 'aria-describedby': field.describedBy }}
            />
          )}
        </FormField>,
      );

      // Helper copy is replaced by the error message.
      expect(screen.queryByText('We never share it')).toBeNull();
      expect(screen.getByText('Enter a valid email')).toBeTruthy();

      const input = screen.getByLabelText('Email');
      expect(input.getAttribute('aria-invalid')).toBe('true');

      const describedById = input.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();
      const helperEl = document.getElementById(describedById as string);
      expect(helperEl?.textContent).toBe('Enter a valid email');
    });

    it('renders the counter and emphasizes it once value reaches 80% of max', () => {
      const { rerender } = render(
        <FormField label="Bio" counter={{ value: 40, max: 100 }}>
          {(field) => <TextField id={field.id} />}
        </FormField>,
      );
      const belowThreshold = screen.getByText('40 / 100');
      expect(belowThreshold).toBeTruthy();
      expect(belowThreshold.getAttribute('data-emphasized')).toBe('false');

      rerender(
        <FormField label="Bio" counter={{ value: 80, max: 100 }}>
          {(field) => <TextField id={field.id} />}
        </FormField>,
      );
      expect(screen.getByText('80 / 100').getAttribute('data-emphasized')).toBe('true');
    });

    it('announces a counter-only field via aria-describedby', () => {
      render(
        <FormField label="Bio" counter={{ value: 40, max: 100 }}>
          {(field) => <TextField id={field.id} inputProps={{ 'aria-describedby': field.describedBy }} />}
        </FormField>,
      );
      const input = screen.getByLabelText('Bio');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)?.textContent).toBe('40 / 100');
    });

    it('lists both the helper id and the counter id in aria-describedby when both are present', () => {
      render(
        <FormField label="Bio" helper="Tell the crew about yourself" counter={{ value: 40, max: 100 }}>
          {(field) => <TextField id={field.id} inputProps={{ 'aria-describedby': field.describedBy }} />}
        </FormField>,
      );
      const input = screen.getByLabelText('Bio');
      const describedByIds = (input.getAttribute('aria-describedby') ?? '').split(' ');
      expect(describedByIds).toHaveLength(2);
      const referencedText = describedByIds.map((referencedId) => document.getElementById(referencedId)?.textContent);
      expect(referencedText).toContain('Tell the crew about yourself');
      expect(referencedText).toContain('40 / 100');
    });

    it('renders a required asterisk that is hidden from the accessibility tree', () => {
      const { container } = render(
        <FormField label="Name" required>
          {(field) => <TextField id={field.id} />}
        </FormField>,
      );
      const asterisk = container.querySelector('.MuiFormLabel-asterisk');
      expect(asterisk).toBeTruthy();
      expect(asterisk?.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders labelAccessory content', () => {
      render(
        <FormField label="Password" labelAccessory={<span>Forgot?</span>}>
          {(field) => <TextField id={field.id} />}
        </FormField>,
      );
      expect(screen.getByText('Forgot?')).toBeTruthy();
    });

    it('omits the helper row entirely when there is no helper, error, or counter', () => {
      const { container } = render(<FormField label="Nickname">{(field) => <TextField id={field.id} />}</FormField>);
      expect(container.querySelector('.MuiFormHelperText-root')).toBeNull();
    });
  });

  describe('plain-element path (custom control)', () => {
    it('wraps a plain element in role="group" labelled by the field label', () => {
      render(
        <FormField label="Colour">
          <div data-testid="custom-control">custom</div>
        </FormField>,
      );
      const group = screen.getByRole('group');
      const labelledBy = group.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const labelEl = document.getElementById(labelledBy as string);
      expect(labelEl?.textContent).toContain('Colour');
      expect(screen.getByTestId('custom-control')).toBeTruthy();
    });
  });
});
