import { ThirdPhysicsArena } from '../third/physics.js';
import type { ThirdAction } from '../third/types.js';
import type { WarehouseLevel } from './levels.js';
import { WarehouseDeliveryTracker } from './rules.js';

const STEP = 1 / 120;
export class WarehouseSession {
  arena: ThirdPhysicsArena;
  deliveries: WarehouseDeliveryTracker;
  phase: 'ready' | 'running' | 'stopped' | 'completed' = 'ready';
  elapsed = 0;
  readonly inputs = new Map<string, ThirdAction>();
  private released = new Set<string>();
  private accumulator = 0;
  private startedAt = 0;
  private message = '';
  constructor(readonly level: WarehouseLevel, private readonly now: () => number = () => performance.now()) {
    this.arena = new ThirdPhysicsArena(level); this.deliveries = new WarehouseDeliveryTracker(level);
  }
  reset() {
    this.clearInputs(); this.arena = new ThirdPhysicsArena(this.level); this.deliveries = new WarehouseDeliveryTracker(this.level);
    this.released.clear(); this.accumulator = 0; this.elapsed = 0; this.phase = 'ready'; this.message = '';
  }
  start() {
    if (this.phase === 'running') return;
    this.reset(); this.startedAt = this.now(); this.phase = 'running';
  }
  clearInputs() { this.inputs.clear(); }
  stop(message = '本轮未完成，可重新开始。') {
    if (this.phase === 'running') { this.updateTime(); this.phase = 'stopped'; this.message = message; }
    this.clearInputs();
  }
  private updateTime() { this.elapsed = Math.max(this.elapsed, (this.now() - this.startedAt) / 1000); }
  press(source: string, action: ThirdAction) {
    if (this.phase !== 'running' || this.inputs.has(source)) return;
    const held = [...this.inputs.values()].includes(action);
    this.inputs.set(source, action);
    if (!held) {
      if (action === 'release') {
        const cargo = this.arena.gripper().holding;
        if (cargo) this.released.add(cargo);
      }
      this.arena.act(action);
    }
  }
  release(source: string) { this.inputs.delete(source); }
  tick(dt: number) {
    if (this.phase !== 'running') return;
    if (!Number.isFinite(dt) || dt < 0) throw new Error('无效时间步长');
    this.updateTime();
    // Real elapsed time includes blur/background time; physics never consumes a huge unstable frame.
    this.accumulator += Math.min(dt, .25);
    const actions = new Set(this.inputs.values()), config = this.level.scene_config;
    while (this.accumulator + 1e-10 >= STEP && this.phase === 'running') {
      this.accumulator -= STEP;
      this.arena.step(STEP,
        (Number(actions.has('forward')) - Number(actions.has('backward'))) * config.speed,
        (Number(actions.has('turn_right')) - Number(actions.has('turn_left'))) * config.turnSpeed);
      const state = this.arena.snapshot();
      if (state.holding) this.released.delete(state.holding);
      this.deliveries.update(state.objects.map(o => {
        const body = this.arena.cubes.get(o.id)!;
        return { ...o, released: this.released.has(o.id), holding: state.holding === o.id,
          speed: body.getLinearVelocity().length() * 10, angularSpeed: body.getAngularVelocity() };
      }), STEP);
      if (this.deliveries.completed) {
        this.phase = 'completed'; this.clearInputs(); this.message = '任务完成，已停表！';
      }
    }
  }
  snapshot() {
    if (this.phase === 'running') this.updateTime();
    const state = this.arena.snapshot();
    return { ...state, phase: this.phase, elapsed: this.elapsed,
      delivered: { ...this.deliveries.delivered }, collected: Object.keys(this.deliveries.delivered), completed: this.phase === 'completed',
      message: this.message || (this.phase === 'ready' ? '观察场地，准备好后开始计时。' : state.message) };
  }
}
