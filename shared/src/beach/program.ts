import { compileThirdProgram } from '../third/program.js';
import { RobotSession } from '../gameplay/robot/session.js';
import type { ThirdDemo } from '../third/types.js';
import { beachScore } from './rules.js';

export const BEACH_PROGRAM_COMMANDS = [
  { action: 'forward', label: '前进', template: 'forward(12)', hint: 'forward(厘米)' },
  { action: 'backward', label: '后退', template: 'backward(12)', hint: 'backward(厘米)' },
  { action: 'move_to', label: '移动到点', template: 'move_to(60, 48)', hint: 'move_to(X, Y)' },
  { action: 'turn_to', label: '转到角度', template: 'turn_to(90)', hint: 'turn_to(角度)' },
  { action: 'turn_left', label: '左转', template: 'turn_left(90)', hint: 'turn_left(角度)' },
  { action: 'turn_right', label: '右转', template: 'turn_right(90)', hint: 'turn_right(角度)' },
  { action: 'grab', label: '合拢', template: 'grab()', hint: 'grab()' },
  { action: 'release', label: '张开', template: 'release()', hint: 'release()' },
] as const;

export function compileBeachProgram(source: string, demo: ThirdDemo) {
  if (source.length > 8000) throw new Error('程序太长，请保持在 8000 个字符以内。');
  const allowed: Set<string> = new Set(BEACH_PROGRAM_COMMANDS.map(command => command.action));
  for (const [index, text] of source.split(/\r?\n/).entries()) {
    const line = text.replace(/#.*$/, '').trim();
    if (!line) continue;
    const call = /^(\w+)\s*\(/.exec(line);
    if (!call || !allowed.has(call[1])) throw new Error(`第 ${index + 1} 行：仅支持前进、后退、移动到点、转到角度、左转、右转、合拢、张开这八种指令。`);
  }
  // Match the manual race: no extra 120-second DEMO cutoff; source length is still bounded.
  return compileThirdProgram(source, demo, Infinity);
}

/** Existing program/OID controller with the beach race's real-time scoring and lifecycle. */
export class BeachProgramSession {
  private readonly controller: RobotSession;
  elapsed = 0;
  private startedAt = 0;
  constructor(readonly demo: ThirdDemo, private readonly now: () => number = () => performance.now()) {
    if (demo.scene_task !== 'seashell-edge' || demo.scene_config.kind !== 'simulation3d' || !demo.supported_modes.includes('auto')) throw new Error('需要海边拾贝编程关卡');
    this.controller = new RobotSession(demo, 'auto', Infinity);
  }
  get phase() { return this.controller.phase; }
  reset() { this.controller.reset(); this.elapsed = 0; }
  start(source: string) {
    if (this.phase === 'running') return;
    compileBeachProgram(source, this.demo); // Validate before changing the previous attempt.
    this.controller.start(source); this.elapsed = 0; this.startedAt = this.now();
  }
  stop(message = '本轮已停止。重新运行将从起点计时。') {
    if (this.phase === 'running') this.updateTime();
    this.controller.stop(message);
  }
  private updateTime() { this.elapsed = Math.max(this.elapsed, (this.now() - this.startedAt) / 1000); }
  tick(dt: number) {
    if (this.phase !== 'running') return;
    if (!Number.isFinite(dt) || dt < 0) throw new Error('时间步长无效');
    this.updateTime();
    // Bound each controller step as well as physics substeps for accurate command endpoints.
    let remaining = Math.min(dt, .1);
    while (remaining > 1e-8 && this.phase === 'running') {
      const step = Math.min(remaining, 1 / 60); this.controller.tick(step); remaining -= step;
    }
  }
  snapshot() {
    const state = this.controller.snapshot();
    return { ...state, elapsed: this.elapsed, score: beachScore(this.elapsed, this.phase === 'completed'),
      message: this.phase === 'ready' ? '添加指令，准备好后点击「运行程序」。' : state.message };
  }
}
