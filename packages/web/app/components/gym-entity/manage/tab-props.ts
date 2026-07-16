import type { Gym } from '@boardsesh/shared-schema';

/**
 * Contract every manage-gym tab body implements. The shell (manage-gym-content)
 * owns the Gym in state and passes it to each tab; a tab that mutates the gym
 * (branding, kiosk editor) calls `onGymChange` so the shell and sibling tabs
 * see the update.
 *
 * `onDirtyChange` lets a tab with unsaved edits (branding colours, an open
 * kiosk editor) tell the shell, which then routes tab switches and the
 * "Back to gym" link through a discard confirmation instead of silently
 * unmounting the edits. Tabs MUST report `false` on unmount/clean-up so a
 * confirmed navigation doesn't leave a stale dirty flag behind.
 */
export type GymManageTabProps = {
  gym: Gym;
  onGymChange: (gym: Gym) => void;
  onDirtyChange?: (isDirty: boolean) => void;
};
