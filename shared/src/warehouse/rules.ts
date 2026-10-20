import { footprintCorners } from '../third/geometry.js';
import type { ThirdObject } from '../third/types.js';
import { WAREHOUSE_RULES as R, type WarehouseLevel } from './levels.js';
import { warehouseZoneRects, warehouseZoneEdges, warehouseBoundaryDistance } from './geometry.js';

export type WarehouseZone = WarehouseLevel['scene_config']['zones'][number];
const shapes = new WeakMap<WarehouseZone, { rects: ReturnType<typeof warehouseZoneRects>; edges: ReturnType<typeof warehouseZoneEdges> }>();
/** Every corner must clear the inside edge of the scoring area's visible border. */
export function warehouseContains(object: ThirdObject, zone: WarehouseZone): boolean {
  let shape = shapes.get(zone);
  if (!shape) { shape = { rects: warehouseZoneRects(zone), edges: warehouseZoneEdges(zone) }; shapes.set(zone, shape); }
  const corners = footprintCorners({ ...object, width: R.cargo, depth: R.cargo });
  if (!corners.every(p => shape.rects.some(rect =>
    Math.abs(p.x - rect.x) <= rect.width / 2 && Math.abs(p.z - rect.z) <= rect.depth / 2))) return false;
  // footprintCorners is unordered; trace the perimeter before testing whole-box clearance.
  const polygon = [corners[0], corners[2], corners[3], corners[1]];
  return shape.edges.every(edge => warehouseBoundaryDistance(polygon, edge) > R.lineWidth / 2 + 1e-7);
}
export interface WarehouseEvidence extends ThirdObject {
  released: boolean;
  holding: boolean;
  speed: number;
  angularSpeed: number;
}
/** Recomputed occupancy, never a running sum of release events. */
export class WarehouseDeliveryTracker {
  private stable = new Map<string, { zone: string; seconds: number }>();
  delivered: Record<string, string> = {};
  score = 0;
  completed = false;
  constructor(readonly level: WarehouseLevel) {}
  update(objects: WarehouseEvidence[], dt: number) {
    const next: Record<string, string> = {};
    const knownIds = new Set(this.level.scene_config.objects.map(object => object.id));
    for (const object of objects) {
      if (!knownIds.has(object.id)) continue;
      const zone = object.released && !object.holding && object.speed < .5 && Math.abs(object.angularSpeed) < .05
        ? this.level.scene_config.zones.find(z => warehouseContains(object, z)) : undefined;
      if (!zone) { this.stable.delete(object.id); continue; }
      const previous = this.stable.get(object.id);
      const seconds = (previous?.zone === zone.id ? previous.seconds : 0) + dt;
      this.stable.set(object.id, { zone: zone.id, seconds });
      if (seconds + 1e-9 >= R.settleSeconds) next[object.id] = zone.id;
    }
    for (const id of this.stable.keys()) if (!objects.some(object => object.id === id)) this.stable.delete(id);
    this.delivered = next;
    this.score = Object.values(next).reduce((total, id) =>
      total + (this.level.scene_config.zones.find(zone => zone.id === id)?.points ?? 0), 0);
    this.completed = this.level.targetScore !== undefined
      ? this.score >= this.level.targetScore
      : this.level.scene_config.objects.every(object => !!next[object.id]);
  }
}
