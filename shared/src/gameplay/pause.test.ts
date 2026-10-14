import test from 'node:test';
import assert from 'node:assert/strict';
import { createRobotRuntime } from './robot/runtime.js';
import { strawberryLevels } from '../farm/levels.js';
import { solveStrawberryRoute } from '../farm/strawberry.js';
import { BeachProgramSession } from '../beach/program.js';
import { beachLevels } from '../beach/levels.js';
import { thirdSample } from '../third/samples.js';

test('pause preserves pending grid command, line, time and steps; resume completes the same program', () => {
  const level = strawberryLevels[0], session = createRobotRuntime(level, 'auto');
  session.start(solveStrawberryRoute(level).program);
  for (let i = 0; i < 20; i++) session.tick(1 / 60);
  session.pause(); const paused = session.snapshot();
  for (let i = 0; i < 200; i++) session.tick(.1);
  assert.deepEqual(session.snapshot(), paused);
  session.resume(); for (let i = 0; i < 7200 && session.phase === 'running'; i++) session.tick(1 / 60);
  assert.equal(session.snapshot().completed, true); assert.equal(session.snapshot().steps, 10);
  session.reset(); assert.equal(session.phase, 'ready'); assert.equal(session.snapshot().line, null);
  assert.equal(session.snapshot().steps, 0); assert.deepEqual([session.snapshot().x, session.snapshot().z], [0, 7]);
});
test('continuous OID motion pauses exactly and resumes without reissuing the command', () => {
  const demo = thirdSample('collect', 'simulation3d'), session = createRobotRuntime(demo, 'auto');
  session.start(`move_to(${demo.scene_config.start.x}, ${demo.scene_config.depth - demo.scene_config.start.z + 12})`);
  for (let i = 0; i < 30; i++) session.tick(1 / 60);
  session.pause(); const frozen = session.snapshot(); session.tick(30); assert.deepEqual(session.snapshot(), frozen);
  session.resume(); for (let i = 0; i < 600 && session.phase === 'running'; i++) session.tick(1 / 60);
  assert.equal(session.snapshot().actions, frozen.actions);
  assert.ok(Math.abs(session.snapshot().z - (demo.scene_config.start.z - 12)) < .2);
});
test('beach elapsed excludes paused wall time and reset cancels paused execution', () => {
  let now = 0;
  const session = new BeachProgramSession(beachLevels[2], () => now);
  session.start('forward(12)'); now = 200; session.tick(.1); session.pause();
  const frozen = session.snapshot(); now = 10200; session.tick(10); assert.deepEqual(session.snapshot(), frozen);
  session.resume(); now = 10400; session.tick(.1); assert.equal(session.elapsed, .4);
  session.pause(); session.reset(); session.resume(); assert.equal(session.phase, 'ready'); assert.equal(session.elapsed, 0);
});
