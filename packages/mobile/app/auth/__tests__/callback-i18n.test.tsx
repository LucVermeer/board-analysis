// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Repro for A11-auth-onboarding-004: the OAuth callback screen rendered
// hardcoded English ('Signing in...', 'Sign in failed: ...', 'No transfer
// token received'). With `t` returning the key, a localized render must show
// the catalog key rather than any English literal — so an es/fr user never
// sees raw English at the most failure-prone step of the OAuth round-trip.

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const params = vi.hoisted(() => ({ transferToken: undefined as string | undefined }));

vi.mock('../../../src/lib/analytics', () => ({ track: analytics.track }));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
  ActivityIndicator: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ transferToken: params.transferToken }),
  useRouter: () => router,
}));

// `t` echoes the key, so any English literal left in the component would show
// up verbatim and fail the assertions below.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock('../../../src/lib/auth', () => ({
  exchangeTransferToken: vi.fn(async () => ({ success: false, error: 'Invalid or expired transfer token' })),
}));
vi.mock('../../../src/lib/native-auth-analytics', () => ({ classifyNativeAuthFailureReason: () => 'invalid_token' }));
vi.mock('../../../src/providers/auth-provider', () => ({
  useAuth: () => ({ refreshAuthState: vi.fn(async () => {}) }),
}));
vi.mock('../../../src/providers/theme-provider', () => ({ useTheme: () => ({ brandColors: { error: '#FF3B30' } }) }));

import AuthCallback from '../callback';

beforeEach(() => {
  analytics.track.mockClear();
  router.replace.mockClear();
  params.transferToken = undefined;
});

describe('AuthCallback localization', () => {
  it('renders the translated spinner label while exchanging the token', () => {
    params.transferToken = 'tok-123';
    const { container } = render(createElement(AuthCallback));
    // Translated key, not the old hardcoded 'Signing in...'.
    expect(container.textContent).toContain('nativeStart.signingIn');
    expect(container.textContent).not.toContain('Signing in');
  });

  it('renders a translated failure message when no transfer token arrives', async () => {
    params.transferToken = undefined;
    const { container } = render(createElement(AuthCallback));
    await waitFor(() => expect(container.textContent).toContain('callback.noTransferToken'));
    // The old screen prefixed every error with hardcoded 'Sign in failed:'.
    expect(container.textContent).not.toContain('Sign in failed');
    expect(container.textContent).not.toContain('No transfer token received');
  });

  it('renders a translated generic message instead of raw server error text', async () => {
    params.transferToken = 'tok-expired';
    const { container } = render(createElement(AuthCallback));
    await waitFor(() => expect(container.textContent).toContain('callback.failed'));
    // The raw English/server string must never reach the user.
    expect(container.textContent).not.toContain('Invalid or expired transfer token');
  });
});
