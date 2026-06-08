// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const pushMock = vi.hoisted(() => vi.fn());
const segmentsCtrl = vi.hoisted(() => ({ segments: ['(tabs)', 'climbs'] as string[] }));
const hasSeenMock = vi.hoisted(() => vi.fn());
const getInitialURLMock = vi.hoisted(() => vi.fn());

vi.mock('expo-router', () => ({
  router: { push: pushMock },
  useSegments: () => segmentsCtrl.segments,
}));
vi.mock('expo-linking', () => ({
  getInitialURL: getInitialURLMock,
}));
vi.mock('../../../lib/onboarding/onboarding-storage', () => ({
  hasSeenOnboarding: hasSeenMock,
}));

import { OnboardingGate } from '../OnboardingGate';

describe('OnboardingGate', () => {
  beforeEach(() => {
    pushMock.mockClear();
    hasSeenMock.mockReset();
    getInitialURLMock.mockReset();
    // Default: a plain launch (no cold-start deep link).
    getInitialURLMock.mockResolvedValue(null);
    segmentsCtrl.segments = ['(tabs)', 'climbs'];
  });

  it('does nothing until the app is ready', async () => {
    hasSeenMock.mockResolvedValue(false);
    render(<OnboardingGate ready={false} />);
    await Promise.resolve();
    expect(hasSeenMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('pushes the onboarding route on a fresh, ready, non-deep-link launch', async () => {
    hasSeenMock.mockResolvedValue(false);
    render(<OnboardingGate ready />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding'));
  });

  it('does not re-show the tour once it has been seen', async () => {
    hasSeenMock.mockResolvedValue(true);
    render(<OnboardingGate ready />);
    await waitFor(() => expect(hasSeenMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not interrupt a join deep-link landing', async () => {
    hasSeenMock.mockResolvedValue(false);
    segmentsCtrl.segments = ['join', '[sessionId]'];
    render(<OnboardingGate ready />);
    await Promise.resolve();
    await Promise.resolve();
    // Short-circuits before reading the flag — the deep-link destination wins.
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not interrupt the auth flow', async () => {
    hasSeenMock.mockResolvedValue(false);
    segmentsCtrl.segments = ['auth', 'login'];
    render(<OnboardingGate ready />);
    await Promise.resolve();
    await Promise.resolve();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not cover a cold-start deep link that lands ON a tab', async () => {
    // The custom-scheme link resolved into the Climbs tab, so the segment guard
    // sees a normal '(tabs)' landing and wouldn't catch it — the launch URL is
    // what tells us the user arrived via an intentional deep link.
    hasSeenMock.mockResolvedValue(false);
    segmentsCtrl.segments = ['(tabs)', 'climbs'];
    getInitialURLMock.mockResolvedValue('com.boardsesh.app://climbs/kilter');
    render(<OnboardingGate ready />);
    await waitFor(() => expect(getInitialURLMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not read the seen flag when launched via a deep link', async () => {
    hasSeenMock.mockResolvedValue(false);
    getInitialURLMock.mockResolvedValue('com.boardsesh.app://climbs/tension');
    render(<OnboardingGate ready />);
    await waitFor(() => expect(getInitialURLMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(hasSeenMock).not.toHaveBeenCalled();
  });

  it('still shows once on a normal launch with no deep link', async () => {
    hasSeenMock.mockResolvedValue(false);
    getInitialURLMock.mockResolvedValue(null);
    render(<OnboardingGate ready />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding'));
  });

  it('treats a launch-URL read error as a normal launch (shows the tour)', async () => {
    hasSeenMock.mockResolvedValue(false);
    getInitialURLMock.mockRejectedValue(new Error('linking unavailable'));
    render(<OnboardingGate ready />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding'));
  });
});
