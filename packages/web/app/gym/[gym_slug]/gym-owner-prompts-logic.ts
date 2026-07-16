// Pure selection of which owner-facing setup prompts the public gym page shows.
// Framework-free so the gating matrix (canEdit × content present/absent) is
// unit-testable without rendering. Each prompt maps to a missing piece of the
// gym's public page and deep-links into the matching manage-console tab.

export type OwnerPromptKey = 'boards' | 'kiosk' | 'branding';

/** Which manage-console tab each owner prompt deep-links to. */
export const OWNER_PROMPT_TAB: Record<OwnerPromptKey, 'boards' | 'kiosks' | 'branding'> = {
  boards: 'boards',
  kiosk: 'kiosks',
  branding: 'branding',
};

export type OwnerPromptsInput = {
  /** Only editors get setup prompts — a non-owner viewer sees none. */
  canEdit: boolean;
  /** At least one board is linked to the gym. */
  hasBoards: boolean;
  /** A default kiosk exists for the gym. */
  hasKiosk: boolean;
  /** A logo or any brand colour is set. */
  hasBranding: boolean;
};

/**
 * The prompts to show, in display order: link boards, put a wall on a TV, add
 * branding. A prompt appears only when its content is missing; a non-editor
 * gets none.
 */
export function ownerPromptsToShow(input: OwnerPromptsInput): OwnerPromptKey[] {
  if (!input.canEdit) {
    return [];
  }
  const prompts: OwnerPromptKey[] = [];
  if (!input.hasBoards) prompts.push('boards');
  if (!input.hasKiosk) prompts.push('kiosk');
  if (!input.hasBranding) prompts.push('branding');
  return prompts;
}
