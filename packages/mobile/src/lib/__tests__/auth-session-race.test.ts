import { describe, expect, it, vi } from 'vitest';
import { raceBrowserSignIn, type AuthSessionRaceIo } from '../auth-session-race';

const CALLBACK_PREFIX = 'com.boardsesh.app://auth/callback';
const AUTH_URL = 'https://www.boardsesh.com/auth/native-start?provider=apple';

// Harness exposing the registered URL listener and a controllable browser
// promise, so each test can fire the deep link / close the browser in any order.
function createIoHarness() {
  let urlListener: ((event: { url: string }) => void) | null = null;
  let resolveBrowser: (() => void) | null = null;
  let rejectBrowser: ((reason: unknown) => void) | null = null;

  const removeListener = vi.fn(() => {
    urlListener = null;
  });
  const dismissBrowser = vi.fn(() => Promise.resolve());
  const io: AuthSessionRaceIo = {
    addUrlListener: (listener) => {
      urlListener = listener;
      return { remove: removeListener };
    },
    openBrowser: () =>
      new Promise<void>((resolve, reject) => {
        resolveBrowser = resolve;
        rejectBrowser = reject;
      }),
    dismissBrowser,
  };

  return {
    io,
    removeListener,
    dismissBrowser,
    fireDeepLink: (url: string) => urlListener?.({ url }),
    closeBrowser: () => resolveBrowser?.(),
    failBrowser: (reason: unknown) => rejectBrowser?.(reason),
  };
}

describe('raceBrowserSignIn', () => {
  it('resolves success with the callback URL and dismisses the browser when the deep link arrives', async () => {
    const harness = createIoHarness();
    const racePromise = raceBrowserSignIn(harness.io, AUTH_URL, CALLBACK_PREFIX);

    const callbackUrl = `${CALLBACK_PREFIX}?transferToken=tok-1`;
    harness.fireDeepLink(callbackUrl);

    await expect(racePromise).resolves.toEqual({ type: 'success', url: callbackUrl });
    expect(harness.dismissBrowser).toHaveBeenCalledTimes(1);
    expect(harness.removeListener).toHaveBeenCalledTimes(1);
  });

  it('ignores deep links that are not the auth callback', async () => {
    const harness = createIoHarness();
    const racePromise = raceBrowserSignIn(harness.io, AUTH_URL, CALLBACK_PREFIX);

    harness.fireDeepLink('com.boardsesh.app://join/some-session');
    harness.fireDeepLink(`${CALLBACK_PREFIX}?transferToken=tok-2`);

    await expect(racePromise).resolves.toEqual({
      type: 'success',
      url: `${CALLBACK_PREFIX}?transferToken=tok-2`,
    });
  });

  it('resolves cancel when the browser closes without a callback deep link', async () => {
    const harness = createIoHarness();
    const racePromise = raceBrowserSignIn(harness.io, AUTH_URL, CALLBACK_PREFIX);

    harness.closeBrowser();

    await expect(racePromise).resolves.toEqual({ type: 'cancel' });
    expect(harness.dismissBrowser).not.toHaveBeenCalled();
    expect(harness.removeListener).toHaveBeenCalledTimes(1);
  });

  it('keeps the success result when the dismissed browser later resolves', async () => {
    const harness = createIoHarness();
    const racePromise = raceBrowserSignIn(harness.io, AUTH_URL, CALLBACK_PREFIX);

    harness.fireDeepLink(`${CALLBACK_PREFIX}?transferToken=tok-3`);
    // dismissBrowser() closing the browser resolves openBrowser afterwards.
    harness.closeBrowser();
    await Promise.resolve();

    await expect(racePromise).resolves.toEqual({
      type: 'success',
      url: `${CALLBACK_PREFIX}?transferToken=tok-3`,
    });
    // Promise resolve() is idempotent, so the value alone can't prove the
    // double-settle guard held — the listener teardown running once can.
    expect(harness.removeListener).toHaveBeenCalledTimes(1);
  });

  it('settles error and removes the listener when openBrowser throws synchronously', async () => {
    const harness = createIoHarness();
    const throwingIo: AuthSessionRaceIo = {
      ...harness.io,
      openBrowser: () => {
        throw new Error('no browser available');
      },
    };

    await expect(raceBrowserSignIn(throwingIo, AUTH_URL, CALLBACK_PREFIX)).resolves.toEqual({
      type: 'error',
      message: 'no browser available',
    });
    expect(harness.removeListener).toHaveBeenCalledTimes(1);
  });

  it('resolves error with the message when the browser fails to open', async () => {
    const harness = createIoHarness();
    const racePromise = raceBrowserSignIn(harness.io, AUTH_URL, CALLBACK_PREFIX);

    harness.failBrowser(new Error('Another WebBrowser is already being presented.'));

    await expect(racePromise).resolves.toEqual({
      type: 'error',
      message: 'Another WebBrowser is already being presented.',
    });
    expect(harness.removeListener).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    const harness = createIoHarness();
    const racePromise = raceBrowserSignIn(harness.io, AUTH_URL, CALLBACK_PREFIX);

    harness.failBrowser('boom');

    await expect(racePromise).resolves.toEqual({ type: 'error', message: 'browser failed to open' });
  });
});
