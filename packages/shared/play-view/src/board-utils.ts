/**
 * Whether a board supports mirroring climbs.
 * Tension boards support mirroring (except layout 11), and Decoy boards support it.
 */
export function boardSupportsMirroring(boardName: string, layoutId: number): boolean {
  return (boardName === 'tension' && layoutId !== 11) || boardName === 'decoy';
}
