import test from 'node:test';
import assert from 'node:assert/strict';
import { ThirdEngine } from './engine.js';
import { thirdSample } from './samples.js';
import { compileThirdProgram } from './program.js';
import type { ThirdDemo } from './types.js';
import { THIRD_DIMENSIONS, thirdMapPosition } from './geometry.js';
import { ThirdPhysicsArena } from './physics.js';

function execute(demo: ThirdDemo, source = demo.starter, dt = 1 / 60) {
  const engine = new ThirdEngine(demo);
  for (const command of compileThirdProgram(source, demo)) {
    engine.act(command.action);
    if (engine.physical && demo.scene_config.kind === 'simulation3d') {
      const c = demo.scene_config;
      const drive = command.action === 'forward' || command.action === 'backward';
      const turn = command.action === 'turn_left' || command.action === 'turn_right';
      const sign = command.action === 'backward' || command.action === 'turn_left' ? -1 : 1;
      let remaining = turn ? command.value * Math.PI / 180 : command.value;
      for (let t = 0; t < 12 && !engine.snapshot().completed; t += dt) {
        const before = engine.snapshot();
        engine.stepPhysics(dt, drive ? sign * Math.min(c.speed, remaining / dt) : 0, turn ? sign * Math.min(c.turnSpeed, remaining / dt) : 0);
        const after = engine.snapshot();
        if (drive) remaining -= sign * ((after.x - before.x) * Math.sin(before.heading) - (after.z - before.z) * Math.cos(before.heading));
        else if (turn) remaining -= sign * (after.heading - before.heading);
        else if (command.action === 'wait') remaining -= dt;
        else if (['open', 'closed', 'holding', 'blocked'].includes(after.gripper!.phase)) break;
        if (remaining <= 1e-6 && (drive || turn || command.action === 'wait')) break;
        assert.equal(after.blocked, false, `physical sample blocked on ${command.action}`);
      }
    } else if (demo.scene_config.kind === 'simulation3d') {
      const move = command.action === 'forward' || command.action === 'backward';
      const turn = command.action === 'turn_left' || command.action === 'turn_right';
      if (move || turn) {
        let remaining = turn ? command.value * Math.PI / 180 : command.value;
        while (remaining > 1e-8 && !engine.snapshot().completed) {
          const amount = Math.min(remaining, dt * (move ? demo.scene_config.speed : demo.scene_config.turnSpeed));
          if (move) engine.move(amount * (command.action === 'forward' ? 1 : -1));
          else engine.turn(amount * (command.action === 'turn_right' ? 1 : -1));
          remaining -= amount;
          assert.equal(engine.snapshot().blocked, false, `sample path blocked on ${command.action}`);
        }
      }
    }
  }
  if (engine.physical) for (let t = 0; t < 1; t += dt) engine.stepPhysics(dt);
  return engine;
}

for (const category of ['collect', 'place'] as const) for (const simulation of ['grid', 'simulation3d'] as const) {
  test(`${category}/${simulation}: sample completes, collected targets are unique, reset restores everything`, () => {
    const demo = thirdSample(category, simulation), engine = execute(demo);
    const completed = engine.snapshot();
    assert.equal(completed.completed, true);
    assert.equal(completed.collected.length, demo.scene_config.objects.length);
    engine.act('release'); engine.move(1);
    assert.deepEqual(engine.snapshot(), completed);
    engine.reset(); assert.equal(engine.snapshot().completed, false); assert.deepEqual(engine.snapshot().collected, []);
    assert.equal(engine.snapshot().holding, null); assert.equal(engine.snapshot().x, demo.scene_config.start.x);
    assert.equal(engine.snapshot().z, demo.scene_config.start.z);
  });
}
test('grid movement stays integral; continuous movement has fractional positions and blocks the boundary', () => {
  const grid = new ThirdEngine(thirdSample('collect', 'grid')); grid.act('turn_left'); grid.act('forward');
  assert.equal(grid.snapshot().z, 3);
  const engine = new ThirdEngine(thirdSample('collect', 'simulation3d'));
  engine.move(-.125); assert.ok(Math.abs(engine.snapshot().z - 96.125) < 1e-9);
  engine.move(-100); assert.equal(engine.snapshot().blocked, true); assert.ok(engine.snapshot().z <= 110.5 + 1e-9);
});
test('released cargo retains its physical pose and can be gripped again', () => {
  const p = new ThirdPhysicsArena(thirdSample('place', 'simulation3d'));
  p.act('grab'); advance(p, 2); assert.equal(p.snapshot().holding, 'A');
  const before = p.snapshot().objects[0]; p.act('release'); advance(p, 2);
  const after = p.snapshot(); assert.equal(after.holding, null); assert.equal(after.completed, false);
  assert.ok(Math.hypot(after.objects[0].x - before.x, after.objects[0].z - before.z) < 1);
  p.act('grab'); advance(p, 2); assert.equal(p.snapshot().holding, 'A');
});

test('3D sample succeeds at different controller intervals within contact tolerances', () => {
  const demo = thirdSample('place', 'simulation3d');
  const slow = execute(demo, demo.starter, 1 / 30).snapshot();
  const fast = execute(demo, demo.starter, 1 / 144).snapshot();
  assert.deepEqual(slow.collected, fast.collected); assert.equal(slow.completed, true);
  assert.ok(Math.abs(slow.x - fast.x) < 2); assert.ok(Math.abs(slow.z - fast.z) < 2);
});

test('program compiler rejects evaluation, invalid arguments and runaway expansion', () => {
  const demo = thirdSample('collect', 'grid');
  for (const source of ['import os', 'forward(-1)', 'forward(1 + 1)', 'forward(Infinity)', 'forward(.5)', 'turn_left(45)',
    'grab()', 'forward(1)\n    forward(1)', 'for i in range(20):\n    for i in range(20):\n        forward(10)', 'for i in range(2):']) {
    assert.throws(() => compileThirdProgram(source, demo), source);
  }
  assert.throws(() => compileThirdProgram('for i in range(20):\n    wait(10)', demo), /120/);
  const commands = compileThirdProgram('for i in range(2):\n    forward(1)\nturn_right()', demo);
  assert.equal(commands.length, 3); assert.deepEqual(commands.map(c => c.line), [2, 2, 3]);
});
test('snapshot is isolated from external mutation', () => {
  const engine = new ThirdEngine(thirdSample('place', 'simulation3d'));
  const snapshot = engine.snapshot(); snapshot.objects[0].goal!.x = 999; snapshot.collected.push('fake');
  assert.equal(engine.snapshot().objects[0].goal!.x, 84); assert.deepEqual(engine.snapshot().collected, []);
});

test('physical map uses centimetres and lower-left display coordinates', () => {
  const config = thirdSample('collect', 'simulation3d').scene_config;
  assert.equal(config.width, 120); assert.equal(config.depth, 120);
  assert.equal(config.width / THIRD_DIMENSIONS.cell, 10);
  assert.deepEqual(thirdMapPosition(0, 120, 120), { x: 0, y: 0 });
  assert.deepEqual(thirdMapPosition(120, 0, 120), { x: 120, y: 120 });
  const demo = thirdSample('collect', 'simulation3d'); demo.scene_config.walls = [];
  const engine = new ThirdEngine(demo); engine.move(12);
  assert.deepEqual(thirdMapPosition(engine.snapshot().x, engine.snapshot().z, 120), { x: 54, y: 36 });
  assert.equal(compileThirdProgram('forward(120)', demo)[0].value, 120);
  assert.throws(() => compileThirdProgram('forward(120.1)', demo), /120 cm/);
});

test('square body, extended gripper and rotation cannot cross field edges or walls', () => {
  const demo = thirdSample('collect', 'simulation3d'); demo.scene_config.walls = []; demo.scene_config.objects = [{id: 'unused', x: 115, z: 115}];
  demo.scene_config.start = { x: 60, z: 60, heading: 0 };
  const engine = new ThirdEngine(demo); engine.move(100);
  assert.equal(engine.snapshot().blocked, true); assert.ok(Math.abs(engine.snapshot().z - 15.5) < .26);
  engine.reset(); engine.move(-100);
  assert.ok(Math.abs(engine.snapshot().z - 110.5) < .26);
  demo.scene_config.start = { x: 10, z: 60, heading: 0 };
  const corner = new ThirdEngine(demo); corner.turn(Math.PI / 2);
  assert.equal(corner.snapshot().blocked, true); assert.ok(corner.snapshot().heading < Math.PI / 2);
  demo.scene_config.start = { x: 60, z: 60, heading: 0 };
  demo.scene_config.walls = [{ x: 60, z: 30, width: 12, depth: 12 }];
  const wall = new ThirdEngine(demo); wall.move(100);
  assert.equal(wall.snapshot().blocked, true); assert.ok(Math.abs(wall.snapshot().z - 51.5) < .26);
});

function advance(p: ThirdPhysicsArena, seconds: number, speed = 0, turn = 0) {
  for (let t = 0; t < seconds - 1e-8; t += 1 / 120) p.step(1 / 120, speed, turn);
}
function arena(objects: { id: string; x: number; z: number; goal?: { x: number; z: number } }[], start = { x: 60, z: 90, heading: 0 }) {
  const d = thirdSample('place', 'simulation3d'); d.scene_config.walls = []; d.scene_config.objects = objects; d.scene_config.start = start;
  return new ThirdPhysicsArena(d);
}
test('empty closure animates and blocks distant magnetic grabs', () => {
  const p = arena([{ id: 'A', x: 60, z: 50 }]);
  p.act('grab'); assert.equal(p.snapshot().gripper!.phase, 'closing');
  advance(p, .2); assert.ok(p.snapshot().gripper!.gap > 6);
  advance(p, 2); assert.equal(p.snapshot().holding, null); assert.equal(p.snapshot().gripper!.phase, 'closed');
  assert.ok(Math.abs(p.snapshot().objects[0].z - 50) < .01);
});
test('body pushes chains of cubes; the wall blocks the chain without tunnelling', () => {
  const p = arena([{ id: 'A', x: 60, z: 77 }, { id: 'B', x: 60, z: 69 }]);
  advance(p, 2, 18); const pushed = p.snapshot();
  assert.ok(pushed.objects.every(o => o.z < 50)); assert.equal(pushed.holding, null);
  advance(p, 8, 18); const walled = p.snapshot();
  assert.ok(walled.objects.every(o => o.z >= 2.8));
  assert.ok(Math.hypot(walled.objects[0].x - walled.objects[1].x, walled.objects[0].z - walled.objects[1].z) > 5.5);
  assert.ok(walled.z >= 15); // A chain may rotate or slide along the wall, but must not cross it.
});
test('off-centre contact turns a cube; floor friction slows it after contact ends', () => {
  const p = arena([{ id: 'A', x: 70, z: 73 }]);
  advance(p, 1.4, 18); assert.ok(Math.abs(p.snapshot().objects[0].heading || 0) > .05);
  advance(p, .6, -18); advance(p, 2);
  const b = p.cubes.get('A')!; assert.ok(b.getLinearVelocity().length() < .01); assert.ok(Math.abs(b.getAngularVelocity()) < .01);
});
test('open jaws leave their middle free and closed empty jaws cannot capture without contact', () => {
  const p = arena([{ id: 'A', x: 60, z: 77.5 }]);
  advance(p, .3); assert.equal(p.snapshot().holding, null); assert.ok(Math.abs(p.snapshot().objects[0].z - 77.5) < .2);
  p.act('grab'); advance(p, 2); assert.equal(p.snapshot().holding, 'A');
  const before = p.snapshot().objects[0]; advance(p, .6, 18);
  assert.ok(p.snapshot().objects[0].z < before.z - 8);
  p.act('release'); advance(p, 2); assert.equal(p.snapshot().gripper!.phase, 'open');
  const released = p.snapshot().objects[0]; advance(p, 1, -18);
  assert.ok(Math.hypot(p.snapshot().objects[0].x - released.x, p.snapshot().objects[0].z - released.z) < 1);
});
test('linked fingers keep their centre on the chassis during loaded turns', () => {
  const p = arena([{ id: 'A', x: 60, z: 77.5 }]); p.act('grab'); advance(p, 2);
  assert.equal(p.snapshot().holding, 'A');
  for (let i = 0; i < 120; i++) {
    p.step(1 / 120, 0, Math.PI / 2);
    const [left, right] = p.snapshot().gripper!.fingers;
    assert.ok(Math.abs(left + right) < .1, 'fingers should stay mechanically symmetric');
  }
  assert.equal(p.snapshot().holding, 'A');
});
test('goal occupancy is not snapped or latched and delivery requires the entire settled cube', () => {
  const p = arena([{ id: 'A', x: 61, z: 60, goal: { x: 60, z: 60 } }, { id: 'B', x: 100, z: 40, goal: { x: 100, z: 20 } }]);
  advance(p, .2); assert.deepEqual(p.snapshot().collected, []);
  advance(p, .3); assert.deepEqual(p.snapshot().collected, ['A']); assert.equal(p.snapshot().objects[0].x, 61);
  advance(p, 3, 18); assert.ok(!p.snapshot().collected.includes('A')); assert.equal(p.snapshot().completed, false);
  const edge = arena([{ id: 'A', x: 64, z: 60, goal: { x: 60, z: 60 } }]);
  advance(edge, 1); assert.equal(edge.snapshot().completed, false);
});
