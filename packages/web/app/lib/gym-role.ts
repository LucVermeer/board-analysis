import type { Gym } from '@boardsesh/shared-schema';

/**
 * The viewer's standing at a gym, in precedence order. `owner` outranks any
 * `myRole` (owners are reported as gym admins by the backend), so the owner
 * check comes first.
 */
export type GymRoleKind = 'owner' | 'admin' | 'editor' | 'member';

/**
 * Resolve the viewer's standing at a gym. Returns null for a gym the viewer
 * only follows. Shared by the My Gyms drawer, the homepage gym card, and the
 * manage console header so they all surface the same role.
 *
 * `myGyms` unions owned + gym_members, so admin/editor/member rows arrive with
 * their `myRole` populated and resolve to the matching standing here.
 */
export function resolveGymRole(gym: Gym, currentUserId: string | null): GymRoleKind | null {
  if (currentUserId && gym.ownerId === currentUserId) return 'owner';
  if (gym.myRole === 'admin') return 'admin';
  if (gym.myRole === 'editor') return 'editor';
  if (gym.myRole === 'member') return 'member';
  return null;
}
