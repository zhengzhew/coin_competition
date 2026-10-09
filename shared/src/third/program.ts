import { THIRD_MAX_SECONDS, THIRD_OID_SPEED_FACTOR, type ThirdDemo, type ThirdInstruction } from './types.js';
import { compileStrawberryProgram } from '../farm/strawberry.js';

/** Upgrade local drafts from the initial precision-command names without altering comments. */
export function migrateThirdProgramCommands(source: string) {
  return source.replace(/(^|\n)([ \t]*)oid_(move_to|turn_to)(?=\s*\()/g, '$1$2$3');
}

/** A small Python-shaped command language. Student text is never evaluated as JavaScript or Python. */
export function compileThirdProgram(source: string, demo: ThirdDemo): ThirdInstruction[] {
  if (demo.grid_task === 'strawberry-edge') return compileStrawberryProgram(source);
  if (source.length > 8000) throw new Error('程序太长，请保持在 8000 个字符以内。');
  const lines = source.split(/\r?\n/).map((text, i) => ({ text: text.replace(/#.*$/, '').trimEnd(), line: i + 1 })).filter(l => l.text.trim());
  if (!lines.length) throw new Error('请先写一条指令。');
  if (lines.length > 150) throw new Error('程序不能超过 150 行。');
  let cursor = 0;
  const fail = (line: number, message: string): never => { throw new Error(`第 ${line} 行：${message}`); };
  function block(indent: number): ThirdInstruction[] {
    const commands: ThirdInstruction[] = [];
    while (cursor < lines.length) {
      const { text, line } = lines[cursor];
      if (text.includes('\t')) fail(line, '缩进请使用 4 个空格。');
      const spaces = text.length - text.trimStart().length;
      if (spaces < indent) break;
      if (spaces !== indent) fail(line, '请检查缩进，每层循环使用 4 个空格。');
      cursor++;
      const loop = /^for (?:i|_) in range\((\d+)\):$/.exec(text.trim());
      if (loop) {
        const count = Number(loop[1]);
        if (count < 1 || count > 20 || indent >= 8) fail(line, '循环次数为 1–20，最多嵌套两层。');
        const children = block(indent + 4);
        if (!children.length) fail(line, '循环内至少需要一条指令。');
        if (commands.length + count * children.length > 256) fail(line, '展开后最多执行 256 条指令。');
        for (let n = 0; n < count; n++) commands.push(...children);
      } else {
        const match = /^(forward|backward|forward_time|backward_time|turn_left|turn_right|move_to|turn_to|grab|release|wait)\(\s*(.*?)\s*\)$/.exec(text.trim());
        if (!match) fail(line, '仅支持指令面板中的函数和 for i in range(n): 循环。');
        const action = match![1] as ThirdInstruction['action'];
        const args = match![2] === '' ? [] : match![2].split(',').map(s => s.trim());
        if (args.some(arg => !/^\d+(?:\.\d+)?$/.test(arg))) fail(line, '参数请填写非负数字，不支持表达式或变量。');
        const values = args.map(Number);
        const oid = action === 'move_to' || action === 'turn_to';
        const timed = action === 'forward_time' || action === 'backward_time';
        if ((oid || timed) && demo.simulation !== 'simulation3d') fail(line, '精准定位和按秒移动仅用于 3D 模拟；棋盘模式请按整数格移动。');
        if (action === 'move_to') {
          if (values.length !== 2 || values.some(v => !Number.isInteger(v)) || values[0] < 0 || values[0] > demo.scene_config.width || values[1] < 0 || values[1] > demo.scene_config.depth) fail(line, `移动到点需要两个整数厘米坐标：X 为 0–${demo.scene_config.width}，Y 为 0–${demo.scene_config.depth}。`);
          commands.push({ action, x: values[0], y: values[1], line });
        } else if (action === 'turn_to') {
          if (values.length !== 1 || !Number.isFinite(values[0]) || values[0] < 0 || values[0] > 360) fail(line, '转到角度需要一个 0–360° 的绝对角度；0° 向上，顺时针增加。');
          commands.push({ action, value: values[0] % 360, line });
        } else {
          const interaction = action === 'grab' || action === 'release';
          const turn = action === 'turn_left' || action === 'turn_right';
          if (interaction && (values.length || demo.category !== 'place')) fail(line, '夹取和放下仅用于摆放任务，且不需要参数。');
          if (values.length > 1 || timed && values.length !== 1) fail(line, '此指令需要一个数值参数。');
          const value = values[0] ?? (turn ? 90 : 1);
          const limit = turn ? 360 : timed ? THIRD_MAX_SECONDS : demo.simulation === 'simulation3d' && (action === 'forward' || action === 'backward') ? 120 : 10;
          if (!Number.isFinite(value) || value <= 0 || value > limit) fail(line, turn ? '转向角度为 1–360°。' : `数值应大于 0 且不超过 ${limit}${timed ? ' 秒' : limit === 120 ? ' cm' : ''}。`);
          if (demo.simulation === 'grid' && !interaction && action !== 'wait') {
            if ((turn && value % 90 !== 0) || (!turn && !Number.isInteger(value))) fail(line, turn ? '棋盘每次转向 90°，请填写 90 的倍数。' : '棋盘移动请填写整数格数。');
            for (let n = 0; n < (turn ? value / 90 : value); n++) commands.push({ action, value: turn ? 90 : 1, line });
          } else commands.push({ action, value: interaction ? 0 : value, line });
        }
        if (commands.length > 256) fail(line, '展开后最多执行 256 条指令。');
      }
    }
    return commands;
  }
  const instructions = block(0);
  const config = demo.scene_config;
  // Estimate a nominal route, including precise positioning's preliminary turn and half-speed travel.
  let seconds = 0, x = config.start.x, z = config.start.z, heading = config.start.heading;
  const difference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  for (const c of instructions) {
    if (c.action === 'wait' || c.action === 'forward_time' || c.action === 'backward_time') {
      seconds += c.value;
      if (c.action !== 'wait' && config.kind === 'simulation3d') {
        const amount = c.value * config.speed * (c.action === 'backward_time' ? -1 : 1);
        x += Math.sin(heading) * amount; z -= Math.cos(heading) * amount;
      }
    } else if (config.kind === 'grid') seconds += .24;
    else if (c.action === 'move_to') {
      const nextZ = config.depth - c.y, distance = Math.hypot(c.x - x, nextZ - z);
      if (distance > 1e-9) {
        const nextHeading = Math.atan2(c.x - x, z - nextZ);
        seconds += Math.abs(difference(nextHeading, heading)) / (config.turnSpeed * THIRD_OID_SPEED_FACTOR) + distance / (config.speed * THIRD_OID_SPEED_FACTOR);
        heading = nextHeading;
      }
      x = c.x; z = nextZ;
    } else if (c.action === 'turn_to') {
      const nextHeading = c.value * Math.PI / 180;
      seconds += Math.abs(difference(nextHeading, heading)) / (config.turnSpeed * THIRD_OID_SPEED_FACTOR); heading = nextHeading;
    } else if (c.action === 'forward' || c.action === 'backward') {
      seconds += c.value / config.speed;
      const amount = c.value * (c.action === 'backward' ? -1 : 1);
      x += Math.sin(heading) * amount; z -= Math.cos(heading) * amount;
    } else if (c.action === 'turn_left' || c.action === 'turn_right') {
      seconds += c.value * Math.PI / 180 / config.turnSpeed;
      heading += c.value * Math.PI / 180 * (c.action === 'turn_left' ? -1 : 1);
    } else seconds += .24;
  }
  if (seconds > THIRD_MAX_SECONDS) throw new Error('程序预计运行超过 120 秒，请缩短后再试。');
  return instructions;
}
