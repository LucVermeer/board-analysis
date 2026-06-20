// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the auth provider so the hook gets controllable sign-in functions without
// pulling in the provider's native dependency chain. The `type OAuthSignInResult`
// the hook imports from ../lib/auth is erased at compile time, so no native module
// is loaded here.
const signInWithAppleMock = vi.fn();
const signInWithGoogleMock = vi.fn();
const signInWithGoogleWebMock = vi.fn();
vi.mock('../../providers/auth-provider', () => ({
  useAuth: () => ({
    signInWithApple: signInWithAppleMock,
    signInWithGoogle: signInWithGoogleMock,
    signInWithGoogleWeb: signInWithGoogleWebMock,
  }),
}));

const trackMock = vi.fn();
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }));

const reportErrorMock = vi.fn();
vi.mock('../../lib/error-reporting', () => ({ reportError: (...args: unknown[]) => reportErrorMock(...args) }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The hook reads Platform.OS to gate the Google web fallback to iOS. A mutable
// hoisted ref lets each test flip the platform (default iOS, where the fallback
// lives); the real react-native module is too heavy to load under jsdom.
const { platform } = vi.hoisted(() => ({ platform: { OS: 'ios' } as { OS: string } }));
vi.mock('react-native', () => ({ Platform: platform }));

const { useNativeOAuthSignIn } = await import('../use-native-oauth-sign-in');

type TrackedEvent = { event: unknown; flow: unknown; reason: unknown };
function trackedEvents(): TrackedEvent[] {
  return trackMock.mock.calls.map(([event, props]) => ({
    event,
    flow: (props as { flow?: unknown })?.flow,
    reason: (props as { failure_reason?: unknown })?.failure_reason,
  }));
}

async function runSignIn(provider: 'google' | 'apple', setError = vi.fn()) {
  const { result } = renderHook(() => useNativeOAuthSignIn({ setError }));
  await act(async () => {
    await result.current.signIn(provider);
  });
  return setError;
}

describe('useNativeOAuthSignIn — Google web fallback (iOS)', () => {
  beforeEach(() => {
    platform.OS = 'ios';
    trackMock.mockReset();
    reportErrorMock.mockReset();
    signInWithAppleMock.mockReset();
    signInWithGoogleMock.mockReset();
    signInWithGoogleWebMock.mockReset();
  });

  it('falls back to the web flow when native Google throws ("Unable to open Safari") and signs in', async () => {
    signInWithGoogleMock.mockRejectedValue(Object.assign(new Error('Unable to open Safari'), { code: -1 }));
    signInWithGoogleWebMock.mockResolvedValue({ success: true });

    const setError = await runSignIn('google');

    expect(signInWithGoogleWebMock).toHaveBeenCalledTimes(1);
    // The handled native failure no longer reaches error tracking — the fallback owns it.
    expect(reportErrorMock).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(null);
    const events = trackedEvents();
    expect(events).toContainEqual({ event: 'Login Attempted', flow: 'web_fallback', reason: undefined });
    expect(events).toContainEqual({ event: 'Login Succeeded', flow: 'web_fallback', reason: undefined });
  });

  it('falls back when native Google returns a non-cancel failure', async () => {
    signInWithGoogleMock.mockResolvedValue({ success: false, status: 401, error: 'invalid' });
    signInWithGoogleWebMock.mockResolvedValue({ success: true });

    await runSignIn('google');

    expect(signInWithGoogleWebMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall back when the user cancels native Google', async () => {
    signInWithGoogleMock.mockResolvedValue({ success: false, cancelled: true });

    await runSignIn('google');

    expect(signInWithGoogleWebMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('surfaces an error and reports once when the web fallback also fails', async () => {
    signInWithGoogleMock.mockRejectedValue(new Error('Unable to open Safari'));
    signInWithGoogleWebMock.mockResolvedValue({
      success: false,
      status: 401,
      error: 'Invalid or expired transfer token',
    });

    const setError = await runSignIn('google');

    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenLastCalledWith('nativeStart.oauthError');
    expect(trackedEvents()).toContainEqual({
      event: 'Login Failed',
      flow: 'web_fallback',
      reason: 'invalid_oauth_token',
    });
  });

  it('does not fall back for Apple failures (Apple is unaffected)', async () => {
    signInWithAppleMock.mockRejectedValue(new Error('boom'));

    await runSignIn('apple');

    expect(signInWithGoogleWebMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });
});

describe('useNativeOAuthSignIn — Android has no web fallback', () => {
  beforeEach(() => {
    platform.OS = 'android';
    trackMock.mockReset();
    reportErrorMock.mockReset();
    signInWithAppleMock.mockReset();
    signInWithGoogleMock.mockReset();
    signInWithGoogleWebMock.mockReset();
  });

  it('surfaces the native error (no fallback) when Google throws — the SHA-1/DEVELOPER_ERROR case', async () => {
    signInWithGoogleMock.mockRejectedValue(Object.assign(new Error('developer error'), { code: 'DEVELOPER_ERROR' }));

    const setError = await runSignIn('google');

    expect(signInWithGoogleWebMock).not.toHaveBeenCalled();
    // Reported once, tagged with the native code so PostHog records DEVELOPER_ERROR.
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ provider: 'google', flow: 'native', native_error_code: 'DEVELOPER_ERROR' }),
      }),
    );
    expect(setError).toHaveBeenLastCalledWith('nativeStart.oauthError');
  });

  it('surfaces the native error (no fallback) when Google returns a non-cancel failure', async () => {
    signInWithGoogleMock.mockResolvedValue({ success: false, status: 401, error: 'invalid' });

    const setError = await runSignIn('google');

    expect(signInWithGoogleWebMock).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenLastCalledWith('nativeStart.oauthError');
  });

  it('does NOT fall back or error when the user cancels native Google', async () => {
    signInWithGoogleMock.mockResolvedValue({ success: false, cancelled: true });

    await runSignIn('google');

    expect(signInWithGoogleWebMock).not.toHaveBeenCalled();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });
});
