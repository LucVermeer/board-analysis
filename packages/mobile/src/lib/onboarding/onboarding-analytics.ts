// Thin wrappers around the shared onboarding-tour events so the carousel
// component stays free of property-key bookkeeping. Property names mirror web's
// onboarding-tour-provider exactly (stepId/stepIndex, fromStepId/toStepId/
// trigger, durationSeconds, atStepId) so both platforms feed one PostHog funnel.

import { SHARED_EVENTS } from '@boardsesh/analytics';
import { track } from '../analytics';
import { ONBOARDING_TOTAL_STEPS, type OnboardingCard } from './onboarding-cards';

// The mobile tour is now a single framing screen: Started + one Step Viewed on
// mount, then exactly one terminal outcome — Completed (primary CTA), Skipped
// (the "look around" tap), or Dismissed (back / nav-away without choosing).
// There's no multi-step advance, so `trackStepAdvanced` was removed.

export function trackTourStarted(): void {
  // The mobile tour always starts fresh on a first run (no resume / restart
  // semantics), and the only entry points are the first-run gate and the
  // More-tab replay row. Keep the web property shape, filled for mobile.
  track(SHARED_EVENTS.OnboardingTourStarted, {
    resumed: false,
    restartedFrom: '',
    source: 'mobile-first-run',
  });
}

export function trackStepViewed(card: OnboardingCard, stepIndex: number): void {
  track(SHARED_EVENTS.OnboardingTourStepViewed, {
    stepId: card.id,
    stepIndex,
    totalSteps: ONBOARDING_TOTAL_STEPS,
  });
}

export function trackTourCompleted(durationSeconds: number): void {
  track(SHARED_EVENTS.OnboardingTourCompleted, { durationSeconds });
}

export function trackTourSkipped(card: OnboardingCard, stepIndex: number): void {
  track(SHARED_EVENTS.OnboardingTourSkipped, {
    atStepId: card.id,
    stepIndex,
    // The intentional secondary-CTA exit ("look around"), tagged so it can't be
    // read as abandonment. Involuntary exits fire Dismissed instead.
    exitReason: 'look-around',
  });
}

// Fired when the prompt unmounts without the user choosing either button — an
// Android hardware-back or a programmatic nav-away. Without this, ~a third of
// first-run Starts resolved to no terminal outcome at all, deflating Completed.
// `exitReason: 'unresolved'` stays mechanism-neutral: the guard can't tell a
// hardware-back from a programmatic unmount, so it claims neither.
export function trackTourDismissed(card: OnboardingCard, stepIndex: number): void {
  track(SHARED_EVENTS.OnboardingTourDismissed, {
    atStepId: card.id,
    stepIndex,
    exitReason: 'unresolved',
  });
}
