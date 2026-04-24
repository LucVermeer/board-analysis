import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { FeedbackPromptBanner } from '../feedback-prompt-banner';
import { useSubmitAppFeedback } from '@/app/hooks/use-submit-app-feedback';
import { isNativeApp } from '@/app/lib/ble/capacitor-utils';
import { requestInAppReview } from '@/app/lib/in-app-review';
import { tFromCatalog } from '@/app/__test-helpers__/i18n-mock';

vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: 'en-US' },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

// vi.hoisted so the inner vi.mock factory below can capture `showMessage` —
// vi.mock calls are auto-hoisted to the top of the file by the Vitest plugin,
// which would otherwise make a bare top-level `const showMessage = vi.fn()`
// undefined at the moment the factory runs.
const { showMessage } = vi.hoisted(() => ({ showMessage: vi.fn() }));

// The banner's body pulls in the submit hook, the snackbar provider, the
// IndexedDB-backed feedback-prompt-db, the in-app-review helper, and the
// Capacitor native-platform check. Mock them all so these tests focus on the
// submit-path callback contract (the behaviour this PR is actually fixing).
vi.mock('@/app/hooks/use-submit-app-feedback', () => ({
  useSubmitAppFeedback: vi.fn(),
}));
vi.mock('@/app/components/providers/snackbar-provider', () => ({
  useSnackbar: () => ({ showMessage }),
}));
vi.mock('@/app/lib/feedback-prompt-db', () => ({
  shouldShowPrompt: vi.fn().mockResolvedValue(false),
  setFeedbackStatus: vi.fn().mockResolvedValue(undefined),
  FEEDBACK_PROMPT_EVENT: 'boardsesh:show-feedback-prompt',
}));
vi.mock('@/app/lib/ble/capacitor-utils', () => ({
  isNativeApp: vi.fn().mockReturnValue(false),
}));
vi.mock('@/app/lib/in-app-review', () => ({
  requestInAppReview: vi.fn().mockResolvedValue(undefined),
}));

type MutateAsync = (payload: unknown) => Promise<boolean>;

const mockedUseSubmitAppFeedback = vi.mocked(useSubmitAppFeedback);
const mockedIsNativeApp = vi.mocked(isNativeApp);
const mockedRequestInAppReview = vi.mocked(requestInAppReview);

function setupMutate(behavior: 'success' | 'error') {
  const mutateAsync: MutateAsync = vi.fn(() =>
    behavior === 'success' ? Promise.resolve(true) : Promise.reject(new Error('simulated failure')),
  );
  mockedUseSubmitAppFeedback.mockReturnValue({ mutateAsync } as never);
  return mutateAsync;
}

function renderAndOpenBanner() {
  render(<FeedbackPromptBanner />);
  // The banner mounts closed (shouldShowPrompt is mocked false). Open it via
  // the same public event the rest of the app uses to trigger it.
  act(() => {
    window.dispatchEvent(new CustomEvent('boardsesh:show-feedback-prompt'));
  });
}

function pickStars(n: number) {
  fireEvent.click(screen.getByRole('option', { name: `${n} star${n > 1 ? 's' : ''}` }));
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
  });
}

describe('FeedbackPromptBanner — submit-path callbacks', () => {
  beforeEach(() => {
    mockedUseSubmitAppFeedback.mockReset();
    mockedIsNativeApp.mockReset().mockReturnValue(false);
    mockedRequestInAppReview.mockReset().mockResolvedValue(undefined);
    showMessage.mockClear();
  });

  it('shows "Thanks — logged" on successful submission, even after the banner has unmounted', async () => {
    const mutateAsync = setupMutate('success');
    renderAndOpenBanner();

    pickStars(5);
    await clickSave();

    await waitFor(() => expect(showMessage).toHaveBeenCalledWith('Thanks — logged.', 'success'));
    expect(mutateAsync).toHaveBeenCalledWith({ rating: 5, comment: null, source: 'prompt' });
  });

  it('shows "Couldn\'t send" warning snackbar when the mutation fails', async () => {
    setupMutate('error');
    renderAndOpenBanner();

    pickStars(5);
    await clickSave();

    await waitFor(() => expect(showMessage).toHaveBeenCalledWith("Couldn't send — we'll keep your rating.", 'warning'));
  });

  it('triggers the native review sheet when rating is ≥ 3 on a native build', async () => {
    setupMutate('success');
    mockedIsNativeApp.mockReturnValue(true);
    renderAndOpenBanner();

    pickStars(4);
    await clickSave();

    expect(mockedRequestInAppReview).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger the native review sheet on the low-rating path', async () => {
    setupMutate('success');
    mockedIsNativeApp.mockReturnValue(true);
    renderAndOpenBanner();

    // 2 stars → banner transitions to the comment view; the Send button submits.
    pickStars(2);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    });

    expect(mockedRequestInAppReview).not.toHaveBeenCalled();
  });
});
