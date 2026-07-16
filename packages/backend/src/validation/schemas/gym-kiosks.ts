import { z } from 'zod';
import { KioskLayoutSchema } from '@boardsesh/kiosk';
import { UUIDSchema } from './primitives';

/**
 * Kiosk slug: lowercase alphanumeric with single hyphens between segments,
 * 3–60 chars. Tighter than the generic `SlugSchema` (1–200) because kiosk slugs
 * sit in a public URL (`/kiosk/{gym-slug}/{kiosk-slug}`) and are auto-derived
 * from the name, so a floor keeps derived slugs meaningful and a lower ceiling
 * keeps the URL readable.
 */
export const KioskSlugSchema = z
  .string()
  .min(3, 'Kiosk slug too short (min 3)')
  .max(60, 'Kiosk slug too long (max 60)')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Kiosk slug must be lowercase alphanumeric with hyphens');

/**
 * Create kiosk input. `slug` is optional — the resolver derives a unique one from
 * `name` when it's absent.
 */
export const CreateGymKioskInputSchema = z.object({
  gymUuid: UUIDSchema,
  name: z.string().min(1, 'Kiosk name cannot be empty').max(100, 'Kiosk name too long'),
  slug: KioskSlugSchema.optional(),
});

/**
 * Update kiosk input. Every field is optional; `layout`, when present, is
 * strict-validated against @boardsesh/kiosk's `KioskLayoutSchema` here so the
 * resolver receives (and persists) the schema-parsed output — the backend is the
 * layout schema authority, and `.parse()` strips unknown keys at every level.
 * The alive-and-gym-linked board checks stay in the resolver (they need the DB).
 */
export const UpdateGymKioskInputSchema = z.object({
  kioskUuid: UUIDSchema,
  name: z.string().min(1, 'Kiosk name cannot be empty').max(100, 'Kiosk name too long').optional(),
  slug: KioskSlugSchema.optional(),
  layout: KioskLayoutSchema.optional(),
});

/**
 * Public, unauthenticated kiosk check-in input. Nothing here is trusted beyond
 * the two UUIDs, which are matched against a live kiosk before any write. The
 * viewport marker is a coarse client hint, clamped to a sane pixel range so a
 * hostile TV can't stuff arbitrary values into the ephemeral record.
 */
export const KioskHeartbeatInputSchema = z.object({
  kioskUuid: UUIDSchema,
  gymUuid: UUIDSchema,
  viewportWidth: z.number().int().min(1).max(20000).optional(),
  viewportHeight: z.number().int().min(1).max(20000).optional(),
});
