// Pure done-state derivation for the manage-console welcome checklist. Kept
// framework-free so the derivation is unit-testable without rendering. The card
// mounts these four steps at the top of the manage content; each deep-links to
// the matching tab and shows a done/undone state from data already on the page.

export type GymChecklistStepKey = 'kiosk' | 'branding' | 'boards' | 'members';

/** The manage-tab query param each checklist step deep-links to. */
export const CHECKLIST_STEP_TAB: Record<GymChecklistStepKey, 'kiosks' | 'branding' | 'boards' | 'members'> = {
  kiosk: 'kiosks',
  branding: 'branding',
  boards: 'boards',
  members: 'members',
};

/** The four steps in checklist order. */
export const GYM_CHECKLIST_STEP_ORDER: GymChecklistStepKey[] = ['kiosk', 'branding', 'boards', 'members'];

export type GymChecklistInput = {
  kioskCount: number;
  /** A logo or any brand colour counts as branding set. */
  hasBranding: boolean;
  boardCount: number;
  /** Members other than the owner (an owner-only gym has no crew yet). */
  nonOwnerMemberCount: number;
};

export type GymChecklistStep = {
  key: GymChecklistStepKey;
  done: boolean;
};

/** Derive the done/undone state of each checklist step from manage-page data. */
export function deriveGymChecklistSteps(input: GymChecklistInput): GymChecklistStep[] {
  const done: Record<GymChecklistStepKey, boolean> = {
    kiosk: input.kioskCount > 0,
    branding: input.hasBranding,
    boards: input.boardCount > 0,
    members: input.nonOwnerMemberCount > 0,
  };
  return GYM_CHECKLIST_STEP_ORDER.map((key) => ({ key, done: done[key] }));
}

/** How many steps are complete. */
export function completedChecklistCount(steps: GymChecklistStep[]): number {
  return steps.filter((step) => step.done).length;
}
