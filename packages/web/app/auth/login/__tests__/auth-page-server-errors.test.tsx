/**
 * Server-error paths for the standalone login page: auth failures and thrown
 * signIn calls (network down) must surface in the form-level alert, and a
 * stale error must not resurface after a tab round-trip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  useSession: () => ({ status: 'unauthenticated', data: null }),
}));

const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/app/lib/i18n/use-locale-router', () => ({
  useLocaleRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathnameWithoutLocale: () => '/auth/login',
}));

vi.mock('@/app/components/auth/social-login-buttons', () => ({
  default: () => null,
}));

vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage: vi.fn() }),
}));

vi.mock('@/app/lib/analytics', () => ({
  track: vi.fn(),
  setPersonProperties: vi.fn(),
}));

const { default: AuthPageContent } = await import('../auth-page-content');

async function submitLogin() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'climber@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter22' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

describe('AuthPageContent — login server errors', () => {
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
    render(<AuthPageContent />);

    await submitLogin();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Invalid email or password/i);
  });

  it('shows the generic auth-failed alert when signIn throws (network down)', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('fetch failed'));
    render(<AuthPageContent />);

    await submitLogin();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Authentication failed/i);
    // The form must stay interactive — no frozen state.
    expect((screen.getByRole('button', { name: 'Login' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not resurface a stale login error after a tab round-trip', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('fetch failed'));
    render(<AuthPageContent />);

    await submitLogin();
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Login' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
