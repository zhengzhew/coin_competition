import { createUuid, WAREHOUSE_VERSION } from '@coin-path/shared';
export interface WarehousePlayer { id: string; name: string }
export interface WarehouseRecord { id: string; levelId: string; seconds: number; completedAt: string }
export function loadWarehousePlayer(): WarehousePlayer | null {
  try {
    const value = JSON.parse(localStorage.getItem('warehouse.player.v1') ?? 'null');
    return value && typeof value.id === 'string' && typeof value.name === 'string' && value.name.trim()
      ? { id: value.id, name: value.name.slice(0, 40) } : null;
  } catch { return null; }
}
export const warehouseRecordsKey = (id: string) => `warehouse.records.${WAREHOUSE_VERSION}.${id}`;
export function loadWarehouseRecords(id: string): WarehouseRecord[] {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(warehouseRecordsKey(id)) ?? '[]');
    if (!Array.isArray(records)) return [];
    return records.filter((r): r is WarehouseRecord => !!r && typeof r.id === 'string'
      && /^warehouse-[1-6]$/.test(r.levelId) && Number.isFinite(r.seconds) && r.seconds > 0 && typeof r.completedAt === 'string');
  } catch { return []; }
}
export const newWarehousePlayer = (name: string): WarehousePlayer => ({ id: createUuid(), name: name.trim() });
