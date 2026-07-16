import { describe, it, expect, vi } from 'vite-plus/test';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FormShell, focusFirstInvalid } from '../form-shell';

describe('FormShell', () => {
  it('renders the error banner as an alert', () => {
    render(
      <FormShell onSubmit={vi.fn()} error="Something went wrong">
        <div />
      </FormShell>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Something went wrong');
  });

  it('renders no alert when there is no error', () => {
    render(
      <FormShell onSubmit={vi.fn()}>
        <div />
      </FormShell>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('caps content width at 640px by default', () => {
    render(
      <FormShell onSubmit={vi.fn()}>
        <div />
      </FormShell>,
    );
    const styleText = Array.from(document.querySelectorAll('style'))
      .map((styleEl) => styleEl.textContent ?? '')
      .join('');
    expect(styleText).toMatch(/max-width:\s*640px/);
  });

  describe('focusFirstInvalid', () => {
    it('focuses the first control marked aria-invalid', () => {
      render(
        <FormShell onSubmit={vi.fn()} id="focus-form">
          <input aria-invalid="false" data-testid="ok" />
          <input aria-invalid="true" data-testid="bad" />
          <input aria-invalid="true" data-testid="bad-two" />
        </FormShell>,
      );
      const form = document.getElementById('focus-form');
      const focused = focusFirstInvalid(form);
      expect(focused).toBe(screen.getByTestId('bad'));
      expect(document.activeElement).toBe(screen.getByTestId('bad'));
    });

    it('returns null when nothing is invalid', () => {
      render(
        <FormShell onSubmit={vi.fn()} id="clean-form">
          <input aria-invalid="false" />
        </FormShell>,
      );
      expect(focusFirstInvalid(document.getElementById('clean-form'))).toBeNull();
    });

    it('returns null for a missing form element', () => {
      expect(focusFirstInvalid(null)).toBeNull();
    });
  });
});
