export function buildBoardPath(
  boardName: string,
  layoutId: number | string,
  sizeId: number | string,
  setIds: string,
  angle?: number | string,
): string {
  const base = `${boardName}/${layoutId}/${sizeId}/${setIds}`;
  return angle !== undefined ? `${base}/${angle}` : base;
}
