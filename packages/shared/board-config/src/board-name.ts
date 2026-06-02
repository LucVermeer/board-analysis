import { SUPPORTED_BOARDS, type BoardName } from '@boardsesh/shared-schema';

// Validate against the SCHEMA list (not the MoonBoard-gated board-data list),
// so a board the API legitimately returns is accepted regardless of the
// platform's MoonBoard feature flag.
const SUPPORTED_BOARD_SET: ReadonlySet<string> = new Set(SUPPORTED_BOARDS);

/**
 * Narrows a loose board string (e.g. `UserBoard.boardType`, which the schema
 * types as plain `string`) to the `BoardName` union, or `null` when it is
 * empty / unknown. This is the single guard that keeps an unresolved board
 * (`''`, `undefined`) from flowing into a `boardType` API payload.
 */
export function toBoardName(value: string | null | undefined): BoardName | null {
  return value != null && SUPPORTED_BOARD_SET.has(value) ? (value as BoardName) : null;
}

/**
 * Trademark-safe display name for a board type (e.g. `kilter` → "Kilter",
 * `moonboard` → "MoonBoard", `soill` → "So iLL"). Lives here so both web
 * (`@/app/lib/string-utils`) and shared packages (`@boardsesh/profile-stats`)
 * share one source of truth for board-name casing.
 */
export function formatBoardDisplayName(boardType: string): string {
  if (boardType === 'moonboard') return 'MoonBoard';
  if (boardType === 'soill') return 'So iLL';
  return boardType.charAt(0).toUpperCase() + boardType.slice(1);
}
