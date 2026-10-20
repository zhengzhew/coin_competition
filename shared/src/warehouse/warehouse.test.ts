import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec2 } from 'planck';
import { footprintsOverlap, footprintCorners } from '../third/geometry.js';
import { warehouseLevels } from './levels.js';
import { warehouseContains, WarehouseDeliveryTracker, type WarehouseEvidence } from './rules.js';
import { WarehouseSession } from './session.js';
import { warehouseZoneRects, warehouseZoneEdges } from './geometry.js';

const evidence = (id: string, x: number, z: number, extra: Partial<WarehouseEvidence> = {}): WarehouseEvidence =>
  ({ id, x, z, heading: 0, holding: false, speed: 0, angularSpeed: 0, ...extra });

test('six warehouse levels preserve centres and counts with non-overlapping starts and zones', () => {
  assert.deepEqual(warehouseLevels.map(l => l.scene_config.objects.length), [1, 2, 3, 4, 6, 8]);
  assert.deepEqual(warehouseLevels.map(l => l.scene_config.zones.length), [1, 1, 2, 4, 6, 6]);
  assert.deepEqual(warehouseLevels.map(l => l.requiredCount), [1, 2, 3, 4, 6, 8]);
  assert.deepEqual(warehouseLevels.map(l => l.targetScore), [undefined, undefined, 14, 16, 20, 30]);
  for (const level of warehouseLevels) {
    const c = level.scene_config;
    assert.deepEqual([c.start.x, 120 - c.start.z], [12, 12]);
    assert.deepEqual([c.objects[0].x, 120 - c.objects[0].z], [24, 12]);
    for (const o of c.objects) assert.equal(footprintsOverlap(
      { ...c.start, width: c.robot_dimensions!.body, depth: c.robot_dimensions!.body },
      { ...o, width: 6, depth: 6 }), false);
    for (const zone of c.zones) for (const rect of warehouseZoneRects(zone)) {
      assert(footprintCorners(rect).every(p => p.x >= 6 && p.x <= 114 && p.z >= 6 && p.z <= 114));
      for (const other of c.zones) if (other !== zone) for (const otherRect of warehouseZoneRects(other))
        assert(!footprintsOverlap(rect, otherRect), 'regions have disjoint interiors; strokes stay inside each region');
      for (const object of c.objects) assert(!footprintsOverlap(rect, { ...object, width: 6, depth: 6 }), 'cargo starts clear of scoring regions');
    }
    for (const object of c.objects) for (const other of c.objects) if (object !== other) {
      assert(!footprintsOverlap({ ...object, width: 6, depth: 6 }, { ...other, width: 6, depth: 6 }));
    }
    assert.equal(new Set(c.objects.map(o => o.z)).size, level.demo_id === 'warehouse-6' ? 2 : 1);
  }
  assert.equal(warehouseLevels[1].scene_config.objects[1].x, 96);
  assert.deepEqual(warehouseLevels[2].scene_config.objects.map(o => o.x), [24, 60, 96]);
  assert.deepEqual(warehouseLevels[4].scene_config.zones, warehouseLevels[5].scene_config.zones);
});

test('stepped bands follow Euclidean cell-centre radii and mirror the two top corners', () => {
  const zones = warehouseLevels[5].scene_config.zones;
  assert.deepEqual(zones.map(z => z.points), [7, 7, 4, 4, 2, 2]);
  assert.deepEqual(zones.map(z => z.cells!.length), [1, 1, 5, 5, 5, 5]);
  assert.deepEqual(zones[0].cells, [{ x: 12, z: 12 }]);
  assert.deepEqual(zones[1].cells, [{ x: 108, z: 12 }]);
  for (let i = 0; i < zones.length; i += 2) {
    const left = zones[i], right = zones[i + 1];
    assert.deepEqual(right.cells, left.cells!.map(cell => ({ x: 120 - cell.x, z: cell.z })));
    for (const cell of left.cells!) {
      const d2 = ((cell.x - 12) / 12) ** 2 + ((cell.z - 12) / 12) ** 2;
      assert(left.points === 7 ? d2 === 0 : left.points === 4 ? d2 > 0 && d2 <= 4 : d2 > 4 && d2 <= 9);
      assert(warehouseContains({ id: '1', ...cell }, left));
    }
  }
  for (let x = 6; x <= 114; x += 1.5) for (let z = 6; z <= 60; z += 1.5)
    assert(zones.filter(zone => warehouseContains({ id: '1', x, z, heading: Math.PI / 4 }, zone)).length <= 1, 'no ambiguous score near shared boundaries');
});

test('visible scoring border cannot be touched, including rotated corners; internal grid is not a border', () => {
  const zone = warehouseLevels[0].scene_config.zones[0];
  assert(warehouseContains({ id: '1', x: zone.x + 2.699, z: zone.z }, zone));
  assert(!warehouseContains({ id: '1', x: zone.x + 2.7, z: zone.z }, zone));
  assert(!warehouseContains({ id: '1', x: zone.x + 3, z: zone.z }, zone));
  assert(warehouseContains({ id: '1', x: zone.x + 1, z: zone.z, heading: Math.PI / 4 }, zone));
  assert(!warehouseContains({ id: '1', x: zone.x + 1.5, z: zone.z, heading: Math.PI / 4 }, zone));
  const wide = warehouseLevels[1].scene_config.zones[0];
  assert(warehouseContains({ id: '1', x: wide.x + 6, z: wide.z }, wide));
});

test('stepped region containment rejects concave crossings but permits same-colour internal grid crossings', () => {
  const four = warehouseLevels[3].scene_config.zones[2];
  assert(warehouseContains({ id: '1', x: 30, z: 12 }, four), 'shared edge between two 4-point cells is not a border');
  assert(!warehouseContains({ id: '1', x: 18, z: 12 }, four), '7/4 boundary is a border');
  assert(!warehouseContains({ id: '1', x: 42, z: 12 }, four), '4/2 boundary is a border');
  // This diamond has four corners inside the L-shaped region but cuts across its concave notch.
  const notched = { id: 'notched', x: 0, z: 0, color: '#000', cells: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 0, z: 12 }] };
  assert(!warehouseContains({ id: '1', x: 5.5, z: 5.5, heading: Math.PI / 4 }, notched));
  assert.equal(warehouseZoneEdges(notched).length, 8, 'two internal shared edges are removed');
});

test('two boxes can complete level two inside the same continuous three-cell region', () => {
  const level = warehouseLevels[1], [zone] = level.scene_config.zones, scorer = new WarehouseDeliveryTracker(level);
  const a = evidence('1', zone.x - 6, zone.z), b = evidence('2', zone.x + 6, zone.z);
  assert(!footprintsOverlap({ ...a, width: 6, depth: 6 }, { ...b, width: 6, depth: 6 }));
  scorer.update([a], .4); assert.equal(scorer.completed, false);
  scorer.update([a, b], .39); assert.equal(scorer.completed, false);
  scorer.update([a, b], .01); assert.equal(scorer.completed, true);
  assert.deepEqual(scorer.delivered, { '1': 'A', '2': 'A' });
  scorer.update([a, { ...b, holding: true }], .4);
  assert.equal(scorer.completed, false); assert.deepEqual(scorer.delivered, { '1': 'A' });
});

test('unheld stable cargo scores regardless of transport method; retraction and zone changes', () => {
  const level = warehouseLevels[3], [a, b, c] = level.scene_config.zones, scorer = new WarehouseDeliveryTracker(level);
  const one = evidence('1', a.x, a.z);
  for (const extra of [{ holding: true }, { speed: .6 }, { angularSpeed: .1 }]) {
    scorer.update([{ ...one, ...extra }], 2); assert.deepEqual(scorer.delivered, {});
  }
  scorer.update([one], .4); assert.equal(scorer.score, 7);
  scorer.update([one], 20); assert.equal(scorer.score, 7);
  scorer.update([{ ...one, holding: true }], .01); assert.equal(scorer.score, 0);
  scorer.update([evidence('1', c.x, c.z)], .4); assert.equal(scorer.score, 4);
  scorer.update([evidence('1', c.x, c.z), evidence('2', a.x, a.z)], .4);
  assert.equal(scorer.score, 11); assert.equal(scorer.completed, false);
  scorer.update([evidence('1', c.x, c.z), evidence('2', a.x, a.z), evidence('3', b.x, b.z)], .4);
  assert.equal(scorer.score, 18); assert.equal(scorer.completed, true, 'exceeding the target is valid');
  scorer.update([evidence('1', c.x, c.z), evidence('2', a.x + 60, a.z)], .4);
  assert.equal(scorer.score, 4, 'moving or removing cargo retracts its score');
});

test('scoring targets allow distinct decompositions and stop before unused boxes are delivered', () => {
  const combinations = [
    { index: 2, zones: ['A', 'B'], score: 14 },
    { index: 3, zones: ['A', 'B', 'C'], score: 18 },
    { index: 3, zones: ['C', 'C', 'D', 'D'], score: 16 },
    { index: 4, zones: ['A', 'B', 'C', 'E'], score: 20 },
    { index: 4, zones: ['A', 'C', 'C', 'D', 'F'], score: 21 },
    { index: 4, zones: ['C', 'C', 'D', 'D', 'E', 'F'], score: 20 },
    { index: 5, zones: ['A', 'B', 'C', 'C', 'D', 'D'], score: 30 },
    { index: 5, zones: ['A', 'C', 'C', 'C', 'D', 'D', 'D'], score: 31 },
    { index: 5, zones: ['C', 'C', 'C', 'C', 'D', 'D', 'D', 'F'], score: 30 },
  ];
  for (const { index, zones, score } of combinations) {
    const level = warehouseLevels[index], used = new Map<string, number>();
    const objects = zones.map((id, j) => {
      const zone = level.scene_config.zones.find(z => z.id === id)!;
      const slot = used.get(id) ?? 0; used.set(id, slot + 1);
      const cell = zone.cells![slot];
      return evidence(String(j + 1), cell.x, cell.z);
    });
    for (const object of objects) for (const other of objects) if (object !== other)
      assert(!footprintsOverlap({ ...object, width: 6, depth: 6 }, { ...other, width: 6, depth: 6 }));
    const scorer = new WarehouseDeliveryTracker(level);
    scorer.update(objects.slice(0, -1), .4);
    assert.equal(scorer.completed, false, `${level.demo_id} below target`);
    scorer.update(objects, .4);
    assert.equal(scorer.score, score); assert.equal(scorer.completed, true, level.demo_id);
  }
});

test('unknown boxes cannot award points and a missing box must settle again when it returns', () => {
  const level = warehouseLevels[2], zone = level.scene_config.zones[0], scorer = new WarehouseDeliveryTracker(level);
  scorer.update([evidence('unknown', zone.x, zone.z)], 1); assert.equal(scorer.score, 0);
  scorer.update([evidence('1', zone.x, zone.z)], .3);
  scorer.update([], .1);
  scorer.update([evidence('1', zone.x, zone.z)], .1); assert.equal(scorer.score, 0);
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

test('real pushing without G or R can complete delivery and score targets after stopping', () => {
  for (const scored of [false, true]) {
    const level = structuredClone(warehouseLevels[0]);
    level.scene_config.start = { x: 60, z: 60, heading: 0 };
    level.scene_config.objects = [{ id: '1', x: 60, z: 48 }];
    level.scene_config.zones = [{ id: 'push', x: 60, z: 36, width: 12, depth: 12, color: '#319581', points: scored ? 4 : 0 }];
    level.targetScore = scored ? 4 : undefined;
    let now = 0;
    const session = new WarehouseSession(level, () => now);
    const tick = (count: number) => { for (let i = 0; i < count; i++) { now += 1000 / 120; session.tick(1 / 120); } };
    session.start(); session.press('drive', 'forward'); tick(90);
    assert.equal(session.snapshot().completed, false, 'moving cargo is not settled');
    session.release('drive'); tick(120);
    assert.equal(session.snapshot().holding, null);
    assert.equal(session.snapshot().gripper?.target, 'open', 'no grip or release was needed');
    assert.equal(session.snapshot().completed, true, JSON.stringify(session.snapshot()));
    assert.equal(session.snapshot().score, scored ? 4 : 0);
    assert.deepEqual(session.snapshot().delivered, { '1': 'push' });
    const elapsed = session.elapsed; now += 1000; session.tick(.1);
    assert.equal(session.elapsed, elapsed, 'pushed deliveries freeze the timer too');
  }
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

test('completion freezes timer and controls; restart clears old delivery evidence', () => {
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
