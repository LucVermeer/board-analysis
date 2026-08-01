// Pure access-control and param-parsing decisions for the /embed/** widgets.
// Kept free of fetching/React so the security gates are unit-testable.
//
// As of #3648 the backend masks private entities from anonymous callers itself —
// `board(boardUuid)` and `gym(gymUuid)` resolve to null instead of serving a
// private board/gym to anon. These gates stay as defense in depth: the embed is
// a cookieless surface pasted onto third-party sites, so it decides visibility
// from the payload it actually received rather than trusting the resolver to
// have masked. They also still do real work — `isPublic` additionally excludes
// an UNLISTED-but-public board, which the resolver serves by design (unlisted is
// link-only, not private).

import type { Gym, UserBoard } from '@boardsesh/shared-schema';

/** A board the embed is allowed to render: public, with a presence-channel id. */
export type EmbeddableBoard = UserBoard & { boardId: number };

/**
 * SECURITY: decide whether `/embed/board/[board_uuid]` may render this board.
 *
 * - `board.isPublic` must be true — the resolver already masks private boards
 *   from anon (#3648), but this also excludes an unlisted-but-public board,
 *   which the resolver deliberately still serves by uuid.
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
 * to an embed when it is PUBLIC — an embed must never render a private gym's
 * identity. `gym(gymUuid)` masks private gyms from anon itself (#3648); this
 * check stays as defense in depth on a cookieless third-party surface.
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
