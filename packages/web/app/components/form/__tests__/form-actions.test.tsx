import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';
import { FormActions } from '../form-actions';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

describe('FormActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the submit label, shows a spinner, and disables while submitting', () => {
    render(<FormActions submitLabel="Save changes" submitting />);
    const submit = screen.getByRole('button', { name: /Save changes/i }) as HTMLButtonElement;
    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(submit.disabled).toBe(true);
    expect(document.querySelector('.MuiCircularProgress-root')).toBeTruthy();
  });

  it('renders the submit button with the error colour when destructive', () => {
    render(<FormActions submitLabel="Delete" destructive />);
    const submit = screen.getByRole('button', { name: 'Delete' });
    expect(submit.className).toMatch(/Error/);
  });

  it('renders the primary colour and no spinner by default', () => {
    render(<FormActions submitLabel="Save" />);
    const submit = screen.getByRole('button', { name: 'Save' });
    expect(submit.className).not.toMatch(/Error/);
    expect(document.querySelector('.MuiCircularProgress-root')).toBeNull();
  });

  it('fires onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<FormActions submitLabel="Save" onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('lands formId on the submit button form attribute', () => {
    render(<FormActions submitLabel="Save" formId="my-form" />);
    const submit = screen.getByRole('button', { name: 'Save' });
    expect(submit.getAttribute('form')).toBe('my-form');
  });

  it('renders a secondary action', () => {
    render(<FormActions submitLabel="Save" secondaryAction={<button type="button">Save draft</button>} />);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy();
  });
});
