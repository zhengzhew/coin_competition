import type { ThirdAction, ThirdDemo, ThirdInstruction, ThirdSnapshot } from '../third/types.js';

const vectors = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const direction = (heading: number) => ((Math.round(heading / (Math.PI / 2)) % 4) + 4) % 4;
const atEdge = (x: number, z: number, width: number, depth: number) => x === 0 || z === 0 || x === width - 1 || z === depth - 1;

/** Discrete harvest rules. Coordinates are stored top-down internally and displayed bottom-up. */
export class StrawberryGridEngine {
  private value!: ThirdSnapshot;
  constructor(readonly demo: ThirdDemo) { this.reset(); }
  reset() {
    this.value = { ...this.demo.scene_config.start, objects: structuredClone(this.demo.scene_config.objects),
      holding: null, collected: [], completed: false, blocked: false, actions: 0, steps: 0,
      message: '观察草莓位置，规划到最近边缘的路线。' };
  }
  snapshot(): ThirdSnapshot { return structuredClone(this.value); }
  act(action: ThirdAction) {
    const s = this.value, config = this.demo.scene_config;
    if (s.completed) return;
    s.blocked = false;
    const fail = (message: string) => { s.blocked = true; s.message = message; };
    const available = s.objects.filter(o => !s.collected.includes(o.id) && o.id !== s.holding);
    const [dx, dz] = vectors[direction(s.heading)];
    s.actions++;
    if (action === 'turn_left' || action === 'turn_right') {
      s.heading = ((direction(s.heading) + (action === 'turn_left' ? 3 : 1)) % 4) * Math.PI / 2;
      s.message = '已转向 90°，转向不计行驶步数。';
    } else if (action === 'forward' || action === 'backward') {
      const sign = action === 'forward' ? 1 : -1, x = s.x + dx * sign, z = s.z + dz * sign;
      if (x < 0 || z < 0 || x >= config.width || z >= config.depth) { fail('小车不能驶出棋盘。请调整移动格数。'); return; }
      if (available.some(o => o.x === x && o.z === z)) { fail('草莓所在格不能通行。请停在相邻格，面向草莓采摘。'); return; }
      if (config.walls.some(w => w.x === x && w.z === z)) { fail('前方有障碍，请调整路线。'); return; }
      s.x = x; s.z = z; s.steps!++;
      s.message = s.holding ? '携带中：到任意边缘格放下草莓。' : '行驶中：面向相邻草莓后采摘。';
    } else if (action === 'grab') {
      if (s.holding) { fail('一次只能携带一株草莓，请先到边缘放下。'); return; }
      const berry = available.find(o => o.x === s.x + dx && o.z === s.z + dz);
      if (!berry) { fail('车头前方相邻格没有草莓。请检查位置和朝向。'); return; }
      s.holding = berry.id; s.message = '已采摘一株草莓，请送到任意边缘格。';
    } else if (action === 'release') {
      if (!s.holding) { fail('夹爪中没有草莓，请先采摘。'); return; }
      if (!atEdge(s.x, s.z, config.width, config.depth)) { fail('请让小车到达棋盘的任意边缘格，再放下草莓。'); return; }
      s.collected.push(s.holding); s.holding = null;
      s.completed = s.collected.length === config.objects.length;
      s.message = s.completed ? '全部草莓已送达边缘！' : '草莓已送达边缘，继续采摘下一株。';
    }
  }
}

/** Only literal calls are accepted; student code is never evaluated. */
export function compileStrawberryProgram(source: string): ThirdInstruction[] {
  if (source.length > 8000) throw new Error('程序太长，请保持在 8000 个字符以内。');
  const commands: ThirdInstruction[] = [];
  const lines = source.split(/\r?\n/);
  if (lines.length > 150) throw new Error('程序不能超过 150 行。');
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].replace(/#.*$/, '').trim();
    if (!text) continue;
    const fail = (message: string): never => { throw new Error(`第 ${i + 1} 行：${message}`); };
    const move = /^move\(\s*(-?\d+)\s*\)$/.exec(text);
    if (move) {
      const n = Number(move[1]);
      if (!Number.isSafeInteger(n) || n === 0 || Math.abs(n) > 64) fail('move 的参数为 -64 至 64 的非零整数；正数前进，负数后退。');
      for (let step = 0; step < Math.abs(n); step++) commands.push({ action: n > 0 ? 'forward' : 'backward', value: 1, line: i + 1 });
    } else {
      const call = /^(turn_left|turn_right|grab|release)\(\s*\)$/.exec(text);
      if (!call) fail('请使用 move(整数)、turn_left()、turn_right()、grab() 或 release()。');
      const action = call![1] as ThirdAction;
      commands.push({ action, value: action.startsWith('turn') ? 90 : 0, line: i + 1 });
    }
    if (commands.length > 256) fail('展开后最多执行 256 条指令。');
  }
  if (!commands.length) throw new Error('请先写一条指令。');
  return commands;
}

/** Exact 0–1 BFS: driving costs 1, picking/dropping costs 0. Turning is free. */
export function solveStrawberryRoute(demo: ThirdDemo): { steps: number; program: string } {
  const c = demo.scene_config, count = c.objects.length, positions = c.width * c.depth;
  if (count > 8 || positions > 64) throw new Error('最短路线计算支持最多 64 格、8 株草莓。');
  const encode = (pos: number, mask: number, holding: number) => (mask * (count + 1) + holding + 1) * positions + pos;
  const decode = (key: number) => ({ pos: key % positions, holding: Math.floor(key / positions) % (count + 1) - 1, mask: Math.floor(key / positions / (count + 1)) });
  const start = encode(c.start.z * c.width + c.start.x, (1 << count) - 1, -1);
  const distances = new Map([[start, 0]]);
  const previous = new Map<number, { key: number; action: 'move' | 'grab' | 'release'; dir: number }>();
  const queue = new Map<number, number>([[0, start]]); let head = 0, tail = 1, end: number | undefined;
  const visited = new Set<number>();
  while (head < tail) {
    const key = queue.get(head)!; queue.delete(head++);
    if (visited.has(key)) continue;
    visited.add(key);
    const { pos, mask, holding } = decode(key), x = pos % c.width, z = Math.floor(pos / c.width);
    if (mask === 0 && holding === -1) { end = key; break; }
    const offer = (next: number, cost: number, action: 'move' | 'grab' | 'release', dir = 0) => {
      const distance = distances.get(key)! + cost;
      if (distance >= (distances.get(next) ?? Infinity)) return;
      distances.set(next, distance); previous.set(next, { key, action, dir });
      if (cost === 0) queue.set(--head, next); else queue.set(tail++, next);
    };
    if (holding >= 0 && atEdge(x, z, c.width, c.depth)) offer(encode(pos, mask, -1), 0, 'release');
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + vectors[dir][0], nz = z + vectors[dir][1];
      if (nx < 0 || nz < 0 || nx >= c.width || nz >= c.depth || c.walls.some(w => w.x === nx && w.z === nz)) continue;
      const berry = c.objects.findIndex((o, i) => (mask & (1 << i)) && o.x === nx && o.z === nz);
      if (berry >= 0) {
        if (holding === -1) offer(encode(pos, mask & ~(1 << berry), berry), 0, 'grab', dir);
      } else offer(encode(nz * c.width + nx, mask, holding), 1, 'move', dir);
    }
  }
  if (end === undefined) throw new Error('草莓任务没有可完成的路线。');
  const path: Array<{ action: 'move' | 'grab' | 'release'; dir: number }> = [];
  for (let key = end; key !== start;) { const item = previous.get(key)!; path.push(item); key = item.key; }
  let heading = direction(c.start.heading); const program: string[] = [];
  for (const step of path.reverse()) {
    if (step.action !== 'release') {
      const turns = (step.dir - heading + 4) % 4;
      if (turns === 3) program.push('turn_left()'); else for (let t = 0; t < turns; t++) program.push('turn_right()');
      heading = step.dir;
    }
    program.push(step.action === 'move' ? 'move(1)' : `${step.action}()`);
  }
  return { steps: distances.get(end)!, program: program.join('\n') };
}

export const strawberryScore = (steps: number, optimal: number, completed: boolean) =>
  completed && steps >= optimal && steps >= 0 ? (steps === 0 ? 100 : Math.floor(100 * optimal / steps)) : 0;
