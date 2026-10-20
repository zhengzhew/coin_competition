import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec2 } from 'planck';
import { footprintsOverlap, footprintCorners } from '../third/geometry.js';
import { warehouseLevels } from './levels.js';
import { warehouseContains, WarehouseDeliveryTracker, type WarehouseEvidence } from './rules.js';
import { WarehouseSession } from './session.js';

const evidence = (id: string, x: number, z: number, extra: Partial<WarehouseEvidence> = {}): WarehouseEvidence =>
  ({ id, x, z, heading: 0, released: true, holding: false, speed: 0, angularSpeed: 0, ...extra });

test('six warehouse levels preserve centres and counts with non-overlapping starts and zones', () => {
  assert.deepEqual(warehouseLevels.map(l => l.scene_config.objects.length), [1, 2, 3, 4, 6, 8]);
  assert.deepEqual(warehouseLevels.map(l => l.scene_config.zones.length), [1, 2, 3, 4, 6, 8]);
  assert.deepEqual(warehouseLevels.map(l => l.requiredCount), [1, 2, 3, 4, 6, 8]);
  for (const level of warehouseLevels) {
    const c = level.scene_config;
    assert.deepEqual([c.start.x, 120 - c.start.z], [12, 12]);
    assert.deepEqual([c.objects[0].x, 120 - c.objects[0].z], [24, 12]);
    for (const o of c.objects) assert.equal(footprintsOverlap(
      { ...c.start, width: c.robot_dimensions!.body, depth: c.robot_dimensions!.body },
      { ...o, width: 6, depth: 6 }), false);
    for (const z of c.zones) {
      assert(footprintCorners({ ...z, width: 12.6, depth: 12.6 }).every(p => p.x > 0 && p.x < 120 && p.z > 0 && p.z < 120));
      for (const other of c.zones) if (other !== z) assert(!footprintsOverlap({ ...z, width: 12.6, depth: 12.6 }, { ...other, width: 12.6, depth: 12.6 }));
    }
    if (c.objects.length >= 3) assert.deepEqual(c.objects.map(o => o.x), Array.from({ length: c.objects.length }, (_, i) => 24 + i * 12));
  }
});

test('boundary uses the outer 6 mm line edge and actual rotated corners', () => {
  const zone = warehouseLevels[0].scene_config.zones[0];
  assert(warehouseContains({ id: '1', x: zone.x + 3.3, z: zone.z }, zone));
  assert(!warehouseContains({ id: '1', x: zone.x + 3.301, z: zone.z }, zone));
  assert(warehouseContains({ id: '1', x: zone.x + 1, z: zone.z, heading: Math.PI / 4 }, zone));
  // A 45° cube extends 3√2 cm from its centre: offset 2 is inside 6.3, 2.1 is outside.
  assert(warehouseContains({ id: '1', x: zone.x + 2, z: zone.z, heading: Math.PI / 4 }, zone));
  assert(!warehouseContains({ id: '1', x: zone.x + 2.1, z: zone.z, heading: Math.PI / 4 }, zone));
});

test('each box needs its own zone; shared occupancy retracts delivery until separated', () => {
  const level = warehouseLevels[1], [zone, other] = level.scene_config.zones, scorer = new WarehouseDeliveryTracker(level);
  const a = evidence('1', zone.x - 3.05, zone.z - 3.05), b = evidence('2', zone.x + 3.05, zone.z + 3.05);
  assert(!footprintsOverlap({ ...a, width: 6, depth: 6 }, { ...b, width: 6, depth: 6 }));
  scorer.update([a], .4); assert.equal(scorer.completed, false);
  scorer.update([a, b], .39); assert.equal(scorer.completed, false);
  scorer.update([a, b], .01); assert.equal(scorer.completed, false);
  assert.deepEqual(scorer.delivered, {});
  scorer.update([a, { ...b, x: other.x, z: other.z }], .39);
  assert.equal(scorer.completed, false);
  scorer.update([a, { ...b, x: other.x, z: other.z }], .01);
  assert.equal(scorer.completed, true); assert.deepEqual(scorer.delivered, { '1': 'A', '2': 'B' });
  scorer.update([a, { ...b, released: false, holding: true }], .4);
  assert.equal(scorer.completed, false); assert.deepEqual(scorer.delivered, {});
});

test('grab/release eligibility, stability, delivery retraction and zone changes', () => {
  const level = warehouseLevels[2], [a, b, c] = level.scene_config.zones, scorer = new WarehouseDeliveryTracker(level);
  const one = evidence('1', a.x, a.z);
  for (const extra of [{ released: false }, { holding: true }, { speed: .6 }, { angularSpeed: .1 }]) {
    scorer.update([{ ...one, ...extra }], 2); assert.deepEqual(scorer.delivered, {});
  }
  scorer.update([one], .4); assert.deepEqual(scorer.delivered, { '1': 'A' });
  scorer.update([one], 20); assert.deepEqual(scorer.delivered, { '1': 'A' });
  scorer.update([{ ...one, holding: true }], .01); assert.deepEqual(scorer.delivered, {});
  scorer.update([evidence('1', b.x, b.z)], .4); assert.deepEqual(scorer.delivered, { '1': 'B' });
  scorer.update([evidence('1', b.x, b.z), evidence('2', a.x, a.z)], .4);
  assert.deepEqual(scorer.delivered, { '1': 'B', '2': 'A' }); assert.equal(scorer.completed, false);
  scorer.update([evidence('1', b.x, b.z), evidence('2', a.x, a.z), evidence('3', c.x, c.z)], .4);
  assert.equal(scorer.completed, true);
});

test('all boxes must be delivered and fit in separate ground placements in every level', () => {
  warehouseLevels.forEach(level => {
    const objects = level.scene_config.zones.map((zone, j) => evidence(String(j + 1), zone.x, zone.z));
    const scorer = new WarehouseDeliveryTracker(level);
    scorer.update(objects.slice(0, -1), .4);
    assert.equal(scorer.completed, false, `${level.demo_id} must wait for the last box`);
    scorer.update(objects, .4);
    assert.equal(scorer.completed, true, level.demo_id);
  });
});

test('real contact grasp succeeds at the specified start, release alone cannot award a delivery', () => {
  let now = 0;
  const session = new WarehouseSession(warehouseLevels[0], () => now);
  session.start(); session.press('g', 'grab');
  for (let i = 0; i < 240; i++) { now += 1000 / 120; session.tick(1 / 120); }
  assert.equal(session.snapshot().holding, '1');
  session.press('r', 'release');
  for (let i = 0; i < 240; i++) { now += 1000 / 120; session.tick(1 / 120); }
  assert.equal(session.snapshot().holding, null);
  assert.equal(session.snapshot().completed, false);
  assert.equal(session.snapshot().collected.length, 0);
});

test('no time limit; clearing inputs retains elapsed time; stop/reset have distinct results', () => {
  let now = 0;
  const session = new WarehouseSession(warehouseLevels[5], () => now);
  session.press('g', 'grab'); assert.equal(session.snapshot().gripper?.target, 'open');
  session.start(); session.press('w', 'forward'); session.clearInputs();
  now = 300_000; session.tick(.01);
  assert.equal(session.phase, 'running'); assert.equal(session.elapsed, 300);
  assert.equal(session.inputs.size, 0);
  session.stop(); now += 10000; session.tick(1);
  assert.equal(session.elapsed, 300); assert.equal(session.snapshot().completed, false);
  session.reset(); assert.equal(session.elapsed, 0); assert.equal(session.phase, 'ready');
});

test('releasing steering brakes chassis rotation after wall and cargo contact', () => {
  for (const where of ['start', 'open'] as const) for (const turn of ['turn_left', 'turn_right'] as const) {
    const level = structuredClone(warehouseLevels[5]);
    if (where === 'open') {
      level.scene_config.start = { x: 60, z: 60, heading: 0 };
      level.scene_config.objects = [{ id: '1', x: 60, z: 48 }];
    }
    const session = new WarehouseSession(level, () => 0);
    session.start();
    const tick = (seconds: number) => { for (let i = 0; i < seconds * 120; i++) session.tick(1 / 120); };
    session.press('steer', turn); tick(.5); session.release('steer');
    assert.equal(session.inputs.size, 0);
    tick(.5); // Allow the force-limited brake to stop the initial turn.
    const stopped = session.snapshot();
    tick(10);
    const after = session.snapshot(), context = `${where}: ${turn}`;
    assert(Math.abs(after.heading - stopped.heading) < .05 * Math.PI / 180, `${context}: heading drift`);
    assert(Math.hypot(after.x - stopped.x, after.z - stopped.z) < .05, `${context}: position drift`);
    assert(Math.abs(session.arena.robot.getAngularVelocity()) < .001, `${context}: residual rotation`);
  }
});

test('synchronized warehouse fingers retain cargo through a turn and stop without drifting', () => {
  for (const turn of ['turn_left', 'turn_right'] as const) {
    const level = structuredClone(warehouseLevels[0]);
    level.scene_config.start = { x: 60, z: 60, heading: 0 };
    level.scene_config.objects = [{ id: '1', x: 60, z: 48 }];
    const session = new WarehouseSession(level, () => 0);
    session.start();
    const tick = (seconds: number) => { for (let i = 0; i < seconds * 120; i++) session.tick(1 / 120); };
    session.press('grip', 'grab'); tick(1.5); session.release('grip');
    assert.equal(session.snapshot().holding, '1');
    session.press('steer', turn);
    for (let i = 0; i < 120; i++) {
      session.tick(1 / 120);
      const grip = session.snapshot().gripper!;
      assert.equal(session.snapshot().holding, '1');
      assert(Math.abs(grip.fingers[0] + grip.fingers[1]) < .1, 'keep the cargo centred within 1 mm');
    }
    session.clearInputs(); tick(.5);
    const stopped = session.snapshot();
    tick(10);
    assert(Math.abs(session.snapshot().heading - stopped.heading) < .05 * Math.PI / 180);
    assert.equal(session.snapshot().holding, '1');
    session.press('grip', 'release'); tick(2); session.release('grip');
    assert.equal(session.snapshot().holding, null);
    assert.equal(session.snapshot().gripper?.phase, 'open');
  }
});

test('completion freezes timer and controls; restart clears old release and delivery evidence', () => {
  let now = 0;
  const level = warehouseLevels[0], session = new WarehouseSession(level, () => now);
  session.start(); session.press('g', 'grab');
  const tick = (count: number) => { for (let i = 0; i < count; i++) { now += 1000 / 120; session.tick(1 / 120); } };
  tick(200); assert.equal(session.snapshot().holding, '1');
  session.press('r', 'release'); tick(200);
  // Inject a valid physical destination to isolate finish/clock logic from route driving.
  const cube = session.arena.cubes.get('1')!, goal = level.scene_config.zones[0];
  cube.setTransform(Vec2(goal.x / 10, goal.z / 10), Math.PI / 4);
  cube.setLinearVelocity(Vec2(0, 0)); cube.setAngularVelocity(0);
  tick(60);
  assert.equal(session.phase, 'completed');
  const elapsed = session.elapsed, pose = session.snapshot().x;
  now += 10000; session.press('w', 'forward'); session.tick(1);
  assert.equal(session.elapsed, elapsed); assert.equal(session.snapshot().x, pose);
  session.start(); assert.deepEqual(session.snapshot().delivered, {}); assert.equal(session.snapshot().collected.length, 0);
});
