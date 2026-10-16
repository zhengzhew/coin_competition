import type { ThirdDemo } from '../third/types.js';

export const BEACH_OID_POSITIONS = [
  [[36, 70], [18, 80]],
  [[30, 32], [84, 38], [36, 78], [88, 90]],
  Array.from({ length: 10 }, (_, i) => [20 + i * 9, 72] as const),
  Array.from({ length: 12 }, (_, i) => [20 + (i % 4) * 20, 20 + Math.floor(i / 4) * 44] as const),
] as const;
const titles = ['初潮寻贝', '四海拾珍', '一排贝壳', '一堆贝壳'];
const arrangements = ['', '', '10 个贝壳整齐排成一长条，可用循环完成多次收集。', '12 个贝壳按 3 行 4 列整齐排放，可用循环完成多次收集。'];
export const beachLevels: ThirdDemo[] = BEACH_OID_POSITIONS.map((positions, index) => ({
  competition_id: 'beach', demo_id: `shells-${index + 1}`, content_version: 'beach-code-2.0.0',
  scene_task: 'seashell-edge', category: 'place', simulation: 'simulation3d', supported_modes: ['auto'],
  title: titles[index],
  objective: `${arrangements[index]}将 ${positions.length} 个贝壳完整送入任意浅蓝色边缘带并停稳，完成全部交付`,
  description: `${arrangements[index]}编写指令控制小车，推动或夹取贝壳，完整送入浅蓝色边缘带并停稳即可交付。全部交付后停止计时。`, status: 'ready', starter: '',
  scene_config: { kind: 'simulation3d', width: 120, depth: 120, speed: 18, turnSpeed: Math.PI / 2,
    start: { x: index === 3 ? 100 : 60, z: 96, heading: 0 }, walls: [],
    objects: positions.map(([x, y], i) => ({ id: String.fromCharCode(65 + i), x, z: 120 - y })),
  },
}));
