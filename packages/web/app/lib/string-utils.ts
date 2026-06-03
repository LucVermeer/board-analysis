export function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// `formatBoardDisplayName` now lives in @boardsesh/board-config so shared
// packages (e.g. @boardsesh/profile-stats) share one source of truth for
// board-name casing. Re-exported here for back-compat with web call sites.
export { formatBoardDisplayName } from '@boardsesh/board-config';
