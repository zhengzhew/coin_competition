import { ThirdEngine } from '../../third/engine.js';
import { compileThirdProgram } from '../../third/program.js';
import { THIRD_MAX_SECONDS, THIRD_OID_SPEED_FACTOR, type ThirdAction, type ThirdDemo, type ThirdInstruction, type ThirdMode, type ThirdPose } from '../../third/types.js';

export class RobotSession {
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
  private disposed = false;
  private precisionTarget?: ThirdPose;
  private oidDestination?: ThirdPose;
  private oidPhase?: 'turning' | 'moving' | 'holding';
  private oidNoProgress = 0;
  private oidBestError = Infinity;
  constructor(readonly demo: ThirdDemo, readonly mode: ThirdMode, readonly maxSeconds = THIRD_MAX_SECONDS) { this.engine = new ThirdEngine(demo); }
  reset() {
    if (this.disposed) throw new Error('运行实例已释放');
    this.engine.reset(); this.held.clear(); this.program = []; this.index = 0;
    this.remaining = 0; this.entered = false; this.settling = 0; this.elapsed = 0; this.line = null; this.phase = 'ready'; this.message = '';
    this.precisionTarget = undefined; this.oidDestination = undefined; this.oidPhase = undefined; this.oidNoProgress = 0; this.oidBestError = Infinity;
  }
  start(source: string) {
    if (this.disposed) throw new Error('运行实例已释放');
    if (this.mode === 'auto') {
      const commands = compileThirdProgram(source, this.demo, this.maxSeconds);
      this.reset(); this.program = commands;
    } else if (this.phase === 'completed' || this.elapsed >= this.maxSeconds) this.reset();
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
  dispose() { this.stop(); this.program = []; this.disposed = true; }
  private checkComplete() {
    if (this.engine.snapshot().completed) { this.phase = 'completed'; this.message = ''; this.held.clear(); }
  }
  tick(dt: number) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('时间步长无效');
    if (this.phase !== 'running' || dt === 0) return;
    this.elapsed += dt;
    if (this.elapsed >= this.maxSeconds) { this.stop(`本轮已达 ${this.maxSeconds} 秒，请重置后继续。`); return; }
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
        if (this.engine.physical || this.precisionTarget) {
          if (this.precisionTarget && config.kind === 'simulation3d') this.engine.stepPrecision(dt, this.precisionTarget, config.speed * THIRD_OID_SPEED_FACTOR, config.turnSpeed * THIRD_OID_SPEED_FACTOR);
          else this.engine.stepPhysics(dt);
          this.settling += dt; this.checkComplete();
          if (this.engine.snapshot().completed || this.settling < 1) return;
        }
        this.stop('程序执行完毕，目标尚未完成。可修改程序后重新运行。'); return;
      }
      if (current.action === 'move_to' || current.action === 'turn_to') {
        this.tickOid(dt, current); this.checkComplete(); return;
      }
      const timed = current.action === 'forward_time' || current.action === 'backward_time';
      const move = current.action === 'forward' || current.action === 'backward' || timed;
      const turn = current.action === 'turn_left' || current.action === 'turn_right';
      if (!this.entered) {
        this.line = current.line; this.entered = true;
        if (move || turn) { this.precisionTarget = undefined; this.oidDestination = undefined; this.oidPhase = undefined; this.engine.clearPrecision(); }
        this.engine.act(current.action === 'forward_time' ? 'forward' : current.action === 'backward_time' ? 'backward' : current.action);
        this.remaining = current.action === 'wait' || timed ? current.value : this.engine.physical && !move && !turn ? 3 : config.kind === 'grid' || !move && !turn ? 0.24
          : turn ? current.value * Math.PI / 180 : current.value;
      }
      if (this.engine.physical && config.kind === 'simulation3d') {
        const before = this.engine.snapshot();
        const direction = current.action === 'backward' || current.action === 'backward_time' || current.action === 'turn_left' ? -1 : 1;
        if (this.precisionTarget) this.engine.stepPrecision(dt, this.precisionTarget, config.speed * THIRD_OID_SPEED_FACTOR, config.turnSpeed * THIRD_OID_SPEED_FACTOR);
        else this.engine.stepPhysics(dt, move ? direction * (timed ? config.speed * Math.min(1, this.remaining / dt) : Math.min(config.speed, this.remaining / dt)) : 0,
          turn ? direction * Math.min(config.turnSpeed, this.remaining / dt) : 0);
        const after = this.engine.snapshot();
        if (timed) this.remaining -= dt;
        else if (move) this.remaining -= direction * ((after.x - before.x) * Math.sin(before.heading) - (after.z - before.z) * Math.cos(before.heading));
        else if (turn) this.remaining -= direction * Math.atan2(Math.sin(after.heading - before.heading), Math.cos(after.heading - before.heading));
        else {
          this.remaining -= dt;
          if (current.action !== 'wait' && ['open', 'closed', 'holding', 'blocked'].includes(after.gripper!.phase)) this.remaining = 0;
        }
      } else if (config.kind === 'simulation3d' && (move || turn)) {
        const amount = timed ? Math.min(this.remaining, dt) * config.speed : Math.min(this.remaining, (move ? config.speed : config.turnSpeed) * dt);
        if (move) this.engine.move(amount * (current.action === 'forward' || current.action === 'forward_time' ? 1 : -1));
        else this.engine.turn(amount * (current.action === 'turn_right' ? 1 : -1));
        this.remaining -= timed ? dt : amount;
      } else this.remaining -= dt;
      if (this.engine.snapshot().blocked) { this.stop(this.demo.grid_task ? this.engine.snapshot().message : '遇到障碍，程序已停止。请调整路线后重新运行。'); return; }
      if (this.remaining <= 0.000001) { this.entered = false; this.index++; }
    }
    this.checkComplete();
  }
  private tickOid(dt: number, instruction: Extract<ThirdInstruction, { action: 'move_to' | 'turn_to' }>) {
    const config = this.demo.scene_config;
    if (config.kind !== 'simulation3d') throw new Error('精准定位 仅用于 3D 模拟。');
    if (!this.entered) {
      const before = this.engine.snapshot();
      this.line = instruction.line; this.entered = true; this.oidNoProgress = 0; this.oidBestError = Infinity;
      if (instruction.action === 'move_to') {
        const z = config.depth - instruction.y;
        const heading = Math.hypot(instruction.x - before.x, z - before.z) < 1e-7 ? before.heading : Math.atan2(instruction.x - before.x, before.z - z);
        this.oidDestination = { x: instruction.x, z, heading };
        this.precisionTarget = { x: before.x, z: before.z, heading }; this.oidPhase = 'turning';
        this.engine.act('forward');
      } else {
        this.oidDestination = undefined;
        this.precisionTarget = { x: before.x, z: before.z, heading: instruction.value * Math.PI / 180 };
        this.oidPhase = 'turning'; this.engine.act('turn_right');
      }
    }
    const arrived = this.engine.stepPrecision(dt, this.precisionTarget!, config.speed * THIRD_OID_SPEED_FACTOR, config.turnSpeed * THIRD_OID_SPEED_FACTOR, !this.oidDestination || this.oidPhase === 'moving');
    const state = this.engine.snapshot(), target = this.precisionTarget!;
    const error = Math.hypot(target.x - state.x, target.z - state.z) + 10 * Math.abs(Math.atan2(Math.sin(target.heading - state.heading), Math.cos(target.heading - state.heading)));
    if (error < this.oidBestError - .001) { this.oidBestError = error; this.oidNoProgress = 0; } else this.oidNoProgress += dt;
    if (state.blocked || !arrived && this.oidNoProgress > 2) { this.stop('精准定位受阻，无法到达指定位置或角度。请检查车体、夹爪与障碍的空间。'); return; }
    if (arrived) {
      if (this.oidDestination && this.oidPhase === 'turning') {
        this.precisionTarget = this.oidDestination; this.oidPhase = 'moving'; this.oidBestError = Infinity; this.oidNoProgress = 0;
      } else { this.oidPhase = 'holding'; this.entered = false; this.index++; }
    }
  }
  snapshot() { const state = this.engine.snapshot(); return { ...state, phase: this.phase, elapsed: this.elapsed, line: this.line,
    oid: this.precisionTarget ? { x: (this.oidDestination ?? this.precisionTarget).x, y: this.demo.scene_config.depth - (this.oidDestination ?? this.precisionTarget).z,
      heading: (this.oidDestination ?? this.precisionTarget).heading, phase: this.oidPhase } : undefined,
    message: this.message || (this.phase === 'running' && this.oidPhase && this.oidPhase !== 'holding' ? '精准定位中，速度为普通移动的 50%。' : state.message) }; }
}
