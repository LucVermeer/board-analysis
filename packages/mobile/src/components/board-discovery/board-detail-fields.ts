import type { UserBoard } from '@boardsesh/shared-schema';

export type BoardDetailFields = {
  /** Gym name if linked, else the free-text location, else undefined. */
  subLocation: string | undefined;
  /** Hold sets joined for display, '' when none. */
  setNames: string;
  /** "<size> · <description>", or just the size, or undefined. */
  sizeText: string | undefined;
};

/** Derive the display strings shown in the board-detail sheet. Pure. */
export function getBoardDetailFields(board: UserBoard): BoardDetailFields {
  const subLocation = board.gymName ?? board.locationName ?? undefined;
  const setNames = (board.setNames ?? []).join(' · ');
  const sizeText = board.sizeDescription
    ? `${board.sizeName ?? ''} · ${board.sizeDescription}`.trim().replace(/^· /, '')
    : (board.sizeName ?? undefined);
  return { subLocation, setNames, sizeText };
}

/** Whether `board` is the user's currently-active board. */
export function isActiveBoard(board: UserBoard, activeUuid: string | null | undefined): boolean {
  return board.uuid === activeUuid;
}
