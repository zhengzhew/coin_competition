import { THIRD_MAX_SECONDS, type ThirdDemo, type ThirdInstruction, type ThirdAction } from './types.js';

/** A small Python-shaped command language. Student text is never evaluated as JavaScript or Python. */
export function compileThirdProgram(source: string, demo: ThirdDemo): ThirdInstruction[] {
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
        const match = /^(forward|backward|turn_left|turn_right|grab|release|wait)\((\d+(?:\.\d+)?)?\)$/.exec(text.trim());
        if (!match) fail(line, '仅支持指令面板中的函数和 for i in range(n): 循环。');
        const action = match![1] as ThirdAction;
        const interaction = action === 'grab' || action === 'release';
        const turn = action === 'turn_left' || action === 'turn_right';
        if (interaction && (match![2] !== undefined || demo.category !== 'place')) fail(line, '夹取和放下仅用于摆放任务，且不需要参数。');
        const value = match![2] === undefined ? (turn ? 90 : 1) : Number(match![2]);
        const limit = turn ? 360 : demo.simulation === 'simulation3d' && (action === 'forward' || action === 'backward') ? 120 : 10;
        if (!Number.isFinite(value) || value <= 0 || value > limit) fail(line, turn ? '转向角度为 1–360°。' : `数值应大于 0 且不超过 ${limit}${limit === 120 ? ' cm' : ''}。`);
        if (demo.simulation === 'grid' && !interaction && action !== 'wait') {
          if ((turn && value % 90 !== 0) || (!turn && !Number.isInteger(value))) fail(line, turn ? '棋盘每次转向 90°，请填写 90 的倍数。' : '棋盘移动请填写整数格数。');
          for (let n = 0; n < (turn ? value / 90 : value); n++) commands.push({ action, value: turn ? 90 : 1, line });
        } else commands.push({ action, value: interaction ? 0 : value, line });
        if (commands.length > 256) fail(line, '展开后最多执行 256 条指令。');
      }
    }
    return commands;
  }
  const instructions = block(0);
  const config = demo.scene_config;
  const seconds = instructions.reduce((sum, c) => sum + (c.action === 'wait' ? c.value : config.kind === 'grid' ? 0.24
    : c.action === 'forward' || c.action === 'backward' ? c.value / config.speed
    : c.action === 'turn_left' || c.action === 'turn_right' ? c.value * Math.PI / 180 / config.turnSpeed : 0.24), 0);
  if (seconds > THIRD_MAX_SECONDS) throw new Error('程序预计运行超过 120 秒，请缩短后再试。');
  return instructions;
}
