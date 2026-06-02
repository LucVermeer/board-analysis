// The queue package (@boardsesh/queue) and shared-schema each define their own
// `Climb` type. They are structurally compatible at the fields these flows read
// (uuid, frames, difficulty, name, …), so converting between them is a runtime
// no-op. These helpers centralize that single type seam in one documented place
// instead of scattering `as unknown as` casts across the playlist / discover /
// climb screens. The `{ uuid: string }` bound keeps callers from accidentally
// passing a non-climb value through the seam.

import type { Climb as QueueClimb } from '@boardsesh/queue';
import type { Climb as SchemaClimb } from '@boardsesh/shared-schema';

export function toQueueClimb<T extends { uuid: string }>(climb: T): QueueClimb {
  return climb as unknown as QueueClimb;
}

export function toQueueClimbs<T extends { uuid: string }>(climbs: readonly T[]): QueueClimb[] {
  return climbs as unknown as QueueClimb[];
}

export function toSchemaClimb<T extends { uuid: string }>(climb: T): SchemaClimb {
  return climb as unknown as SchemaClimb;
}
