/** All continuous simulation dimensions and distances are in centimetres. */
export const THIRD_DIMENSIONS = {
  map: 120, cell: 12, body: 19, gripperWidth: 19, gripperLength: 6,
  fingerWidth: 1.2, cargo: 6,
} as const;
export const THIRD_GRIP_CENTER = THIRD_DIMENSIONS.body / 2 + THIRD_DIMENSIONS.gripperLength / 2;

/** World z points down the map; display coordinates originate at its lower-left corner. */
export const thirdMapPosition = (x: number, z: number, depth: number) => ({ x, y: depth - z });
export interface Footprint { x: number; z: number; width: number; depth: number; heading?: number; }
export function footprintCorners(rect: Footprint) {
  const sin = Math.sin(rect.heading || 0), cos = Math.cos(rect.heading || 0);
  return [-1, 1].flatMap(sx => [-1, 1].map(sz => ({
    x: rect.x + cos * sx * rect.width / 2 - sin * sz * rect.depth / 2,
    z: rect.z + sin * sx * rect.width / 2 + cos * sz * rect.depth / 2,
  })));
}
/** Separating-axis check for two oriented rectangles; touching edges are permitted. */
export function footprintsOverlap(a: Footprint, b: Footprint) {
  const ac = footprintCorners(a), bc = footprintCorners(b);
  for (const angle of [a.heading || 0, b.heading || 0]) {
    for (const axis of [{ x: Math.cos(angle), z: Math.sin(angle) }, { x: -Math.sin(angle), z: Math.cos(angle) }]) {
      const ap = ac.map(p => p.x * axis.x + p.z * axis.z), bp = bc.map(p => p.x * axis.x + p.z * axis.z);
      if (Math.max(...ap) <= Math.min(...bp) + 1e-7 || Math.max(...bp) <= Math.min(...ap) + 1e-7) return false;
    }
  }
  return true;
}
export const THIRD_FARM_LAYOUT = { width: 14, depth: 12 } as const;
/** Convert the decorative farm layout to the physical map, including obstacle footprints. */
export function thirdFarmPoint(x: number, z: number) {
  return { x: (x + .5) * THIRD_DIMENSIONS.map / THIRD_FARM_LAYOUT.width,
    z: (z + .5) * THIRD_DIMENSIONS.map / THIRD_FARM_LAYOUT.depth };
}
