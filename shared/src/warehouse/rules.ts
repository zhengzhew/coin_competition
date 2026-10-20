import { footprintCorners } from '../third/geometry.js';
import type { ThirdObject } from '../third/types.js';
import { WAREHOUSE_RULES as R, type WarehouseLevel } from './levels.js';

export type WarehouseZone = WarehouseLevel['scene_config']['zones'][number];
/** 12 cm between line centres. The visible 6 mm stroke admits at most 3 mm past each centreline. */
export function warehouseContains(object: ThirdObject, zone: WarehouseZone): boolean {
  const outer = R.cell / 2 + R.lineWidth / 2;
  return footprintCorners({ ...object, width: R.cargo, depth: R.cargo }).every(
    p => Math.abs(p.x - zone.x) <= outer + 1e-7 && Math.abs(p.z - zone.z) <= outer + 1e-7);
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
  completed = false;
  constructor(readonly level: WarehouseLevel) {}
  update(objects: WarehouseEvidence[], dt: number) {
    const next: Record<string, string> = {};
    const occupied = new Map(this.level.scene_config.zones.map(zone =>
      [zone.id, objects.filter(object => warehouseContains(object, zone)).length]));
    for (const object of objects) {
      const zone = object.released && !object.holding && object.speed < .5 && Math.abs(object.angularSpeed) < .05
        ? this.level.scene_config.zones.find(z => occupied.get(z.id) === 1 && warehouseContains(object, z)) : undefined;
      if (!zone) { this.stable.delete(object.id); continue; }
      const previous = this.stable.get(object.id);
      const seconds = (previous?.zone === zone.id ? previous.seconds : 0) + dt;
      this.stable.set(object.id, { zone: zone.id, seconds });
      if (seconds + 1e-9 >= R.settleSeconds) next[object.id] = zone.id;
    }
    this.delivered = next;
    this.completed = this.level.scene_config.objects.every(object => !!next[object.id]);
  }
}
