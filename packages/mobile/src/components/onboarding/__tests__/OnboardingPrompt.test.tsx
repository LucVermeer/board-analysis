// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

// The analytics wrappers are the seam under test — assert the component drives
// them; the wrappers' own payloads are covered in onboarding-analytics.test.ts.
const analyticsMock = vi.hoisted(() => ({
  trackTourStarted: vi.fn(),
  trackStepViewed: vi.fn(),
  trackTourCompleted: vi.fn(),
  trackTourSkipped: vi.fn(),
  trackTourDismissed: vi.fn(),
}));
vi.mock('../../../lib/onboarding/onboarding-analytics', () => analyticsMock);

// Minimal RN surface: View → div, StyleSheet passthrough.
vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Platform: { select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Button stub: a <button> carrying its title + onPress so either CTA is clickable.
vi.mock('../../Button', () => ({
  Button: ({ title, onPress }: { title: string; onPress?: () => void }) =>
    createElement('button', { onClick: onPress }, title),
}));

vi.mock('../../GlassSurface', () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
}));

vi.mock('../OnboardingCard', () => ({ OnboardingCard: () => null }));

vi.mock('../../../lib/onboarding/use-onboarding-copy', () => ({
  useOnboardingCopy: () => ({
    title: 'Title',
    body: 'Body',
    footnote: 'Footnote',
    findBoard: 'Find a board',
    lookAround: 'Look around',
  }),
}));

vi.mock('../../../lib/haptics', () => ({ hapticSelection: vi.fn() }));

vi.mock('../../../providers/theme-provider', () => ({
  useTheme: () => ({ variant: 'liquidGlass' }),
}));

vi.mock('../../../theme/variants', () => ({
  selectByVariant: (_variant: string, options: { material: unknown; liquidGlass: unknown }) => options.liquidGlass,
}));

import { OnboardingPrompt } from '../OnboardingPrompt';

function renderPrompt() {
  return render(
    <OnboardingPrompt
      accentColor="#000"
      iconColor="#000"
      bodyColor="#000"
      backgroundColor="#fff"
      onFindBoard={() => {}}
      onLookAround={() => {}}
    />,
  );
}

describe('OnboardingPrompt telemetry', () => {
  beforeEach(() => {
    for (const fn of Object.values(analyticsMock)) fn.mockClear();
  });

  it('fires Started + one Step Viewed on mount', () => {
    renderPrompt();
    expect(analyticsMock.trackTourStarted).toHaveBeenCalledTimes(1);
    expect(analyticsMock.trackStepViewed).toHaveBeenCalledTimes(1);
  });

  it('fires Dismissed when the prompt unmounts with no button chosen (the back exit)', () => {
    const { unmount } = renderPrompt();
    expect(analyticsMock.trackTourDismissed).not.toHaveBeenCalled();
    unmount();
    expect(analyticsMock.trackTourDismissed).toHaveBeenCalledTimes(1);
    expect(analyticsMock.trackTourCompleted).not.toHaveBeenCalled();
    expect(analyticsMock.trackTourSkipped).not.toHaveBeenCalled();
  });

  it('does not fire Dismissed when the primary CTA resolved the prompt', () => {
    const { getByText, unmount } = renderPrompt();
    fireEvent.click(getByText('Find a board'));
    unmount();
    expect(analyticsMock.trackTourCompleted).toHaveBeenCalledTimes(1);
    expect(analyticsMock.trackTourDismissed).not.toHaveBeenCalled();
  });

  it('does not fire Dismissed when the look-around exit resolved the prompt', () => {
    const { getByText, unmount } = renderPrompt();
    fireEvent.click(getByText('Look around'));
    unmount();
    expect(analyticsMock.trackTourSkipped).toHaveBeenCalledTimes(1);
    expect(analyticsMock.trackTourDismissed).not.toHaveBeenCalled();
  });
});
