import { ThirdEngine, THIRD_MAX_SECONDS, compileThirdProgram,
  type ThirdAction, type ThirdDemo, type ThirdInstruction, type ThirdMode } from '@coin-path/shared';

export class ThirdSession {
  readonly engine: ThirdEngine;
  phase: 'ready' | 'running' | 'stopped' | 'completed' = 'ready';
  elapsed = 0;
  line: number | null = null;
  message = '';
  readonly held = new Set<ThirdAction>();
  private program: ThirdInstruction[] = [];
  private index = 0;
  private remaining = 0;
  private entered = false;
  private settling = 0;
  constructor(readonly demo: ThirdDemo, readonly mode: ThirdMode) { this.engine = new ThirdEngine(demo); }
  reset() {
    this.engine.reset(); this.held.clear(); this.program = []; this.index = 0;
    this.remaining = 0; this.entered = false; this.settling = 0; this.elapsed = 0; this.line = null; this.phase = 'ready'; this.message = '';
  }
  start(source: string) {
    if (this.mode === 'auto') {
      const commands = compileThirdProgram(source, this.demo);
      this.reset(); this.program = commands;
    } else if (this.phase === 'completed' || this.elapsed >= THIRD_MAX_SECONDS) this.reset();
    this.phase = 'running'; this.message = '';
  }
  stop(message = '已停止。') {
    this.held.clear();
    if (this.phase === 'running') { this.phase = 'stopped'; this.message = message; }
  }
  press(action: ThirdAction) {
    if (this.mode !== 'manual' || this.phase !== 'running' || this.held.has(action)) return;
    this.held.add(action);
    this.engine.act(action);
    this.checkComplete();
  }
  release(action: ThirdAction) { this.held.delete(action); }
  private checkComplete() {
    if (this.engine.snapshot().completed) { this.phase = 'completed'; this.message = ''; this.held.clear(); }
  }
  tick(dt: number) {
    if (this.phase !== 'running') return;
    this.elapsed += dt;
    if (this.elapsed >= THIRD_MAX_SECONDS) { this.stop('本轮已达 120 秒，请重置后继续。'); return; }
    const config = this.demo.scene_config;
    if (this.mode === 'manual') {
      if (config.kind === 'simulation3d') {
        const turn = Number(this.held.has('turn_right')) - Number(this.held.has('turn_left'));
        const drive = Number(this.held.has('forward')) - Number(this.held.has('backward'));
        if (this.engine.physical) this.engine.stepPhysics(dt, drive * config.speed, turn * config.turnSpeed);
        else {
          if (turn) this.engine.turn(turn * config.turnSpeed * dt);
          if (drive) this.engine.move(drive * config.speed * dt);
        }
      }
    } else {
      const current = this.program[this.index];
      if (!current) {
        if (this.engine.physical) {
          this.engine.stepPhysics(dt); this.settling += dt; this.checkComplete();
          if (this.engine.snapshot().completed || this.settling < 1) return;
        }
        this.stop('程序执行完毕，目标尚未完成。可修改程序后重新运行。'); return;
      }
      const move = current.action === 'forward' || current.action === 'backward';
      const turn = current.action === 'turn_left' || current.action === 'turn_right';
      if (!this.entered) {
        this.line = current.line; this.entered = true;
        this.engine.act(current.action);
        this.remaining = current.action === 'wait' ? current.value : this.engine.physical && !move && !turn ? 3 : config.kind === 'grid' || !move && !turn ? 0.24
          : turn ? current.value * Math.PI / 180 : current.value;
      }
      if (this.engine.physical && config.kind === 'simulation3d') {
        const before = this.engine.snapshot();
        const direction = current.action === 'backward' || current.action === 'turn_left' ? -1 : 1;
        this.engine.stepPhysics(dt, move ? direction * Math.min(config.speed, this.remaining / dt) : 0,
          turn ? direction * Math.min(config.turnSpeed, this.remaining / dt) : 0);
        const after = this.engine.snapshot();
        if (move) this.remaining -= direction * ((after.x - before.x) * Math.sin(before.heading) - (after.z - before.z) * Math.cos(before.heading));
        else if (turn) this.remaining -= direction * Math.atan2(Math.sin(after.heading - before.heading), Math.cos(after.heading - before.heading));
        else {
          this.remaining -= dt;
          if (current.action !== 'wait' && ['open', 'closed', 'holding', 'blocked'].includes(after.gripper!.phase)) this.remaining = 0;
        }
      } else if (config.kind === 'simulation3d' && (move || turn)) {
        const amount = Math.min(this.remaining, (move ? config.speed : config.turnSpeed) * dt);
        if (move) this.engine.move(amount * (current.action === 'forward' ? 1 : -1));
        else this.engine.turn(amount * (current.action === 'turn_right' ? 1 : -1));
        this.remaining -= amount;
      } else this.remaining -= dt;
      if (this.engine.snapshot().blocked) { this.stop('遇到障碍，程序已停止。请调整路线后重新运行。'); return; }
      if (this.remaining <= 0.000001) { this.entered = false; this.index++; }
    }
    this.checkComplete();
  }
  snapshot() { return { ...this.engine.snapshot(), phase: this.phase, elapsed: this.elapsed, line: this.line,
    message: this.message || this.engine.snapshot().message }; }
}
