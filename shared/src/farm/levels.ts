import type { ThirdDemo } from '../third/types.js';

// Public coordinates: x increases rightward, y upward; the lower-left cell is (0, 0).
export const STRAWBERRY_POSITIONS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[4, 4]], [[3, 3], [6, 5]], [[6, 2], [6, 4], [5, 3], [5, 5]],
  Array.from({ length: 8 }, (_, x) => [x, 4] as const),
  Array.from({ length: 9 }, (_, i) => [3 + i % 3, 3 + Math.floor(i / 3)] as const),
];
export const strawberryLevels: ThirdDemo[] = STRAWBERRY_POSITIONS.map((positions, index) => ({
  demo_id: `strawberry-${index + 1}`, competition_id: 'farm', content_version: 'strawberry-grid-1',
  grid_task: 'strawberry-edge', category: 'place', simulation: 'grid', supported_modes: ['auto'], status: 'ready',
  title: ['单株草莓', '两株草莓', '四株草莓', '一排草莓', '草莓方阵'][index],
  objective: `采摘 ${positions.length} 株草莓，逐株送到任意边缘，用更少步数完成。`,
  description: '观察坐标，选择采摘方向与交付边缘，规划更短的路线。',
  scene_config: { kind: 'grid', width: 8, depth: 8, start: { x: 0, z: 7, heading: 0 }, walls: [],
    objects: positions.map(([x, y], i) => ({ id: `strawberry-${i + 1}`, x, z: 7 - y })) },
  starter: '# 观察地图，规划采摘与交付路线\n# move(正数) 前进，move(负数) 后退\nmove(1)',
}));
