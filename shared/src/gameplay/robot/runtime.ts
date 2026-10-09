import { RobotSession } from './session.js';
import type { ThirdDemo, ThirdMode } from '../../third/types.js';

export type RobotScenario = Omit<ThirdDemo, 'competition_id'>;
export const ROBOT_RUNTIME = Object.freeze({ component: 'robot-runtime', version: 'development', units: { grid: 'cell', simulation3d: 'cm' } });
export function validateRobotScenario(scenario: RobotScenario, mode: ThirdMode) {
  const finite = (value: number) => Number.isFinite(value);
  const scene = scenario.scene_config;
  if (!['collect', 'place'].includes(scenario.category) || !['grid', 'simulation3d'].includes(scenario.simulation)
    || !['auto', 'manual'].includes(mode) || !scenario.supported_modes.includes(mode)) throw new Error('玩法或操作方式不受支持');
  if (!scenario.demo_id || !scenario.content_version || scenario.simulation !== scene.kind) throw new Error('场景标识或模拟类型无效');
  if (![scene.width, scene.depth].every(v => finite(v) && v > 0)) throw new Error('地图尺寸必须大于零');
  const position = (p: { x: number; z: number }) => finite(p.x) && finite(p.z) && p.x >= 0 && p.x < scene.width && p.z >= 0 && p.z < scene.depth;
  if (!position(scene.start) || !finite(scene.start.heading)) throw new Error('机器人起点无效');
  if (!scene.objects.length || new Set(scene.objects.map(o => o.id)).size !== scene.objects.length
    || scene.objects.some(o => !o.id || !position(o) || o.heading !== undefined && !finite(o.heading)
      || o.goal && !position(o.goal) || scenario.category === 'place' && !scenario.grid_task && !o.goal)) throw new Error('物体或目标配置无效');
  if (scenario.grid_task && (scenario.grid_task !== 'strawberry-edge' || scene.kind !== 'grid' || scenario.category !== 'place'
    || scene.objects.length > 9 || scene.width * scene.depth > 64 || scene.start.heading % (Math.PI / 2) !== 0
    || new Set(scene.objects.map(o => `${o.x},${o.z}`)).size !== scene.objects.length
    || scene.objects.some(o => o.x === scene.start.x && o.z === scene.start.z || scene.walls.some(w => w.x === o.x && w.z === o.z)))) throw new Error('草莓棋盘配置无效');
  if (scene.walls.some(w => !position(w) || [w.width, w.depth].some(v => v !== undefined && (!finite(v) || v <= 0)))) throw new Error('障碍配置无效');
  if (scene.kind === 'simulation3d' && (![scene.speed, scene.turnSpeed].every(v => finite(v) && v > 0))) throw new Error('移动速度无效');
  if (scene.kind === 'grid' && (![scene.width, scene.depth, scene.start.x, scene.start.z,
    ...scene.objects.flatMap(o => [o.x, o.z, ...(o.goal ? [o.goal.x, o.goal.z] : [])]),
    ...scene.walls.flatMap(w => [w.x, w.z])].every(Number.isInteger))) throw new Error('棋盘坐标必须为整数格');
}
export function createRobotRuntime(scenario: RobotScenario, mode: ThirdMode) {
  validateRobotScenario(scenario, mode);
  // A session owns its input, including when two entries share the same preset.
  return new RobotSession(structuredClone(scenario), mode);
}
