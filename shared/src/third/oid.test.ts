import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotSession } from '../gameplay/robot/session.js';
import { compileThirdProgram, migrateThirdProgramCommands } from './program.js';
import { thirdSample } from './samples.js';
import type { ThirdDemo } from './types.js';

function arena(category: 'collect' | 'place' = 'place') {
  const demo = thirdSample(category, 'simulation3d');
  demo.scene_config.walls = [];
  demo.scene_config.objects = [{ id: 'A', x: 15, z: 15, goal: { x: 15, z: 100 } }];
  return demo;
}
function run(source: string, demo = arena(), dt = 1 / 60) {
  const session = new RobotSession(demo, 'auto'); session.start(source);
  for (let i = 0; i < Math.ceil(120 / dt) + 1 && session.phase === 'running'; i++) session.tick(dt);
  return session;
}
function near(actual: number, expected: number, tolerance = 1e-7) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} expected ${expected} +/- ${tolerance}`); }
function heading(actual: number, expected: number) { near(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)), 0); }

test('old local precision drafts migrate command names while preserving comments and indentation', () => {
  assert.equal(migrateThirdProgramCommands('# oid_move_to is an old name\nfor i in range(2):\n    oid_move_to(54,48)\n    oid_turn_to(90)'), '# oid_move_to is an old name\nfor i in range(2):\n    move_to(54,48)\n    turn_to(90)');
});

test('精准定位 arguments use absolute centimetre coordinates, allow zero, validate arity and reject unsupported grid commands', () => {
  const demo = arena();
  assert.deepEqual(compileThirdProgram('move_to(0, 120)\nturn_to(360)\nforward_time(0.5)', demo), [
    { action: 'move_to', x: 0, y: 120, line: 1 }, { action: 'turn_to', value: 0, line: 2 }, { action: 'forward_time', value: .5, line: 3 },
  ]);
  for (const source of ['move_to(1)', 'move_to(1,2,3)', 'move_to(10.5,20)', 'move_to(121,20)', 'move_to(-1,20)', 'move_to(1+1,20)', 'turn_to()', 'turn_to(361)', 'forward_time()', 'forward_time(0)', 'backward_time(121)']) assert.throws(() => compileThirdProgram(source, demo), /第 1 行/);
  for (const source of ['move_to(1,2)', 'turn_to(90)', 'forward_time(1)', 'backward_time(1)']) assert.throws(() => compileThirdProgram(source, thirdSample('collect', 'grid')), /仅用于 3D/);
  assert.throws(() => compileThirdProgram('for i in range(20):\n    forward_time(10)', demo), /120 秒/);
  assert.throws(() => compileThirdProgram('for i in range(20):\n    move_to(90,90)\n    move_to(30,30)', demo), /120 秒/);
});

for (const category of ['collect', 'place'] as const) {
  test(`${category}: 精准定位 reaches the exact centre and absolute heading, repeated routes do not accumulate error`, () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      const session = run('move_to(65,55)\nturn_to(123.5)\nwait(1)\nmove_to(54,24)\nturn_to(0)\nwait(1)', arena(category), dt);
      const state = session.snapshot();
      assert.doesNotMatch(state.message, /受阻|120 秒/); near(state.x, 54); near(state.z, 96); heading(state.heading, 0);
      assert.equal(state.oid?.phase, 'holding');
    }
  });
  test(`${category}: 精准定位 cruises at half normal linear and angular speed`, () => {
    const reachSecondLine = (source: string) => {
      const session = new RobotSession(arena(category), 'auto'); session.start(`${source}\nwait(1)`);
      for (let i = 0; i < 1200 && session.phase === 'running' && session.line !== 2; i++) session.tick(1 / 60);
      assert.equal(session.line, 2, session.snapshot().message); return session.elapsed;
    };
    const normal = reachSecondLine('forward(18)'), oid = reachSecondLine('move_to(54,42)');
    near(oid / normal, 2, .12);
    const normalTurn = reachSecondLine('turn_right(90)'), oidTurn = reachSecondLine('turn_to(90)');
    near(oidTurn / normalTurn, 2, .15);
  });
  test(`${category}: ordinary timed travel and distance/精准定位 instructions can be mixed`, () => {
    const session = run('forward_time(0.5)\nbackward_time(0.5)\nforward(12)\nmove_to(54,48)\nturn_to(90)\nforward_time(0.5)', arena(category));
    const state = session.snapshot();
    assert.doesNotMatch(state.message, /受阻|120 秒/);
    near(state.x, 63, .2); near(state.z, 72, .2); near(state.heading, Math.PI / 2, .001);
    assert.equal(state.oid, undefined, 'ordinary movement releases 精准定位 hold');
  });
  test(`${category}: obstacles and field boundaries block 精准定位 without teleporting`, () => {
    const demo = arena(category); demo.scene_config.start = { x: 60, z: 90, heading: 0 };
    demo.scene_config.walls = [{ x: 60, z: 50, width: 12, depth: 12 }];
    const blocked = run('move_to(60,90)', demo).snapshot();
    assert.match(blocked.message, /受阻/); assert.ok(blocked.z > 65); assert.equal(blocked.completed, false);
    const edge = run('move_to(54,0)', arena(category)).snapshot();
    assert.match(edge.message, /受阻/); assert.ok(edge.z < 111);
  });
}

test('collect 精准定位 finishes at the requested point, rather than stopping at collection radius', () => {
  const demo = arena('collect'); demo.scene_config.objects = [{ id: 'A', x: 54, z: 72 }];
  const result = run('move_to(54,48)', demo).snapshot();
  assert.equal(result.phase, 'completed'); near(result.x, 54); near(result.z, 72);
});
test('精准定位 contact transport retains gripper physics, and position holds during grab/release/wait', () => {
  const demo = thirdSample('place', 'simulation3d');
  const session = run('grab()\nmove_to(54,48)\nturn_to(90)\nmove_to(84,48)\nturn_to(180)\nrelease()\nwait(1)', demo);
  const state = session.snapshot();
  assert.equal(state.phase, 'completed', state.message); near(state.x, 84); near(state.z, 72); heading(state.heading, Math.PI);
  assert.equal(state.holding, null); assert.deepEqual(state.collected, ['A']);
});
test('stop, reset, no-op coordinates, angular wrap and zero dt are safe', () => {
  const demo = arena(); demo.scene_config.start.heading = 359 * Math.PI / 180;
  const wrapped = run('turn_to(1)', demo); heading(wrapped.snapshot().heading, Math.PI / 180); assert.ok(wrapped.elapsed < 1.2);
  const session = new RobotSession(arena(), 'auto'); session.start('move_to(54,24)\nturn_to(0)\nmove_to(54,48)');
  session.tick(0); near(session.elapsed, 0);
  for (let i = 0; i < 30; i++) session.tick(1 / 60);
  session.stop(); const stopped = session.snapshot(); session.tick(5); assert.deepEqual(session.snapshot(), stopped);
  session.reset(); near(session.snapshot().x, 54); near(session.snapshot().z, 96); assert.equal(session.snapshot().oid, undefined);
});
