import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const levelFile = resolve('levels.teacher.json');
const solutionFile = resolve('solutions.teacher.json');
const previous = JSON.parse(readFileSync(levelFile, 'utf8'));
const pythonByLevel = new Map(previous.levels.map((level) => [level.level_id, level.python]));

const CATEGORIES = {
  intro: '操控入门 · 无序收集',
  ordered: '强制顺序收集',
  optimal_guided: '最小步数 · 教学',
  optimal_free: '最小步数 · 自主探索',
  obstacle_guided: '障碍物 + 最优顺序教学',
  obstacle_free: '障碍物 · 自主探索',
  budget: '步数预算',
};

// Authoritative r/c maps copied from the supplied 20-level demo. The demo uses
// a top-left origin; the app uses a bottom-left origin so that "up" increases y.
const source = [
  { title: '满地黄金', category: 'intro', objective: '拾取全部 2 枚金币，先后顺序不限，金币位置紧邻起点。', coins: [[0,1],[1,0]], optimal: 3, knowledge: '认识方向移动与自动拾取' },
  { title: '顺序寻宝', category: 'intro', objective: '拾取全部 3 枚金币，先后顺序不限，金币位置比关卡1更远、分布更散。', coins: [[0,2],[2,0],[2,3]], optimal: 8, knowledge: '连续移动与分散目标收集' },
  { title: '渐入佳境', category: 'intro', objective: '拾取全部 4 枚金币，先后顺序不限，金币数量和距离进一步增加。', coins: [[0,4],[2,2],[4,0],[4,4]], optimal: 16, knowledge: '组合多个方向完成收集' },
  { title: '初识顺序', category: 'ordered', objective: '必须严格按 ① → ② → ③ 的编号顺序拾取 3 枚金币。', ordered: true, coins: [[1,1,1],[3,1,2],[3,3,3]], optimal: 6, knowledge: '理解并遵守强制拾取顺序' },
  { title: '顺序进阶', category: 'ordered', objective: '必须严格按 ① → ② → ③ → ④ 的编号顺序拾取 4 枚金币，位置比关卡4更分散。', ordered: true, coins: [[0,3,1],[2,4,2],[4,2,3],[2,0,4]], optimal: 14, knowledge: '把长任务按顺序拆分' },
  { title: '自由探路', category: 'optimal_guided', objective: '拾取全部 5 枚金币，先后顺序不限。', coins: [[0,3],[1,1],[2,4],[3,0],[4,2]], optimal: 15, knowledge: '比较不同拾取顺序的总步数' },
  { title: '最优揭晓', category: 'optimal_guided', objective: '地图与关卡6完全相同，但必须严格按给定的 ① → ⑤ 顺序拾取。', ordered: true, coins: [[1,1,1],[3,0,2],[4,2,3],[2,4,4],[0,3,5]], optimal: 15, knowledge: '体会顺序如何影响总步数' },
  { title: '寻路练习一', category: 'optimal_free', objective: '拾取全部金币，先后顺序不限，尝试用最少的步数走完。', coins: [[0,2],[1,4],[3,1],[4,3]], optimal: 12, knowledge: '自主规划较短的收集路线' },
  { title: '寻路练习二', category: 'optimal_free', objective: '同关卡8玩法，全新地图，金币分布更分散。', coins: [[0,4],[1,1],[2,3],[3,0],[4,4]], optimal: 16, knowledge: '比较分散目标的访问顺序' },
  { title: '寻路练习三', category: 'optimal_free', objective: '同关卡8玩法，全新地图，金币数量取上限（5枚）。', coins: [[0,1],[1,3],[2,0],[3,4],[4,2]], optimal: 14, knowledge: '在更多路径组合中寻找较优方案' },
  { title: '寻路收尾', category: 'optimal_free', objective: '同关卡8玩法，全新地图，作为本层收尾关。', coins: [[0,3],[2,1],[2,4],[4,0],[4,2]], optimal: 14, knowledge: '独立分析并优化完整路线' },
  { title: '绕障教学', category: 'obstacle_guided', objective: '地图新增若干封闭格（不可进入），必须严格按给定顺序拾取全部金币。', ordered: true, walls: [[1,2],[2,2]], coins: [[1,0,1],[3,0,2],[4,3,3],[1,4,4]], optimal: 11, knowledge: '按指定顺序绕开封闭区' },
  { title: '绕障练习一', category: 'obstacle_free', objective: '拾取全部金币，先后顺序不限。绕过中间的竖墙，从底部唯一缺口通过。', walls: [[0,2],[1,2],[2,2],[3,2]], coins: [[0,4],[1,0],[1,4],[3,3]], optimal: 12, knowledge: '发现唯一缺口并绕过贯穿地图的隔墙' },
  { title: '绕障练习二', category: 'obstacle_free', objective: '拾取全部金币，先后顺序不限。两道竖墙的缺口上下错开，需要多次绕行。', walls: [[0,1],[1,1],[2,1],[3,1],[1,3],[2,3],[3,3],[4,3]], coins: [[0,4],[2,2],[4,1],[4,4]], optimal: 16, knowledge: '通过交错缺口多次改变方向，规划连续绕行路线' },
  { title: '绕障收尾', category: 'obstacle_free', objective: '拾取全部金币，先后顺序不限。两道横墙的缺口都在右侧，需要往返穿梭寻找通路。', walls: [[1,0],[1,1],[1,2],[1,3],[3,0],[3,1],[3,2],[3,3]], coins: [[0,3],[2,1],[4,0],[4,4]], optimal: 18, knowledge: '在同侧缺口的横向隔墙间往返，综合规划路线' },
  { title: '预算入门', category: 'budget', grid: 7, stepLimit: 20, expectedMaxValue: 5, objective: '地图扩大到 7×7，步数预算 20 步以内，尽量拾取更多金币（本关认真规划路线即可拿满全部 5 枚）。', walls: [[1,1],[2,1],[4,5],[5,5]], coins: [[0,4],[3,0],[5,2],[6,6],[2,6]], knowledge: '在宽松预算内规划完整收集路线' },
  { title: '预算收紧', category: 'budget', grid: 7, stepLimit: 16, expectedMaxValue: 5, objective: '仍是 7×7 地图，步数预算 16 步以内，尽量拾取更多金币（全新地图，6 枚金币，预算不足以全部拿到，需要取舍）。', walls: [[1,1],[1,2],[4,4],[4,5],[2,5],[5,1]], coins: [[0,6],[2,0],[3,6],[5,0],[6,4],[4,2]], knowledge: '在有限步数中主动取舍目标' },
  { title: '精打细算', category: 'budget', grid: 8, stepLimit: 19, expectedMaxValue: 5, objective: '地图扩大到 8×8，步数预算 19 步以内，尽量拾取更多金币（全新地图，7 枚金币，预算进一步收紧）。', walls: [[1,1],[1,2],[3,3],[3,4],[5,2],[6,6],[2,6]], coins: [[0,3],[2,7],[3,0],[5,5],[6,1],[7,7],[4,4]], knowledge: '在复杂地图中估算路线收益' },
  { title: '金币箱登场', category: 'budget', grid: 8, stepLimit: 17, expectedMaxValue: 6, objective: '仍是 8×8 地图，步数预算 17 步以内，尽量拾取更多金币价值；地图新增"金币箱"（价值 3 枚金币）。', walls: [[1,1],[2,1],[4,4],[4,5],[6,2],[6,3],[3,6]], coins: [[0,5],[2,0],[3,7],[5,1],[6,7],[4,3],[7,0,null,3,'chest']], knowledge: '比较普通金币与金币箱的路线价值' },
  { title: '终极挑战', category: 'budget', grid: 9, stepLimit: 22, expectedMaxValue: 8, objective: '全系列最大地图 9×9，步数预算 22 步以内，尽量拾取更多金币价值；金币箱价值 3 枚金币。', walls: [[1,1],[1,2],[2,6],[3,3],[3,4],[5,5],[6,1],[6,7],[7,3]], coins: [[0,4],[2,0],[3,8],[5,0],[6,8],[8,1],[7,6],[0,8,null,3,'chest']], knowledge: '综合运用规划、避障、预算与价值取舍' },
];

function toPosition(grid, point) {
  return [point[1], grid - 1 - point[0]];
}

function ruleHint(def) {
  const parts = [];
  if (def.ordered) parts.push('必须按编号顺序拾取；提前经过后续金币时，该金币不会被拾取。');
  else parts.push('金币没有先后顺序。');
  if (def.walls?.length) parts.push('封闭区不可进入，碰撞后停在原地且不计入有效步数。');
  if (def.stepLimit) parts.push(`本关有 ${def.stepLimit} 步预算，步数用完会自动结算，不要求拿满全部金币。`);
  if (def.coins.some((coin) => coin[4] === 'chest')) parts.push('金币箱价值 3 点，请权衡是否值得绕路拾取。');
  return parts.join('');
}

const levels = source.map((def, index) => {
  const n = index + 1;
  const id = `L${String(n).padStart(2, '0')}`;
  const grid = def.grid ?? 5;
  const coins = def.coins.map((coin, coinIndex) => ({
    id: String.fromCharCode(65 + coinIndex),
    position: toPosition(grid, coin),
    value: coin[3] ?? 1,
    type: coin[4] ?? 'coin',
  }));
  const requiredOrder = def.ordered
    ? [...def.coins]
      .map((coin, coinIndex) => ({ id: String.fromCharCode(65 + coinIndex), order: coin[2] }))
      .sort((a, b) => a.order - b.order)
      .map((coin) => coin.id)
    : null;
  return {
    level_id: id,
    content_id: `coin_l${String(n).padStart(2, '0')}`,
    content_version: '3.0.0',
    keyboard_id: `K${String(n).padStart(2, '0')}`,
    python_id: `P${String(n).padStart(2, '0')}`,
    title: def.title,
    stage: n <= 5 ? 'explore' : n === 6 || n === 7 || n === 12 ? 'guided' : 'challenge',
    category: def.category,
    category_label: CATEGORIES[def.category],
    width: grid,
    height: grid,
    start: [0, grid - 1],
    coins,
    walls: (def.walls ?? []).map((wall) => toPosition(grid, wall)),
    required_order: requiredOrder,
    step_limit: def.stepLimit ?? null,
    expected_max_value: def.expectedMaxValue ?? null,
    max_commands: 256,
    max_attempts: null,
    expected_optimal_steps: def.optimal ?? null,
    show_optimal_feedback: n >= 6 && n <= 15,
    knowledge: def.knowledge,
    objective: def.objective,
    rule_hint: ruleHint(def),
    // Keep the existing command-button + numeric-step editor contract. Only the
    // row allowance grows with the larger replacement maps.
    python: {
      ...pythonByLevel.get(id),
      template_id: 'repeat_slots_v2',
      initial_rows: n <= 12 ? 6 : 8,
      min_rows: 1,
      max_rows: 24,
      can_add_delete_rows: true,
      count_range: [0, 20],
    },
  };
});

const assignments = levels.flatMap((level, index) => ['keyboard', 'python_blank'].map((mode) => ({
  assignment_key: `${mode === 'keyboard' ? 'K' : 'P'}${String(index + 1).padStart(2, '0')}`,
  level_id: level.level_id,
  content_id: level.content_id,
  content_version: level.content_version,
  mode,
  sequence: index + 1,
})));

const pack = {
  content_pack: 'coin_path_20_v3',
  content_version: '3.0.0',
  rules_version: '2.1.0',
  max_coins: 8,
  hidden_answer_fields: ['expected_optimal_steps', 'expected_max_value'],
  levels,
  assignments,
};

const directions = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] };
function solve(level) {
  const walls = new Set(level.walls.map(([x, y]) => `${x},${y}`));
  const coinAt = new Map(level.coins.map((coin, i) => [`${coin.position[0]},${coin.position[1]}`, { id: coin.id, bit: 1 << i }]));
  const target = (1 << level.coins.length) - 1;
  const queue = [{ x: level.start[0], y: level.start[1], mask: 0, path: [] }];
  const seen = new Set([`${level.start[0]},${level.start[1]},0`]);
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head];
    if (state.mask === target) return state.path;
    for (const [direction, [dx, dy]] of Object.entries(directions)) {
      const x = state.x + dx;
      const y = state.y + dy;
      if (x < 0 || x >= level.width || y < 0 || y >= level.height || walls.has(`${x},${y}`)) continue;
      let mask = state.mask;
      const coin = coinAt.get(`${x},${y}`);
      if (coin && !(mask & coin.bit)) {
        if (level.required_order) {
          const collectedCount = mask.toString(2).replaceAll('0', '').length;
          if (level.required_order[collectedCount] !== coin.id) {
            const key = `${x},${y},${mask}`;
            if (!seen.has(key)) { seen.add(key); queue.push({ x, y, mask, path: [...state.path, direction] }); }
            continue;
          }
        }
        mask |= coin.bit;
      }
      const key = `${x},${y},${mask}`;
      if (!seen.has(key)) { seen.add(key); queue.push({ x, y, mask, path: [...state.path, direction] }); }
    }
  }
  return null;
}

const documentedBudgetRoutes = {
  L16: [['down',5],['right',2],['down',1],['right',4],['up',6],['left',2]],
  L17: [['down',5],['up',1],['right',2],['up',1],['right',4],['up',3]],
  L18: [['down',6],['right',1],['up',2],['right',3],['down',1],['right',1],['down',2],['right',2]],
  L19: [['down',4],['right',3],['down',1],['left',2],['down',2],['left',1]],
  L20: [['down',2],['up',2],['right',8],['down',7],['left',2]],
};

function compact(commands) {
  const rows = [];
  for (const direction of commands) {
    const last = rows.at(-1);
    if (last?.[0] === direction) last[1] += 1;
    else rows.push([direction, 1]);
  }
  return rows;
}

const solutions = levels.map((level) => {
  const commands = level.step_limit
    ? documentedBudgetRoutes[level.level_id].flatMap(([direction, count]) => Array(count).fill(direction))
    : solve(level);
  const rows = level.step_limit ? documentedBudgetRoutes[level.level_id] : compact(commands);
  return {
    level_id: level.level_id,
    expected_optimal_steps: level.expected_optimal_steps,
    expected_max_value: level.expected_max_value,
    commands,
    reference_rows: rows.map(([direction, count]) => ({ direction, count })),
    python_reference: rows.map(([direction, count]) => `move_${direction}(${count})`).join('\n'),
  };
});

const serializedPack = `${JSON.stringify(pack, null, 2)}\n`;
writeFileSync(levelFile, serializedPack);
writeFileSync(solutionFile, `${JSON.stringify({
  fixture_sha256: createHash('sha256').update(serializedPack).digest('hex'),
  content_version: pack.content_version,
  solutions,
}, null, 2)}\n`);
console.log(`generated ${levels.length} levels and ${solutions.length} teacher solutions`);
