import type { Gym } from '@boardsesh/shared-schema';

/**
 * Contract every manage-gym tab body implements. The shell (manage-gym-content)
 * owns the Gym in state and passes it to each tab; a tab that mutates the gym
 * (branding, and later the kiosk editor) calls `onGymChange` so the shell and
 * sibling tabs see the update.
 *
 * PR I fills the kiosks and branding placeholders in place — same file path,
 * same props — so the shell never has to change.
 */
export type GymManageTabProps = {
  gym: Gym;
  onGymChange: (gym: Gym) => void;
};
