// Runtime shape guard for a persisted board snapshot ("offline board card").
//
// The offline picker replays `UserBoard`s that were written to MMKV at download
// time, possibly by an older build. `active-board-store.ts` already documents the
// hazard: JSON.parse succeeds on a stale shape, so the value is silently cast to a
// type it no longer matches. Here the stakes are higher — a card with a NaN
// `layoutId` or a missing `uuid` would reach `setActiveBoard` and board-presence.
//
// So every read goes through this guard and anything that fails is dropped
// silently: a shape change must degrade the picker (one fewer row), never crash it.
// Pure module — no MMKV, no React — so both the settings store and the row selector
// can use it.

import type { UserBoard } from '@boardsesh/shared-schema';

/**
 * The fields the offline picker actually depends on: identity (`uuid`), the scope
 * tuple used to match a download (`boardType`/`layoutId`/`sizeId`), and what the
 * carousel and `setActiveBoard` consume (`setIds`, `name`, `angle`). Optional
 * `UserBoard` fields are deliberately not checked — missing ones already read as
 * `undefined` everywhere.
 */
export function isOfflineBoardCard(value: unknown): value is UserBoard {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Partial<UserBoard>;
  return (
    typeof card.uuid === 'string' &&
    card.uuid.length > 0 &&
    typeof card.boardType === 'string' &&
    card.boardType.length > 0 &&
    Number.isInteger(card.layoutId) &&
    Number.isInteger(card.sizeId) &&
    typeof card.setIds === 'string' &&
    typeof card.name === 'string' &&
    typeof card.angle === 'number' &&
    Number.isFinite(card.angle)
  );
}

/** Every usable card in a persisted value, dropping junk and non-array values. */
export function readOfflineBoardCards(value: unknown): UserBoard[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isOfflineBoardCard);
}
