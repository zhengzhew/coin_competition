import { ThirdPhysicsArena } from './physics.js';
import { StrawberryGridEngine } from '../farm/strawberry.js';
import { createGameState } from '../rule-engine.js';
import { stepRobot } from '../robot.js';
import type { GameState, LevelDef, RobotAction } from '../types.js';
import type { ThirdAction, ThirdDemo, ThirdSnapshot, ThirdPose } from './types.js';
import { THIRD_DIMENSIONS as D, THIRD_GRIP_CENTER, footprintCorners, footprintsOverlap, type Footprint } from './geometry.js';

const headings = ['up', 'right', 'down', 'left'] as const;
const normalize = (angle: number) => (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
const distanceBetween = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Grid reuses the existing robot rules. Continuous simulation has separate state and collision rules. */
export class ThirdEngine {
  private strawberry?: StrawberryGridEngine;
  private grid?: GameState;
  private physics?: ThirdPhysicsArena;
  private precisionPending = false;
  get physical() { return Boolean(this.physics); }
  stepPhysics(dt: number, driveCm = 0, turn = 0) { this.physics?.step(dt, driveCm, turn); }
  private gridLevel?: LevelDef;
  private value!: ThirdSnapshot;
  constructor(readonly demo: ThirdDemo) { this.reset(); }
  snapshot(): ThirdSnapshot {
    if (this.strawberry) return this.strawberry.snapshot();
    if (this.physics) { const state = this.physics.snapshot(); return { ...state, completed: state.completed && !this.precisionPending }; }
    return { ...this.value, objects: this.value.objects.map(o => ({ ...o, goal: o.goal && { ...o.goal } })), collected: [...this.value.collected] };
  }
  /** Presentation adapter for the existing future-city board; no score/session API is involved. */
  gridPresentation() { return this.grid && this.gridLevel ? { level: this.gridLevel, state: this.grid } : null; }
  reset() {
    const config = this.demo.scene_config;
    if (this.demo.grid_task === 'strawberry-edge') { this.strawberry = new StrawberryGridEngine(this.demo); return; }
    this.precisionPending = false;
    this.physics = config.kind === 'simulation3d' && this.demo.category === 'place' ? new ThirdPhysicsArena(this.demo) : undefined;
    this.value = {
      ...config.start, objects: config.objects.map(o => ({ ...o })), holding: null,
      collected: [], completed: false, blocked: false, message: '准备好后开始挑战。', actions: 0,
    };
    if (config.kind === 'grid') {
      const level: LevelDef = {
        level_id: this.demo.demo_id, keyboard_id: '', python_id: '', title: this.demo.title,
        stage: 'explore', width: config.width, height: config.depth,
        start: [config.start.x, config.depth - 1 - config.start.z],
        walls: config.walls.map(w => [w.x, config.depth - 1 - w.z]),
        coins: config.objects.map(o => ({ id: o.id, position: [o.x, config.depth - 1 - o.z],
          ...(this.demo.category === 'collect' ? { type: 'checkpoint' as const } : {}) })),
        required_order: null, max_commands: 10000, show_optimal_feedback: false, knowledge: '', objective: this.demo.objective,
        robot: { facing: headings[Math.round(config.start.heading / (Math.PI / 2)) % 4],
          cells: Array.from({ length: config.width * config.depth }, (_, i) => [i % config.width, Math.floor(i / config.width), 0]),
          deliveries: Object.fromEntries(config.objects.filter(o => o.goal).map(o => [o.id, [o.goal!.x, config.depth - 1 - o.goal!.z]])) },
        python: { robot: true, template_id: 'repeat_slots_v2', initial_rows: 0, min_rows: 1, max_rows: 100,
          can_add_delete_rows: true, count_range: [1, 20], allowed_functions: [] },
      };
      this.gridLevel ??= level;
      this.grid = createGameState(this.gridLevel);
    }
  }
  act(action: ThirdAction) {
    if (this.strawberry) { this.strawberry.act(action); return; }
    if (this.physics) { this.physics.act(action); return; }
    if (this.value.completed || action === 'wait') return;
    if (this.demo.category === 'collect' && (action === 'grab' || action === 'release')) return;
    if (this.grid) {
      const result = stepRobot(this.grid, { direction: action as RobotAction, command_index: this.value.actions,
        command_id: `third-local-${this.value.actions}`, source: 'keyboard' }, 10000);
      this.grid = result.state;
      const robot = this.grid.robot!;
      const collected = [...this.grid.collected];
      this.value = {
        x: this.grid.x, z: this.demo.scene_config.depth - 1 - this.grid.y,
        heading: headings.indexOf(robot.facing) * Math.PI / 2,
        holding: robot.holding, collected, actions: this.grid.consumed_commands,
        objects: this.demo.scene_config.objects.map(o => {
          const pos = robot.cargo[o.id];
          return pos ? { ...o, x: pos[0], z: this.demo.scene_config.depth - 1 - pos[1] } : { ...o };
        }),
        completed: this.grid.status === 'success', blocked: result.event.type === 'collision',
        message: result.event.type === 'collision' ? '前方有障碍，请换一个方向。'
          : result.event.type === 'action_empty' ? '前方没有可夹取的货物，或无法在此处放置。'
          : result.event.type === 'grabbed' ? '已夹取货物。'
          : result.event.type === 'delivered' ? '货物已送达。' : '继续完成目标。',
      };
    } else {
      this.value.actions++;
      this.value.blocked = false;
    }
    if (this.value.completed) this.value.message = '任务完成！可以重置后再试一次。';
  }
  clearPrecision() { this.precisionPending = false; }
  /** Continuous 精准定位 feedback with exact endpoints; movement still respects the field and obstacles. */
  stepPrecision(dt: number, pose: ThirdPose, speed: number, turnSpeed: number, final = true) {
    if (this.demo.scene_config.kind !== 'simulation3d') throw new Error('精准定位 仅用于 3D 模拟。');
    this.precisionPending = true;
    if (this.physics) this.physics.step(dt, 0, 0, { pose, speed, turnSpeed });
    else {
      this.value.blocked = false;
      const start = { x: this.value.x, z: this.value.z, heading: this.value.heading };
      const distance = Math.hypot(pose.x - start.x, pose.z - start.z), amount = Math.min(distance, speed * dt);
      const difference = Math.atan2(Math.sin(pose.heading - start.heading), Math.cos(pose.heading - start.heading));
      const turn = Math.sign(difference) * Math.min(Math.abs(difference), turnSpeed * dt);
      const parts = Math.max(1, Math.ceil(amount / .25), Math.ceil(Math.abs(turn) / .01));
      for (let i = 1; i <= parts; i++) {
        const ratio = distance ? amount / distance * i / parts : 0;
        const next = { x: start.x + (pose.x - start.x) * ratio, z: start.z + (pose.z - start.z) * ratio, heading: normalize(start.heading + turn * i / parts) };
        if (!this.robotFree(next.x, next.z, next.heading)) { this.value.blocked = true; this.value.message = '精准定位 路线被障碍或边界挡住，请调整点位。'; break; }
        Object.assign(this.value, next);
        for (const obj of this.value.objects) if (!this.value.collected.includes(obj.id) && distanceBetween(this.value, obj) < 4) this.value.collected.push(obj.id);
      }
    }
    const state = this.physics?.snapshot() ?? this.value;
    const arrived = Math.hypot(pose.x - state.x, pose.z - state.z) < 1e-7 && Math.abs(Math.atan2(Math.sin(pose.heading - state.heading), Math.cos(pose.heading - state.heading))) < 1e-7;
    this.precisionPending = !arrived || !final;
    if (!this.physics) { this.finish(); this.value.completed = this.value.completed && !this.precisionPending; }
    return arrived;
  }
  /** Distance and angle come from a fixed-step controller, not the render frame rate. */
  move(amount: number) {
    if (this.strawberry) return;
    if (this.physics && this.demo.scene_config.kind === 'simulation3d') {
      this.physics.step(Math.abs(amount) / this.demo.scene_config.speed, Math.sign(amount) * this.demo.scene_config.speed); return;
    }
    if (this.grid || this.value.completed) return;
    this.value.blocked = false;
    const parts = Math.max(1, Math.ceil(Math.abs(amount) / 0.25));
    for (let i = 0; i < parts; i++) {
      const x = this.value.x + Math.sin(this.value.heading) * amount / parts;
      const z = this.value.z - Math.cos(this.value.heading) * amount / parts;
      if (!this.robotFree(x, z, this.value.heading)) {
        this.value.blocked = true; this.value.message = '前方有障碍，请换一个方向。'; break;
      }
      this.value.x = x; this.value.z = z;
      if (this.demo.category === 'collect') {
        for (const obj of this.value.objects) {
          if (!this.value.collected.includes(obj.id) && distanceBetween(this.value, obj) < 4) this.value.collected.push(obj.id);
        }
        this.finish();
        if (this.value.completed) break;
      }
    }
  }
  turn(radians: number) {
    if (this.strawberry) return;
    if (this.physics && this.demo.scene_config.kind === 'simulation3d') {
      this.physics.step(Math.abs(radians) / this.demo.scene_config.turnSpeed, 0, Math.sign(radians) * this.demo.scene_config.turnSpeed); return;
    }
    if (this.grid || this.value.completed) return;
    this.value.blocked = false;
    // Sweep the square body, front gripper and held cargo through each small rotation.
    const parts = Math.max(1, Math.ceil(Math.abs(radians) / 0.01));
    for (let i = 0; i < parts; i++) {
      const heading = normalize(this.value.heading + radians / parts);
      if (!this.robotFree(this.value.x, this.value.z, heading)) {
        this.value.blocked = true; this.value.message = '车体或夹爪附近空间不足，请先调整位置。'; break;
      }
      this.value.heading = heading;
    }
  }
  private free(rect: Footprint, ignore?: string, checkObjects = true) {
    const config = this.demo.scene_config;
    if (footprintCorners(rect).some(p => p.x < -1e-7 || p.z < -1e-7 || p.x > config.width + 1e-7 || p.z > config.depth + 1e-7)) return false;
    if (config.walls.some(w => footprintsOverlap(rect, { ...w, width: w.width ?? D.cell, depth: w.depth ?? D.cell }))) return false;
    return !checkObjects || this.demo.category === 'collect' || !this.value.objects.some(o => o.id !== ignore && o.id !== this.value.holding
      && footprintsOverlap(rect, { ...o, width: D.cargo, depth: D.cargo }));
  }
  private robotFree(x: number, z: number, heading: number, ignore?: string) {
    const front = { x: x + Math.sin(heading) * THIRD_GRIP_CENTER, z: z - Math.cos(heading) * THIRD_GRIP_CENTER };
    if (!this.free({ x, z, width: D.body, depth: D.body, heading }, ignore)) return false;
    // The full jaw envelope reserves space against the field and props. Cargo can enter its open middle.
    if (!this.free({ ...front, width: D.gripperWidth, depth: D.gripperLength, heading }, ignore, false)) return false;
    const jawOffset = this.value.holding ? (D.cargo + D.fingerWidth) / 2 : (D.gripperWidth - D.fingerWidth) / 2;
    for (const side of [-1, 1]) if (!this.free({ x: front.x + Math.cos(heading) * jawOffset * side,
      z: front.z + Math.sin(heading) * jawOffset * side, width: D.fingerWidth, depth: D.gripperLength, heading }, ignore)) return false;
    return !this.value.holding || this.free({ ...front, width: D.cargo, depth: D.cargo, heading }, ignore);
  }
  private finish() {
    this.value.completed = this.value.collected.length === this.value.objects.length;
    if (this.value.completed) this.value.message = '任务完成！可以重置后再试一次。';
  }
}
