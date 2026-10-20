import type { ThirdDemo } from '../third/types.js';

export const WAREHOUSE_VERSION = 'warehouse-manual-3';
export const WAREHOUSE_RULES = { cell: 12, cargo: 6, lineWidth: .6, settleSeconds: .4 } as const;
export interface WarehouseLevel extends ThirdDemo {
  requiredCount: number;
  scene_config: Extract<ThirdDemo['scene_config'], { kind: 'simulation3d' }> & {
    zones: { id: string; x: number; z: number; color: string }[];
  };
}
const colors = ['#2689b8', '#34a477', '#d89818', '#9a67cb', '#de6279', '#6874c7', '#be753f', '#447c68'];
const zone = (index: number, x: number, y: number) => ({
  id: String.fromCharCode(65 + index), x, z: 120 - y, color: colors[index],
});
const configs = [
  { count: 1, zones: [zone(0, 84, 84)] },
  { count: 2, zones: [zone(0, 48, 84), zone(1, 84, 84)] },
  { count: 3, zones: [zone(0, 24, 84), zone(1, 60, 84), zone(2, 96, 84)] },
  { count: 4, zones: [zone(0, 24, 96), zone(1, 96, 96), zone(2, 24, 60), zone(3, 96, 60)] },
  { count: 6, zones: [zone(0, 24, 96), zone(1, 60, 96), zone(2, 96, 96),
    zone(3, 24, 60), zone(4, 60, 60), zone(5, 96, 60)] },
  { count: 8, zones: [zone(0, 24, 96), zone(1, 48, 96), zone(2, 72, 96), zone(3, 96, 96),
    zone(4, 24, 60), zone(5, 48, 60), zone(6, 72, 60), zone(7, 96, 60)] },
];
export const warehouseLevels: WarehouseLevel[] = configs.map((config, index) => ({
  competition_id: 'warehouse', demo_id: `warehouse-${index + 1}`, content_version: WAREHOUSE_VERSION,
  title: index < 2 ? '定点投递' : '目标达成',
  objective: `把 ${config.count} 个箱子分别放入 ${config.count} 个投递区，一箱一格，全部送达立即停表。`,
  description: '不限时 · 按键驾驶 · G 夹取 / R 放下 · 只记录完成用时',
  category: 'place', simulation: 'simulation3d', supported_modes: ['manual'], status: 'ready', starter: '',
  scene_task: 'warehouse', requiredCount: config.count,
  scene_config: {
    kind: 'simulation3d', width: 120, depth: 120, speed: 18, turnSpeed: Math.PI / 2,
    // Local dimensions preserve the requested centres without spawning intersecting bodies.
    robot_dimensions: { body: 17.8, gripperWidth: 14 },
    start: { x: 12, z: 108, heading: Math.PI / 2 }, walls: [], zones: config.zones,
    objects: Array.from({ length: config.count }, (_, i) => ({
      id: String(i + 1), x: index === 1 && i === 1 ? 48 : 24 + 12 * i, z: 108,
    })),
  },
}));
