export function buildClimbViewPath(
  boardName: string,
  layoutId: number,
  sizeId: number,
  setIds: string,
  angle: number,
  climbUuid: string,
): string {
  return `/${boardName}/${layoutId}/${sizeId}/${setIds}/${angle}/view/${climbUuid}`;
}
