// Brand display names — proper nouns, not translated copy.
// TODO: variants of this map exist across board-detail, board cards, and the
// public gym page — extract a shared helper (e.g. @boardsesh/board-constants)
// instead of adding another copy. This module at least keeps the manage-gym
// surfaces (boards tab + kiosk editor) on a single copy.

const BOARD_TYPE_LABELS: Record<string, string> = {
  kilter: 'Kilter',
  tension: 'Tension',
  moonboard: 'MoonBoard',
  decoy: 'Decoy',
  touchstone: 'Touchstone',
  grasshopper: 'Grasshopper',
  soill: 'So iLL',
};

export function boardTypeLabel(boardType: string): string {
  return BOARD_TYPE_LABELS[boardType] ?? boardType;
}
