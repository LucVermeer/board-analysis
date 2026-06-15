// Helper for the "create a board" flow's recently-connected-controller rows: a
// human board-config label built from static board-config data. (Relative-time
// formatting lives in src/lib/format-relative-time — it must use the dayjs path,
// not Intl.RelativeTimeFormat, which crashes Hermes release builds.)

import type { BoardName } from '@boardsesh/shared-schema';
import { getBoardLayouts, getBoardSizesForLayoutId } from '../../lib/custom-board-options';

// Trademark-correct display names (CLAUDE.md: capitalise MoonBoard/Kilter/Tension).
const BOARD_LABELS: Record<string, string> = {
  kilter: 'Kilter',
  tension: 'Tension',
  moonboard: 'MoonBoard',
  decoy: 'Decoy',
  touchstone: 'Touchstone',
  grasshopper: 'Grasshopper',
  soill: 'So iLL',
};

export function boardTypeLabel(boardName: string): string {
  return BOARD_LABELS[boardName] ?? boardName.charAt(0).toUpperCase() + boardName.slice(1);
}

/**
 * A compact config label like "Kilter · Original · 12×12" built entirely from
 * static board-config data (no server call). Falls back gracefully when a
 * layout/size is missing from the catalog.
 */
export function getBoardConfigLabel(boardName: BoardName, layoutId: number, sizeId: number): string {
  const layoutName = getBoardLayouts(boardName).find((layout) => layout.id === layoutId)?.name;
  const sizeName = getBoardSizesForLayoutId(boardName, layoutId).find((size) => size.id === sizeId)?.name;
  return [boardTypeLabel(boardName), layoutName, sizeName].filter(Boolean).join(' · ');
}
