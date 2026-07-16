// Pure access-control and param-parsing decisions for the /embed/** widgets.
// Kept free of fetching/React so the security gates are unit-testable.
//
// THE gate everything else hangs off: the backend `board(boardUuid)` resolver
// serves PRIVATE boards fully enriched to anonymous callers (see
// packages/backend/.../social/boards.ts — a tracked follow-up), so the embed
// layer MUST enforce visibility itself. Same for `gym(gymUuid)`, which returns
// private gyms to anon.

import type { Gym, UserBoard } from '@boardsesh/shared-schema';

/** A board the embed is allowed to render: public, with a presence-channel id. */
export type EmbeddableBoard = UserBoard & { boardId: number };

/**
 * SECURITY: decide whether `/embed/board/[board_uuid]` may render this board.
 *
 * - `board.isPublic` must be true — the `board(boardUuid)` resolver does NOT
 *   gate private boards for anonymous callers, so skipping this check would
 *   leak a private board's name/config/location to anyone who learns its uuid.
 * - `board.boardId` must be a number — defense in depth: the resolver nulls
 *   the presence-channel id unless the board is public (or the viewer can
 *   edit), so a null here means the visibility rules disagree and we bail.
 *
 * Returns the board narrowed to `EmbeddableBoard`, or null → the page 404s.
 */
export function resolveEmbeddableBoard(board: UserBoard | null): EmbeddableBoard | null {
  if (board === null) return null;
  if (board.isPublic !== true) return null;
  if (typeof board.boardId !== 'number') return null;
  return { ...board, boardId: board.boardId };
}

/**
 * SECURITY: a gym only contributes branding (name, logo, colours, /gym link)
 * to an embed when it is PUBLIC — `gym(gymUuid)` returns private gyms to
 * anonymous callers, and an embed must never render a private gym's identity.
 * Private/absent gym → null → unbranded default-dark shell.
 */
export function resolveEmbedBrandGym(gym: Gym | null): Gym | null {
  if (gym === null) return null;
  if (gym.isPublic !== true) return null;
  return gym;
}

/** Where the non-removable attribution points: the gym's public Boardsesh page
 * when there is one, else the homepage. Callers pass the PUBLIC gym only. */
export function embedAttributionHref(publicGym: Pick<Gym, 'slug'> | null): string {
  if (publicGym?.slug) return `/gym/${publicGym.slug}`;
  return 'https://boardsesh.com';
}

/** Embed leaderboards are WS-free: period modes only, no 'session'. */
export const EMBED_LEADERBOARD_PERIODS = ['day', 'week', 'month'] as const;
export type EmbedLeaderboardPeriod = (typeof EMBED_LEADERBOARD_PERIODS)[number];
export const DEFAULT_EMBED_LEADERBOARD_PERIOD: EmbedLeaderboardPeriod = 'week';

/** `?period=` parse: day|week|month, anything else → the default (week). */
export function parseEmbedLeaderboardPeriod(raw: string | undefined): EmbedLeaderboardPeriod {
  return (EMBED_LEADERBOARD_PERIODS as readonly string[]).includes(raw ?? '')
    ? (raw as EmbedLeaderboardPeriod)
    : DEFAULT_EMBED_LEADERBOARD_PERIOD;
}

/**
 * `?board=` scope parse: the uuid must be one of the gym's viewer-visible
 * boards (the anonymous `gymBoards` result — public + listed only), otherwise
 * the scope silently widens to all boards. This also means a private board's
 * uuid pasted into the query string scopes to nothing it shouldn't: it isn't
 * in the anonymous list, so it is ignored.
 */
export function resolveEmbedLeaderboardScope(
  boards: UserBoard[],
  scopedBoardUuid: string | undefined,
): { scopedBoard: UserBoard | null; scopedBoards: UserBoard[] } {
  const scopedBoard =
    scopedBoardUuid === undefined ? null : (boards.find((board) => board.uuid === scopedBoardUuid) ?? null);
  return { scopedBoard, scopedBoards: scopedBoard === null ? boards : [scopedBoard] };
}
