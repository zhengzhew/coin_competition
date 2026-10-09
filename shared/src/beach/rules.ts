import { THIRD_DIMENSIONS, footprintCorners } from '../third/geometry.js';

export const BEACH_EDGE_WIDTH = 12;
/** The complete shell footprint must fit inside one of the four shoreline bands. */
export function isShellAtEdge(x: number, z: number, heading: number, width: number, depth: number) {
  const corners = footprintCorners({ x, z, heading, width: THIRD_DIMENSIONS.cargo, depth: THIRD_DIMENSIONS.cargo });
  const tolerance = .1; // The physics solver's contact tolerance, in centimetres.
  if (corners.some(p => p.x < -tolerance || p.z < -tolerance || p.x > width + tolerance || p.z > depth + tolerance)) return false;
  return corners.every(p => p.x <= BEACH_EDGE_WIDTH) || corners.every(p => p.x >= width - BEACH_EDGE_WIDTH)
    || corners.every(p => p.z <= BEACH_EDGE_WIDTH) || corners.every(p => p.z >= depth - BEACH_EDGE_WIDTH);
}
export function beachScore(elapsed: number, completed: boolean) {
  return completed && Number.isFinite(elapsed) && elapsed > 0 ? Math.round(10000 / (100 + elapsed) * 100) / 100 : 0;
}
