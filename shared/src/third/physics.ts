import { World, Vec2, Box, PrismaticJoint, GearJoint, type Body } from 'planck';
import { THIRD_DIMENSIONS as D, THIRD_GRIP_CENTER } from './geometry.js';
import type { ThirdAction, ThirdDemo, ThirdSnapshot, ThirdGripper } from './types.js';

/** Demonstration values, pending measurement on the actual mat, cubes and robot. */
export const THIRD_PHYSICS = {
  robotMassKg: 1.2, cargoMassKg: .04, fingerMassKg: .02,
  floorFriction: .25, fingerFriction: 1.5, cargoFriction: .4,
  driveForceN: 6, steeringTorqueNm: .25, gripForceN: 1.5,
  fingerSpeedCm: 5, step: 1 / 120, settleSeconds: .4,
} as const;
// One solver unit = 10 cm. This keeps 6 cm cubes well above the solver's contact tolerance.
const unit = (cm: number) => cm / 10;
const cm = (value: number) => value * 10;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Ground-plane rigid bodies. Grasping is finger contact/friction, never a weld or teleport. */
export class ThirdPhysicsArena {
  readonly world = new World(Vec2(0, 0));
  readonly robot: Body;
  readonly cubes = new Map<string, Body>();
  readonly fingers: { body: Body; joint: PrismaticJoint; side: number }[] = [];
  private target: 'open' | 'closed' = 'open';
  private settled = new Map<string, number>();
  private gripAge = 0;
  private stalled = 0;
  private actions = 0;
  private completed = false;
  private blocked = false;
  private message = '货块可以推动。G 合拢夹爪，R 张开夹爪。';
  constructor(readonly demo: ThirdDemo) {
    const c = demo.scene_config, p = THIRD_PHYSICS;
    const floor = this.world.createBody();
    const wall = (x: number, z: number, width: number, depth: number) => floor.createFixture(
      Box(unit(width / 2), unit(depth / 2), Vec2(unit(x), unit(z))), { friction: .4, restitution: 0 });
    wall(-2, c.depth / 2, 4, c.depth + 8); wall(c.width + 2, c.depth / 2, 4, c.depth + 8);
    wall(c.width / 2, -2, c.width, 4); wall(c.width / 2, c.depth + 2, c.width, 4);
    for (const w of c.walls) wall(w.x, w.z, w.width ?? D.cell, w.depth ?? D.cell);
    this.robot = this.world.createDynamicBody({ position: Vec2(unit(c.start.x), unit(c.start.z)),
      angle: c.start.heading, bullet: true, allowSleep: false });
    this.robot.createFixture(Box(unit(D.body / 2), unit(D.body / 2)), {
      density: p.robotMassKg / unit(D.body) ** 2, friction: .4, restitution: 0, filterGroupIndex: -1 });
    const openingOffset = (D.gripperWidth - D.fingerWidth) / 2;
    for (const side of [-1, 1]) {
      const local = Vec2(unit(side * openingOffset), -unit(THIRD_GRIP_CENTER));
      const body = this.world.createDynamicBody({ position: this.robot.getWorldPoint(local),
        angle: c.start.heading, bullet: true, allowSleep: false });
      body.createFixture(Box(unit(D.fingerWidth / 2), unit(D.gripperLength / 2)), {
        density: p.fingerMassKg / (unit(D.fingerWidth) * unit(D.gripperLength)),
        friction: p.fingerFriction, restitution: 0, filterGroupIndex: -1 });
      const joint = this.world.createJoint(new PrismaticJoint({ enableLimit: true,
        lowerTranslation: -unit(openingOffset - D.fingerWidth / 2), upperTranslation: 0,
        enableMotor: true, maxMotorForce: p.gripForceN * 10, motorSpeed: 0 },
      this.robot, body, body.getPosition(), this.robot.getWorldVector(Vec2(side, 0))))!;
      this.fingers.push({ body, joint, side });
    }
    // A linked parallel gripper keeps equal travel on both sides; cubes remain independent bodies.
    this.world.createJoint(new GearJoint({ ratio: -1 }, this.fingers[0].body, this.fingers[1].body,
      this.fingers[0].joint, this.fingers[1].joint, -1));
    for (const o of c.objects) {
      const body = this.world.createDynamicBody({ position: Vec2(unit(o.x), unit(o.z)), angle: o.heading || 0, bullet: true });
      body.createFixture(Box(unit(D.cargo / 2), unit(D.cargo / 2)), {
        density: p.cargoMassKg / unit(D.cargo) ** 2, friction: p.cargoFriction, restitution: .02 });
      this.cubes.set(o.id, body);
    }
  }
  act(action: ThirdAction) {
    if (this.completed || action === 'wait') return;
    this.actions++;
    if (action === 'grab' || action === 'release') {
      this.target = action === 'grab' ? 'closed' : 'open'; this.gripAge = 0;
      this.message = action === 'grab' ? '夹爪正在合拢；只有两侧接触货块才能夹稳。' : '夹爪正在张开，货块保留实际位置。';
    }
  }
  /** Advance exactly one controller interval, internally substepped for stable contacts. */
  step(dt: number, driveCm = 0, turn = 0) {
    if (this.completed || dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / THIRD_PHYSICS.step));
    for (let i = 0; i < n; i++) this.substep(dt / n, driveCm, turn);
  }
  private substep(dt: number, driveCm: number, turn: number) {
    const p = THIRD_PHYSICS, before = this.robot.getPosition().clone(), angle = this.robot.getAngle();
    const velocity = this.robot.getLinearVelocity();
    const desired = Vec2(Math.sin(angle) * unit(driveCm), -Math.cos(angle) * unit(driveCm));
    const force = Vec2((desired.x - velocity.x) * this.robot.getMass() / dt,
      (desired.y - velocity.y) * this.robot.getMass() / dt);
    const length = force.length(), maximum = p.driveForceN * 10;
    if (length > maximum) force.mul(maximum / length);
    this.robot.applyForceToCenter(force, true);
    this.robot.applyTorque(clamp((turn - this.robot.getAngularVelocity()) * this.robot.getInertia() / dt,
      -p.steeringTorqueNm * 100, p.steeringTorqueNm * 100), true);
    for (const f of this.fingers) {
      const destination = this.target === 'open' ? 0 : -unit((D.gripperWidth - 2 * D.fingerWidth) / 2);
      f.joint.setMotorSpeed(clamp((destination - f.joint.getJointTranslation()) / dt, -unit(p.fingerSpeedCm), unit(p.fingerSpeedCm)));
    }
    // Coulomb floor drag is capped by current momentum so it never reverses a resting cube.
    for (const b of this.cubes.values()) {
      const v = b.getLinearVelocity(), speed = v.length();
      const friction = p.floorFriction * b.getMass() * 98.1;
      if (speed > 0) {
        const magnitude = Math.min(friction, b.getMass() * speed / dt);
        b.applyForceToCenter(Vec2(-v.x / speed * magnitude, -v.y / speed * magnitude), true);
      }
      b.applyTorque(clamp(-b.getAngularVelocity() * b.getInertia() / dt,
        -friction * unit(D.cargo) / 3, friction * unit(D.cargo) / 3), true);
    }
    this.world.step(dt, 12, 8); this.gripAge += dt;
    const moved = Vec2.distance(before, this.robot.getPosition());
    const turned = Math.abs(angleDifference(this.robot.getAngle(), angle));
    const stuck = (Math.abs(driveCm) > .2 && moved < unit(Math.abs(driveCm)) * dt * .05)
      || (Math.abs(turn) > .05 && turned < Math.abs(turn) * dt * .05);
    this.stalled = stuck ? this.stalled + dt : 0;
    this.blocked = this.stalled > .45;
    if (this.blocked) this.message = '车体或货块被挡住了，请后退或调整方向。';
    const grip = this.gripper();
    if (grip.phase === 'holding') this.message = `夹爪接触并夹住 ${grip.holding}；碰撞或转弯仍可能使货块滑脱。`;
    else if (grip.phase === 'open' && this.target === 'open' && this.actions > 0) this.message = '夹爪已张开；可以继续推块或重新对准夹取。';
    else if (grip.phase === 'closed') this.message = '夹爪已闭合，当前没有夹住货块。';
    else if (grip.phase === 'blocked') this.message = '夹爪闭合受阻，尚未形成稳定的双侧夹持。';
    const delivered: string[] = [];
    for (const o of this.demo.scene_config.objects) {
      const b = this.cubes.get(o.id)!;
      const inside = !!o.goal && [-1, 1].every(x => [-1, 1].every(z => {
        const v = b.getWorldPoint(Vec2(unit(x * D.cargo / 2), unit(z * D.cargo / 2)));
        return Math.abs(cm(v.x) - o.goal!.x) <= D.cell / 2 && Math.abs(cm(v.y) - o.goal!.z) <= D.cell / 2;
      }));
      const stable = inside && grip.holding !== o.id && b.getLinearVelocity().length() < unit(.5) && Math.abs(b.getAngularVelocity()) < .05;
      this.settled.set(o.id, stable ? (this.settled.get(o.id) || 0) + dt : 0);
      if ((this.settled.get(o.id) || 0) >= p.settleSeconds) delivered.push(o.id);
    }
    this.completed = delivered.length > 0 && delivered.length === this.cubes.size;
    if (this.completed) this.message = '货块均已完整进入目标区并停稳，任务完成！';
  }
  private touching(body: Body, other: Body) {
    for (let edge = body.getContactList(); edge; edge = edge.next) {
      if (edge.other === other && edge.contact.isTouching()) return true;
    }
    return false;
  }
  gripper(): ThirdGripper & { holding: string | null } {
    const offsets = this.fingers.map(f => cm(this.robot.getLocalPoint(f.body.getPosition()).x));
    const gap = Math.max(0, offsets[1] - offsets[0] - D.fingerWidth);
    let holding: string | null = null;
    if (this.target === 'closed') for (const [id, body] of this.cubes) {
      const local = this.robot.getLocalPoint(body.getPosition());
      if (Math.abs(cm(local.y) + THIRD_GRIP_CENTER) < D.gripperLength / 2
        && this.fingers.every(f => this.touching(f.body, body))) { holding = id; break; }
    }
    const speed = Math.max(...this.fingers.map(f => Math.abs(cm(f.joint.getJointSpeed()))));
    const phase = this.target === 'open' ? (gap > D.gripperWidth - 2 * D.fingerWidth - .25 ? 'open' : 'opening')
      : holding ? 'holding' : gap < .25 ? 'closed' : this.gripAge > .3 && speed < .15 ? 'blocked' : 'closing';
    return { target: this.target, phase, gap, fingers: offsets as [number, number], holding };
  }
  snapshot(): ThirdSnapshot {
    const pos = this.robot.getPosition(), grip = this.gripper();
    return { x: cm(pos.x), z: cm(pos.y), heading: this.robot.getAngle(), holding: grip.holding,
      gripper: grip, completed: this.completed, blocked: this.blocked, message: this.message, actions: this.actions,
      collected: [...this.settled].filter(([, t]) => t >= THIRD_PHYSICS.settleSeconds).map(([id]) => id),
      objects: this.demo.scene_config.objects.map(o => {
        const b = this.cubes.get(o.id)!, p = b.getPosition();
        return { ...o, goal: o.goal && { ...o.goal }, x: cm(p.x), z: cm(p.y), heading: b.getAngle() };
      }) };
  }
}
