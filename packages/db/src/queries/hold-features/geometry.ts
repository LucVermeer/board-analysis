import type { PlacementGeom, GeometryFeatures } from './types.js';

/**
 * Compute angle-independent geometry features for every placement in ONE
 * (board_type, layout) group. The board coordinate frame differs per board, so
 * everything is normalized to the group's own hole bounding box — the features
 * are comparable across boards of different sizes.
 *
 * Pure: takes the placements, returns a map placementId → features. No DB.
 */
export function computeGeometryFeatures(placements: readonly PlacementGeom[]): Map<number, GeometryFeatures> {
  const result = new Map<number, GeometryFeatures>();
  if (placements.length === 0) return result;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumX = 0;
  let sumY = 0;
  for (const placement of placements) {
    if (placement.x < minX) minX = placement.x;
    if (placement.x > maxX) maxX = placement.x;
    if (placement.y < minY) minY = placement.y;
    if (placement.y > maxY) maxY = placement.y;
    sumX += placement.x;
    sumY += placement.y;
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // Guard degenerate boards (all holes share an axis): treat that axis as centered.
  const safeSpanX = spanX > 0 ? spanX : 1;
  const safeSpanY = spanY > 0 ? spanY : 1;
  const diagonal = Math.hypot(safeSpanX, safeSpanY);
  const centroidX = sumX / placements.length;
  const centroidY = sumY / placements.length;

  for (const placement of placements) {
    const normX = spanX > 0 ? (placement.x - minX) / spanX : 0.5;
    const normY = spanY > 0 ? (placement.y - minY) / spanY : 0.5;
    const edgeDist = Math.min(normX, 1 - normX, normY, 1 - normY);

    // Nearest other placement, normalized by the board diagonal.
    let nearest = Infinity;
    for (const other of placements) {
      if (other.placementId === placement.placementId) continue;
      const distance = Math.hypot(other.x - placement.x, other.y - placement.y);
      if (distance < nearest) nearest = distance;
    }
    const neighborDist = Number.isFinite(nearest) ? nearest / diagonal : 0;

    result.set(placement.placementId, {
      normX,
      normY,
      edgeDist,
      neighborDist,
      pullDirection: pullDirectionToCentroid(placement.x, placement.y, centroidX, centroidY),
    });
  }

  return result;
}

/**
 * Geometry proxy for pull direction: a climber pulls a hold roughly toward their
 * centre of mass, i.e. toward the middle of the board — a hold on the right edge
 * is pulled left, a high hold is pulled down. We return the compass angle of the
 * vector (hold → board centroid) in the user_hold_classifications convention
 * (0=up, 90=right, 180=down, 270=left). A hold AT the centroid has no defined
 * direction; we return 180 (straight down, the gravity default).
 */
export function pullDirectionToCentroid(x: number, y: number, centroidX: number, centroidY: number): number {
  const dx = centroidX - x;
  const dy = centroidY - y;
  if (dx === 0 && dy === 0) return 180;
  // atan2 with 0=up, clockwise-positive so 90=right, 180=down, 270=left.
  const degrees = (Math.atan2(dx, dy) * 180) / Math.PI;
  return Math.round((degrees + 360) % 360);
}
