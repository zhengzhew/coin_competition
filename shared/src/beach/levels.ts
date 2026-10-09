import type { ThirdDemo } from '../third/types.js';

export const BEACH_OID_POSITIONS = [
  [[36, 70], [18, 80]],
  [[30, 32], [84, 38], [36, 78], [88, 90]],
] as const;
export const beachLevels: ThirdDemo[] = BEACH_OID_POSITIONS.map((positions, index) => ({
  competition_id: 'beach', demo_id: `shells-${index + 1}`, content_version: 'beach-1.1.0',
  scene_task: 'seashell-edge', category: 'place', simulation: 'simulation3d', supported_modes: ['manual'],
  title: index === 0 ? '初潮寻贝' : '四海拾珍',
  objective: `将 ${positions.length} 个贝壳送到任意地图边缘，用时越短得分越高`,
  description: '键盘驾驶小车，推动或夹取贝壳，完整送入浅蓝色边缘带并停稳即可交付。全部交付后停止计时。', status: 'ready', starter: '',
  scene_config: { kind: 'simulation3d', width: 120, depth: 120, speed: 18, turnSpeed: Math.PI / 2,
    start: { x: 60, z: 96, heading: 0 }, walls: [],
    objects: positions.map(([x, y], i) => ({ id: String.fromCharCode(65 + i), x, z: 120 - y })),
  },
}));
