import type { ThirdZone } from '../third/types.js';
import { WAREHOUSE_RULES as R } from './levels.js';

export interface WarehousePoint { x: number; z: number; }
export interface WarehouseRect extends WarehousePoint { width: number; depth: number; }
export type WarehouseEdge = [WarehousePoint, WarehousePoint];

/** Render and judge the same cell union; shared edges inside one region disappear. */
export function warehouseZoneRects(zone: ThirdZone): WarehouseRect[] {
  return zone.cells?.map(cell => ({ ...cell, width: R.cell, depth: R.cell }))
    ?? [{ x: zone.x, z: zone.z, width: zone.width ?? R.cell, depth: zone.depth ?? R.cell }];
}

export function warehouseZoneEdges(zone: ThirdZone): WarehouseEdge[] {
  const edges = new Map<string, WarehouseEdge>();
  for (const rect of warehouseZoneRects(zone)) {
    const x0 = rect.x - rect.width / 2, x1 = rect.x + rect.width / 2;
    const z0 = rect.z - rect.depth / 2, z1 = rect.z + rect.depth / 2;
    const corners = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
    corners.forEach((a, index) => {
      const b = corners[(index + 1) % 4], key = [`${a.x},${a.z}`, `${b.x},${b.z}`].sort().join('/');
      if (edges.has(key)) edges.delete(key); else edges.set(key, [a, b]);
    });
  }
  return [...edges.values()];
}

const cross = (a: WarehousePoint, b: WarehousePoint, c: WarehousePoint) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const pointSegmentDistance = (p: WarehousePoint, a: WarehousePoint, b: WarehousePoint) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
};
function segmentsDistance(a: WarehousePoint, b: WarehousePoint, c: WarehousePoint, d: WarehousePoint) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
const inConvexPolygon = (p: WarehousePoint, polygon: WarehousePoint[]) => {
  const sides = polygon.map((a, i) => cross(a, polygon[(i + 1) % polygon.length], p));
  return sides.every(s => s >= -1e-9) || sides.every(s => s <= 1e-9);
};

/** Distance from a filled box to a region boundary, including concave notches. */
export function warehouseBoundaryDistance(polygon: WarehousePoint[], [a, b]: WarehouseEdge): number {
  if (inConvexPolygon(a, polygon) || inConvexPolygon(b, polygon)) return 0;
  return Math.min(...polygon.map((p, i) => segmentsDistance(p, polygon[(i + 1) % polygon.length], a, b)));
}
