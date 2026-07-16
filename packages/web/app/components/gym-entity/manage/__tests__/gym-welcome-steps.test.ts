import { describe, expect, it } from 'vite-plus/test';
import {
  deriveGymChecklistSteps,
  completedChecklistCount,
  GYM_CHECKLIST_STEP_ORDER,
  CHECKLIST_STEP_TAB,
} from '../gym-welcome-steps';

describe('deriveGymChecklistSteps', () => {
  it('marks every step undone for a brand-new gym', () => {
    const steps = deriveGymChecklistSteps({
      kioskCount: 0,
      hasBranding: false,
      boardCount: 0,
      nonOwnerMemberCount: 0,
    });
    expect(steps.map((step) => step.key)).toEqual(GYM_CHECKLIST_STEP_ORDER);
    expect(steps.every((step) => !step.done)).toBe(true);
    expect(completedChecklistCount(steps)).toBe(0);
  });

  it('marks each step done from its own data source', () => {
    const steps = deriveGymChecklistSteps({
      kioskCount: 2,
      hasBranding: true,
      boardCount: 3,
      nonOwnerMemberCount: 1,
    });
    expect(steps.every((step) => step.done)).toBe(true);
    expect(completedChecklistCount(steps)).toBe(4);
  });

  it('treats a positive count as done and zero as undone, per step', () => {
    const steps = deriveGymChecklistSteps({
      kioskCount: 1,
      hasBranding: false,
      boardCount: 0,
      nonOwnerMemberCount: 5,
    });
    const byKey = Object.fromEntries(steps.map((step) => [step.key, step.done]));
    expect(byKey.kiosk).toBe(true);
    expect(byKey.branding).toBe(false);
    expect(byKey.boards).toBe(false);
    expect(byKey.members).toBe(true);
  });

  it('an owner-only gym (no non-owner members) leaves the crew step undone', () => {
    const steps = deriveGymChecklistSteps({
      kioskCount: 0,
      hasBranding: false,
      boardCount: 0,
      nonOwnerMemberCount: 0,
    });
    expect(steps.find((step) => step.key === 'members')?.done).toBe(false);
  });

  it('maps each step to its manage-console tab', () => {
    expect(CHECKLIST_STEP_TAB).toEqual({
      kiosk: 'kiosks',
      branding: 'branding',
      boards: 'boards',
      members: 'members',
    });
  });
});
