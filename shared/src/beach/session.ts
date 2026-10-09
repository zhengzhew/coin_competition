import { ThirdPhysicsArena } from '../third/physics.js';
import type { ThirdAction, ThirdDemo } from '../third/types.js';
import { beachScore } from './rules.js';

/** Manual race: elapsed is real wall time; stopping always ends an attempt. */
export class BeachSession {
  arena: ThirdPhysicsArena;
  phase: 'ready' | 'running' | 'stopped' | 'completed' = 'ready';
  elapsed = 0;
  readonly inputs = new Map<string, ThirdAction>();
  private startedAt = 0;
  private message = '';
  constructor(readonly demo: ThirdDemo, private readonly now: () => number = () => performance.now()) {
    if (demo.scene_task !== 'seashell-edge' || demo.scene_config.kind !== 'simulation3d') throw new Error('需要海边拾贝 3D 关卡');
    this.arena = new ThirdPhysicsArena(demo);
  }
  reset() {
    this.inputs.clear(); this.arena = new ThirdPhysicsArena(this.demo); this.elapsed = 0; this.phase = 'ready'; this.message = '';
  }
  start() {
    if (this.phase === 'running') return;
    this.reset(); this.startedAt = this.now(); this.phase = 'running';
  }
  stop(message = '本轮已停止。重新开始将从起点计时。') {
    this.inputs.clear();
    if (this.phase === 'running') { this.updateTime(); this.phase = 'stopped'; this.message = message; }
  }
  press(source: string, action: ThirdAction) {
    if (this.phase !== 'running' || this.inputs.has(source)) return;
    const alreadyHeld = [...this.inputs.values()].includes(action);
    this.inputs.set(source, action);
    if (!alreadyHeld) this.arena.act(action);
  }
  release(source: string) { this.inputs.delete(source); }
  private updateTime() { this.elapsed = Math.max(this.elapsed, (this.now() - this.startedAt) / 1000); }
  tick(dt: number) {
    if (this.phase !== 'running') return;
    if (!Number.isFinite(dt) || dt < 0) throw new Error('时间步长无效');
    this.updateTime();
    const held = new Set(this.inputs.values()), config = this.demo.scene_config;
    if (config.kind !== 'simulation3d') return;
    // Limit physics catch-up after slow frames without discounting the real race clock.
    this.arena.step(Math.min(dt, .1), (Number(held.has('forward')) - Number(held.has('backward'))) * config.speed,
      (Number(held.has('turn_right')) - Number(held.has('turn_left'))) * config.turnSpeed);
    if (this.arena.snapshot().completed) { this.phase = 'completed'; this.inputs.clear(); }
  }
  snapshot() {
    const state = this.arena.snapshot();
    return { ...state, phase: this.phase, elapsed: this.elapsed, score: beachScore(this.elapsed, this.phase === 'completed'),
      message: this.message || (this.phase === 'ready' ? '观察贝壳位置，准备好后点击「开始计时」。' : state.message) };
  }
}
