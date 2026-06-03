export function buildBoardPath(
  boardName: string,
  layoutId: number | string,
  sizeId: number | string,
  setIds: string,
  angle?: number | string,
): string {
  const base = `${boardName}/${layoutId}/${sizeId}/${setIds}`;
  return angle !== undefined && angle !== '' ? `${base}/${angle}` : base;
}

export type ParsedBoardPath = {
  boardName: string;
  layoutId: number;
  sizeId: number;
  setIds: string;
  angle: number | null;
};

/**
 * Inverse of {@link buildBoardPath}. Parses the standard board route shape
 * `{board}/{layout}/{size}/{sets}/{angle}` positionally, so a `setIds`
 * segment that happens to equal an angle string can't shift the angle slot.
 *
 * Tolerant of inputs that aren't bare board paths: a leading slash, a leading
 * two-letter locale segment (`/es/...`, `/fr/...`), and any trailing route
 * segments (`/list`, `/{climb_uuid}`) are all accepted — mobile broadcasts the
 * bare form via `buildBoardPath`, but a web peer can broadcast a full pathname.
 *
 * `setIds` stays a comma-joined string (it's a single path segment). `angle`
 * is `null` when absent or non-numeric. Returns `null` when the four required
 * board segments aren't present / aren't the right types. The `/b/{slug}/...`
 * board-entity URL shape is intentionally not parsed (returns `null`).
 */
export function parseBoardPath(path: string): ParsedBoardPath | null {
  if (!path) return null;
  const segments = path.split('/').filter((segment) => segment.length > 0);
  // Drop a leading locale segment (two lowercase letters). No board name is two
  // characters, so this can't swallow a real board segment.
  if (segments.length > 0 && /^[a-z]{2}$/.test(segments[0])) {
    segments.shift();
  }
  if (segments.length < 4) return null;

  const [boardName, layoutRaw, sizeRaw, setIds, angleRaw] = segments;
  const layoutId = Number(layoutRaw);
  const sizeId = Number(sizeRaw);
  if (!boardName || !setIds || !Number.isFinite(layoutId) || !Number.isFinite(sizeId)) {
    return null;
  }

  const angle = angleRaw !== undefined && /^-?\d+$/.test(angleRaw) ? Number(angleRaw) : null;
  return { boardName, layoutId, sizeId, setIds, angle };
}
