/**
 * Server-error paths for the modal login form: auth failures and thrown
 * signIn calls (network down) must surface in the form-level alert — a
 * swallowed catch previously left the form frozen with no feedback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockSignIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock('../social-login-buttons', () => ({
  default: () => null,
}));

const mockShowMessage = vi.fn();
vi.mock('../../providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

const { default: AuthModal } = await import('../auth-modal');

async function submitLogin() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'climber@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter22' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

describe('AuthModal — login server errors', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // The network-failure path console.errors by design.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('shows the invalid-credentials alert when signIn reports an auth error', async () => {
    mockSignIn.mockResolvedValueOnce({ error: 'CredentialsSignin', ok: false });
    const onClose = vi.fn();
    render(<AuthModal open onClose={onClose} />);

    await submitLogin();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Invalid email or password/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the generic auth-failed alert when signIn throws (network down)', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('fetch failed'));
    const onClose = vi.fn();
    render(<AuthModal open onClose={onClose} />);

    await submitLogin();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Authentication failed/i);
    // The form must stay open and interactive — no frozen state.
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Login' }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('clears the alert on a successful retry', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce({ ok: true, error: null });
    const onClose = vi.fn();
    render(<AuthModal open onClose={onClose} />);

    await submitLogin();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
