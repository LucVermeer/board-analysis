// Pure slug helpers shared by the manage-gym slug guard. Mirrors the backend
// SlugSchema format: lowercase alphanumeric segments joined by single hyphens
// (consecutive hyphens are rejected server-side too). Uniqueness is enforced
// server-side — updateGym surfaces a conflict message the slug guard shows
// verbatim, so there's no client-side availability check here.

// The backend SlugSchema allows up to 200 chars, but the gymBySlug LOOKUP guard
// rejects slugs over 120 — a longer slug would save fine and then never resolve.
// Cap client input at the lookup guard so every saved slug stays reachable.
export const GYM_SLUG_MAX_LENGTH = 120;

const GYM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalize raw text-field input to slug-legal characters as the user types. */
export function sanitizeSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, GYM_SLUG_MAX_LENGTH);
}

export type GymSlugError = 'empty' | 'invalid';

/** Returns which validation error a candidate slug has, or null when it's valid. */
export function gymSlugValidationError(slug: string): GymSlugError | null {
  const trimmed = slug.trim();
  if (trimmed.length === 0) {
    return 'empty';
  }
  if (trimmed.length > GYM_SLUG_MAX_LENGTH || !GYM_SLUG_PATTERN.test(trimmed)) {
    return 'invalid';
  }
  return null;
}

/**
 * True when a route param is a gym UUID rather than a slug. The manage page
 * resolves slug-less (legacy) gyms by UUID so its slug guard is reachable; the
 * two never collide because generated slugs are word-based, never UUID-shaped.
 */
export function looksLikeGymUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
