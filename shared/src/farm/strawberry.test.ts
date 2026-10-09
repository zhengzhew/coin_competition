import test from 'node:test';
import assert from 'node:assert/strict';
import { strawberryLevels, STRAWBERRY_POSITIONS } from './levels.js';
import { compileStrawberryProgram, solveStrawberryRoute, strawberryScore, StrawberryGridEngine } from './strawberry.js';
import { createRobotRuntime, validateRobotScenario } from '../gameplay/robot/runtime.js';
import type { ThirdDemo } from '../third/types.js';

function execute(demo: ThirdDemo, source: string) {
  const session = createRobotRuntime(demo, 'auto'); session.start(source);
  for (let i = 0; i < 7200 && session.phase === 'running'; i++) session.tick(1 / 60);
  return session;
}
function fixture(start: [number, number], berry: [number, number], heading = 0): ThirdDemo {
  const demo = structuredClone(strawberryLevels[0]);
  demo.scene_config.start = { x: start[0], z: 7 - start[1], heading };
  demo.scene_config.objects = [{ id: 'a', x: berry[0], z: 7 - berry[1] }]; return demo;
}

test('three 8x8 levels use the specified zero-based coordinates and programming only', () => {
  assert.deepEqual(STRAWBERRY_POSITIONS, [[[4, 4]], [[3, 3], [6, 5]], [[6, 2], [6, 4], [5, 3], [5, 5]]]);
  for (const demo of strawberryLevels) {
    validateRobotScenario(demo, 'auto');
    assert.deepEqual(demo.scene_config.start, { x: 0, z: 7, heading: 0 });
    assert.deepEqual([demo.scene_config.width, demo.scene_config.depth], [8, 8]);
    assert.throws(() => createRobotRuntime(demo, 'manual'), /不受支持/);
  }
});
test('signed move expands cell-by-cell; rotations and interactions take no arguments', () => {
  const commands = compileStrawberryProgram('# 注释\nmove(2)\nmove(-1)\nturn_left()\nturn_right()\ngrab()\nrelease()');
  assert.deepEqual(commands.map(c => c.action), ['forward', 'forward', 'backward', 'turn_left', 'turn_right', 'grab', 'release']);
  assert.deepEqual(commands.map(c => c.line), [2, 2, 3, 4, 5, 6, 7]);
  for (const source of ['move(1.5)', 'move(0)', 'move(65)', 'move(x)', 'turn_left(90)', 'forward(1)', 'grab(1)', 'oid_move_to(1,2)', 'move(1); release()', 'import os', 'for i in range(2):\n    move(1)']) assert.throws(() => compileStrawberryProgram(source), /第/);
  assert.throws(() => compileStrawberryProgram('move(64)\n'.repeat(5)), /256/);
  assert.throws(() => compileStrawberryProgram('# only comments'), /先写/);
});
test('picking requires the front orthogonal neighbor, then only one berry may be carried', () => {
  const engine = new StrawberryGridEngine(fixture([3, 3], [4, 3]));
  engine.act('grab'); assert.equal(engine.snapshot().holding, null); assert.match(engine.snapshot().message, /前方相邻格/);
  engine.act('turn_right'); engine.act('grab'); assert.equal(engine.snapshot().holding, 'a');
  engine.act('grab'); assert.equal(engine.snapshot().holding, 'a'); assert.match(engine.snapshot().message, /只能携带一株/);
  engine.act('release'); assert.equal(engine.snapshot().holding, 'a'); assert.equal(engine.snapshot().collected.length, 0);
  assert.match(engine.snapshot().message, /任意边缘/);
  engine.act('forward'); assert.equal(engine.snapshot().x, 4); assert.equal(engine.snapshot().steps, 1, 'picked cell becomes traversable');
  const diagonal = new StrawberryGridEngine(fixture([3, 3], [4, 4])); diagonal.act('grab'); assert.equal(diagonal.snapshot().holding, null);
});
test('all four edges accept delivery at the car position regardless of heading', () => {
  for (const [start, berry, heading] of [
    [[0, 3], [1, 3], Math.PI / 2], [[7, 3], [6, 3], 3 * Math.PI / 2],
    [[3, 0], [3, 1], 0], [[3, 7], [3, 6], Math.PI],
  ] as Array<[[number, number], [number, number], number]>) {
    const engine = new StrawberryGridEngine(fixture(start, berry, heading));
    engine.act('release'); assert.equal(engine.snapshot().completed, false);
    engine.act('grab'); engine.act('turn_right'); engine.act('release');
    assert.equal(engine.snapshot().completed, true); assert.equal(engine.snapshot().steps, 0);
    assert.deepEqual(engine.snapshot().collected, ['a']); engine.act('release'); assert.deepEqual(engine.snapshot().collected, ['a']);
  }
});
test('movement cannot cross a plant or boundary and counts each successful forward/backward cell', () => {
  let session = execute(strawberryLevels[0], 'move(1)\nmove(-1)\nturn_left()\nmove(1)');
  assert.equal(session.snapshot().steps, 2); assert.equal(session.phase, 'stopped'); assert.match(session.snapshot().message, /驶出棋盘/);
  session = execute(strawberryLevels[0], 'move(4)\nturn_right()\nmove(6)');
  assert.equal(session.snapshot().steps, 7); assert.equal(session.snapshot().x, 3); assert.match(session.snapshot().message, /草莓所在格/);
  assert.equal(strawberryScore(7, 10, session.snapshot().completed), 0);
});
test('solver matches the analytical one-plant optimum throughout the interior', () => {
  for (let x = 1; x < 7; x++) for (let y = 1; y < 7; y++) {
    // A path to any neighbor via left/bottom avoids the plant; then take its closest edge.
    const expected = Math.min(...[[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].map(([a, b]) => a + b + Math.min(a, b, 7 - a, 7 - b)));
    assert.equal(solveStrawberryRoute(fixture([0, 0], [x, y])).steps, expected, `${x},${y}`);
  }
});
test('all optimal route witnesses complete, require one delivery per plant, and score 100', () => {
  strawberryLevels.forEach((demo, i) => {
    const solution = solveStrawberryRoute(demo), session = execute(demo, solution.program), s = session.snapshot();
    assert.equal(solution.steps, [10, 12, 16][i]); assert.equal(s.completed, true); assert.equal(s.holding, null);
    assert.equal(s.collected.length, demo.scene_config.objects.length); assert.equal(s.steps, solution.steps);
    assert.equal(strawberryScore(s.steps!, solution.steps, s.completed), 100);
    const longer = execute(demo, `move(1)\nmove(-1)\n${solution.program}`).snapshot();
    assert.equal(longer.completed, true); assert.equal(longer.steps, solution.steps + 2);
    assert.ok(strawberryScore(longer.steps!, solution.steps, true) < 100);
    session.reset(); assert.equal(session.snapshot().steps, 0); assert.equal(session.snapshot().collected.length, 0);
  });
});
test('partial delivery is not completion; re-running starts fresh; snapshots do not leak mutations', () => {
  const demo = strawberryLevels[1], solution = solveStrawberryRoute(demo);
  const prefix = solution.program.slice(0, solution.program.indexOf('release()') + 'release()'.length);
  const session = execute(demo, prefix);
  assert.equal(session.snapshot().collected.length, 1); assert.equal(session.snapshot().completed, false);
  const snapshot = session.snapshot(); snapshot.objects[0].x = 99; snapshot.collected.push('fake');
  assert.notEqual(session.snapshot().objects[0].x, 99); assert.equal(session.snapshot().collected.length, 1);
  session.start('move(1)'); assert.equal(session.snapshot().steps, 0); assert.equal(session.snapshot().collected.length, 0);
  session.tick(1 / 60); assert.equal(session.snapshot().steps, 1);
  session.stop(); session.tick(5); assert.equal(session.snapshot().steps, 1);
  assert.throws(() => session.start('release(1)'), /第 1 行/); assert.equal(session.snapshot().steps, 1);
});
test('invalid configurations fail before play; unreachable scenes fail scoring calculation', () => {
  const demo = structuredClone(strawberryLevels[0]); demo.scene_config.objects.push({ ...demo.scene_config.objects[0], id: 'other' });
  assert.throws(() => createRobotRuntime(demo, 'auto'), /草莓棋盘/);
  const blocked = fixture([0, 0], [4, 4]); blocked.scene_config.walls = [{ x: 0, z: 6 }, { x: 1, z: 7 }];
  assert.throws(() => solveStrawberryRoute(blocked), /没有可完成/);
});
