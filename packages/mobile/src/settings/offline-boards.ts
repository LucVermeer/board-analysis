import { useMemo } from 'react';
import type { UserBoard } from '@boardsesh/shared-schema';
import { offlineBoardKey, offlineBoardKeyForBoard, type OfflineBoardScope } from '@boardsesh/offline-sync';
import { getSetting, setSetting, useSetting } from './hooks';
import { isOfflineBoardCard, readOfflineBoardCards } from '../lib/boards/offline-board-card';

/**
 * Remembered board identities for the offline picker.
 *
 * `syncEnabledBoards` records WHICH SCOPES are downloaded, and that is all it can
 * record: a scope key is `"boardType:layoutId:sizeId"`, which is shared by every one
 * of the user's boards on that layout+size ("Marco's garage" and "Gym wall" on the
 * same Kilter Original 12x12 share ONE download — see `storage-board-label.ts`). It
 * carries no `uuid`, `name`, `setIds` or `angle`, so it cannot name a board, and
 * `uuid` in particular is server-issued: `setActiveBoard`, `BoardProvider`, the BLE
 * wrapper and the board-presence subscription all key on it, so it can never be
 * synthesised.
 *
 * So the board list is snapshotted at the moment offline is enabled — data the app
 * already holds in hand — and kept as a flat list deduped by `uuid`, not a
 * scope-keyed map (a map would silently hide one of two boards sharing a scope).
 *
 * Reads go through `isOfflineBoardCard`, so a card written by an older build with a
 * shape `UserBoard` no longer matches is dropped rather than rendered wrong.
 */

const SETTING_KEY = 'offlineBoardsV1';

/**
 * Plenty of headroom: the realistic maximum is a handful of boards (a home wall,
 * a couple of gyms). The cap only exists so a long-lived install can't grow the
 * MMKV value without bound.
 */
const MAX_REMEMBERED_BOARDS = 20;

export function getOfflineBoards(): UserBoard[] {
  return readOfflineBoardCards(getSetting(SETTING_KEY));
}

/** Reactive read. Re-renders when boards are remembered or forgotten. */
export function useOfflineBoards(): UserBoard[] {
  const [stored] = useSetting(SETTING_KEY);
  // `useSetting`'s snapshot is reference-stable between writes, so this memo only
  // re-filters when the stored value actually changed.
  return useMemo(() => readOfflineBoardCards(stored), [stored]);
}

/**
 * Snapshot `boards` so the offline picker can name them. Upserts by `uuid`,
 * most-recent-first.
 *
 * Skips the write when the result is byte-identical to what is already stored:
 * every settings write calls `emitChange()`, which clears the whole per-key
 * snapshot cache and re-renders every `useSetting` consumer app-wide. This runs on
 * each successful `myBoards` fetch, so a no-op refresh must stay a no-op.
 *
 * The comparison is `JSON.stringify`, so it is key-order sensitive. That is the safe
 * direction to be wrong in: reordered fields on the wire cost one redundant write
 * (and the stored bytes really did change), never a missed update.
 */
export function rememberOfflineBoards(boards: readonly UserBoard[]): void {
  const incoming = boards.filter(isOfflineBoardCard);
  // Nothing usable to add: this is an ADD-only call, so it never empties the list.
  // Forgetting is `forgetOfflineBoardScope` (per scope) or `clearOfflineBoards` (all),
  // which keeps a refetch that momentarily returns nothing from wiping the picker.
  if (incoming.length === 0) return;
  const current = getOfflineBoards();
  const incomingUuids = new Set(incoming.map((board) => board.uuid));
  const next = [...incoming, ...current.filter((card) => !incomingUuids.has(card.uuid))].slice(
    0,
    MAX_REMEMBERED_BOARDS,
  );
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  setSetting(SETTING_KEY, next);
}

/**
 * Forget every card in `scope`. Plural by design: a download is per scope, so
 * turning one off removes the data behind every board sharing it — leaving the
 * sibling card would offer a board whose climbs are gone.
 */
export function forgetOfflineBoardScope(scope: OfflineBoardScope): void {
  const key = offlineBoardKey(scope);
  const current = getOfflineBoards();
  const next = current.filter((card) => offlineBoardKeyForBoard(card) !== key);
  if (next.length === current.length) return;
  setSetting(SETTING_KEY, next);
}

/** Forget one board by `uuid`. Used when the server no longer has it (delete, unfollow). */
export function forgetOfflineBoard(uuid: string): void {
  const current = getOfflineBoards();
  const next = current.filter((card) => card.uuid !== uuid);
  if (next.length === current.length) return;
  setSetting(SETTING_KEY, next);
}

/**
 * Drop every card whose board is absent from `knownUuids`.
 *
 * Only ever called with a COMPLETE server board list (`myBoards` with `hasMore`
 * false). Without this, a board deleted or unfollowed on another device keeps its
 * card forever: nothing else clears it, because a plain toggle-off leaves the
 * downloaded rows in place and `forgetOfflineBoardScope` is keyed on the scope, not
 * the board. A dead card is worse than a stale row — activating it writes a `uuid`
 * the backend no longer knows into `active-board-store`, which is exactly the
 * board-presence poisoning this feature refuses to risk with synthetic uuids.
 */
export function pruneOfflineBoards(knownUuids: readonly string[]): void {
  const known = new Set(knownUuids);
  const current = getOfflineBoards();
  const next = current.filter((card) => known.has(card.uuid));
  if (next.length === current.length) return;
  setSetting(SETTING_KEY, next);
}

/**
 * Drop every card. Used at the sign-out boundary (see `auth-provider`).
 *
 * The early-out reads the RAW stored value, not `getOfflineBoards()`: a stored value
 * that is corrupt or fails the shape guard reads as empty but is still bytes on disk,
 * and sign-out has to clear those too.
 */
export function clearOfflineBoards(): void {
  const stored = getSetting(SETTING_KEY);
  if (Array.isArray(stored) && stored.length === 0) return;
  setSetting(SETTING_KEY, []);
}
