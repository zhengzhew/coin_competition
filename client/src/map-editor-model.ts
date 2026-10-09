import { robotLevels, type LevelDef } from '@coin-path/shared';
import coinPack from '../../levels.teacher.json?raw';

export const templates: LevelDef[] = [...JSON.parse(coinPack).levels, ...robotLevels()];
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
export function blank(robot = false, width = 8, height = 8): LevelDef {
  const level = clone(robot ? robotLevels()[0] : templates[0]);
  level.initial_facing = 'up';
  Object.assign(level, {level_id: 'CUSTOM01', keyboard_id: 'CUSTOM_K01', python_id: 'CUSTOM_P01', content_id: 'custom_map', content_version: '1.0.0', title: '我的新地图', width, height, start: [0, 0], coins: [], walls: [], required_order: null, step_limit: null, expected_optimal_steps: undefined, expected_max_value: undefined, objective: robot ? '将货物送到同字母泊位。' : '收集地图上的全部金币。', knowledge: '', rule_hint: '', show_optimal_feedback: false});
  if (robot) level.robot = {facing: 'up', cells: Array.from({length: width * height}, (_,i) => [i % width, Math.floor(i / width), 0]), deliveries: {}};
  return level;
}

/** Validate all editable data before it reaches rendering or the shared game rules. */
export function parseMap(input: unknown): LevelDef {
  const fail = (message: string): never => {throw new Error(message);};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('请选择地图 JSON 对象。');
  const raw = input as Record<string, unknown>;
  if (Array.isArray(raw.levels)) return parseMap(raw.levels[0]);
  const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (!integer(raw.width, 3, 24) || !integer(raw.height, 3, 16)) return fail('地图宽度须为 3–24，高度须为 3–16。');
  const width = raw.width as number, height = raw.height as number;
  const point = (p: unknown): [number, number] => {
    if (!Array.isArray(p) || p.length !== 2 || !integer(p[0],0,width-1) || !integer(p[1],0,height-1)) return fail('坐标必须是地图范围内的整数 [x, y]。');
    return [p[0],p[1]];
  };
  const level = blank(Boolean(raw.robot), width, height);
  level.start = point(raw.start);
  if (raw.initial_facing !== undefined && !['up','down','left','right'].includes(raw.initial_facing as string)) return fail('初始方向须为上、下、左或右。');
  level.initial_facing = (raw.initial_facing as LevelDef['initial_facing']) ?? 'up';
  if (!Array.isArray(raw.walls) || !Array.isArray(raw.coins) || raw.coins.length > 8) return fail('需要 walls 和 coins 数组，目标最多 8 个。');
  level.walls = raw.walls.map(point);
  level.coins = raw.coins.map(c => {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !/^[A-H]$/.test(c.id)) return fail('目标字母必须是 A–H。');
    if (c.value !== undefined && !integer(c.value, 1, 99)) return fail('目标分值须为 1–99。');
    return {id:c.id, position:point(c.position), value:c.value ?? 1, type:c.type === 'checkpoint' ? 'checkpoint' : c.type === 'chest' ? 'chest' : 'coin'};
  });
  const ids = level.coins.map(c=>c.id);
  if (new Set(ids).size !== ids.length) return fail('目标字母不能重复。');
  if (raw.required_order != null) {
    if (!Array.isArray(raw.required_order) || raw.required_order.length !== ids.length || new Set(raw.required_order).size !== ids.length || raw.required_order.some(id=>!ids.includes(id))) return fail('收集顺序必须包含每个目标一次。');
    level.required_order = [...raw.required_order] as string[];
  }
  if (raw.step_limit != null) {
    if (!integer(raw.step_limit, 1, 256)) return fail('步数上限须为 1–256。');
    level.step_limit = raw.step_limit as number;
  }
  if (raw.max_commands !== undefined && !integer(raw.max_commands,1,256)) return fail('命令上限须为 1–256。');
  level.max_commands = (raw.max_commands as number) || 256;
  for (const key of ['title','objective','knowledge','rule_hint','level_id','keyboard_id','python_id','content_id','content_version'] as const) {
    if (typeof raw[key] === 'string') level[key] = raw[key].slice(0,500);
  }
  if (raw.robot) {
    const robot = raw.robot as Record<string, unknown>;
    if (!['up','down','left','right'].includes(robot.facing as string) || !Array.isArray(robot.cells) || !robot.deliveries || typeof robot.deliveries !== 'object') return fail('机器人需要朝向、平台和泊位配置。');
    const cells: [number,number,number][] = robot.cells.map(c=>{
      if (!Array.isArray(c) || c.length !== 3 || typeof c[2] !== 'number' || !Number.isFinite(c[2]) || c[2] < 0 || c[2] > 3) return fail('平台高度须为 0–3。');
      return [...point(c.slice(0,2)), c[2]];
    });
    const deliveries: Record<string,[number,number]> = {};
    for (const [id,p] of Object.entries(robot.deliveries)) {
      if (!/^[A-H]$/.test(id)) return fail('泊位字母必须是 A–H。');
      deliveries[id] = point(p);
    }
    level.robot = {facing: robot.facing as NonNullable<LevelDef['robot']>['facing'], cells, deliveries};
    if (robot.checkpoint_order !== undefined) {
      const checkpoints = level.coins.filter(c=>c.type==='checkpoint').map(c=>c.id);
      const order = robot.checkpoint_order;
      if (!Array.isArray(order) || order.length !== checkpoints.length || new Set(order).size !== checkpoints.length || order.some(id=>!checkpoints.includes(id))) return fail('打卡顺序必须包含每个打卡点一次。');
      if (order.length) level.robot.checkpoint_order = [...order];
    }
    level.initial_facing = level.robot.facing;
    level.required_order = null; level.step_limit = null;
  }
  return level;
}

export function problems(level: LevelDef): string[] {
  const issues: string[] = [];
  if (!level.coins.length) issues.push('至少放置一个目标。');
  // Robot patrols may place a checkpoint at home; it is collected only on a later move back.
  const homeCheckpoint = level.robot && level.coins.some(c=>c.type==='checkpoint' && same(c.position,level.start));
  const occupied = [...(homeCheckpoint?[]:[level.start]), ...level.walls, ...level.coins.map(c=>c.position), ...Object.values(level.robot?.deliveries ?? {})].map(p=>p.join(','));
  if (new Set(occupied).size !== occupied.length) issues.push('起点、障碍、目标和泊位不能重叠（机器人起点可兼作打卡点）。');
  if (level.robot) {
    const platforms = new Set(level.robot.cells.map(p=>p.slice(0,2).join(',')));
    if (platforms.size !== level.robot.cells.length) issues.push('平台坐标不能重复。');
    if ([level.start,...level.coins.map(c=>c.position),...Object.values(level.robot.deliveries)].some(p=>!platforms.has(p.join(',')))) issues.push('起点、货物、打卡点和泊位必须在平台上。');
    const cargo = level.coins.filter(c=>c.type!=='checkpoint');
    if (cargo.some(c=>!level.robot!.deliveries[c.id]) || Object.keys(level.robot.deliveries).some(id=>!cargo.some(c=>c.id===id))) issues.push('每件货物都需要一个同字母泊位；打卡点不需要泊位。');
  }
  return issues;
}
