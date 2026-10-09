import test from 'node:test';
import assert from 'node:assert/strict';
import { beachLevels, BEACH_OID_POSITIONS } from './levels.js';
import { BeachSession } from './session.js';
import { beachScore, isShellAtEdge } from './rules.js';
import { thirdMapPosition } from '../third/geometry.js';
import type { ThirdAction } from '../third/types.js';

test('four 3D levels keep exact OID layouts, with programming copies after the manual pair', () => {
  assert.equal(beachLevels.length, 4);
  for (const [index, level] of beachLevels.entries()) {
    assert.deepEqual(level.supported_modes, [index < 2 ? 'manual' : 'auto']);
    assert.equal(level.simulation, 'simulation3d');
    assert.deepEqual(level.scene_config.objects.map(o => { const p = thirdMapPosition(o.x, o.z, 120); return [p.x, p.y]; }), BEACH_OID_POSITIONS[index % 2]);
    assert.equal(level.scene_config.objects.length, index % 2 ? 4 : 2);
    if (index >= 2) { assert.deepEqual(level.scene_config, beachLevels[index - 2].scene_config); assert.notEqual(level.scene_config, beachLevels[index - 2].scene_config); }
  }
});

test('whole shell must fit on one of four edges; faster completed races score higher', () => {
  for (const [x, z] of [[6, 60], [114, 60], [60, 6], [60, 114]]) assert.equal(isShellAtEdge(x, z, 0, 120, 120), true);
  for (const [x, z] of [[12, 60], [60, 60], [-1, 60], [60, 121]]) assert.equal(isShellAtEdge(x, z, 0, 120, 120), false);
  assert.equal(isShellAtEdge(8, 60, Math.PI / 4, 120, 120), false);
  assert.ok(beachScore(30, true) > beachScore(60, true));
  assert.equal(beachScore(60, false), 0); assert.equal(beachScore(NaN, true), 0);
});

test('wall clock includes slow frames; stop cannot resume a scored attempt; input sources stay independent', () => {
  let clock = 0; const session = new BeachSession(beachLevels[0], () => clock);
  session.start(); clock = 5000; session.tick(.5); assert.equal(session.elapsed, 5);
  session.press('w', 'forward'); session.press('up', 'forward'); session.release('w');
  assert.equal(session.inputs.get('up'), 'forward');
  session.stop(); const stopped = session.snapshot(); clock = 9000; session.tick(1);
  assert.deepEqual(session.snapshot(), stopped); assert.equal(session.inputs.size, 0);
  session.start(); assert.equal(session.elapsed, 0); assert.equal(session.snapshot().x, 60);
  assert.equal(session.snapshot().z, 96); session.reset(); assert.equal(session.phase, 'ready');
});

test('each edge accepts a settled shell without any input, but partial entry does not count', () => {
  for (const [x, z, valid] of [[6, 60, true], [114, 60, true], [60, 6, true], [60, 114, true], [12, 60, false], [60, 60, false]] as const) {
    const demo = structuredClone(beachLevels[0]); demo.scene_config.objects = [{ id: 'A', x, z }];
    const session = new BeachSession(demo); session.start();
    for (let i = 0; i < 12; i++) session.tick(1 / 60);
    assert.deepEqual(session.snapshot().collected, [], 'must first settle for 0.4 seconds');
    for (let i = 0; i < 24; i++) session.tick(1 / 60);
    assert.deepEqual(session.snapshot().collected, valid ? ['A'] : []);
    assert.equal(session.snapshot().actions, 0);
  }
});

test('a shell pushed into the edge without grab or release input is delivered', () => {
  const demo = structuredClone(beachLevels[0]);
  demo.scene_config.start = { x: 60, z: 50, heading: Math.PI };
  demo.scene_config.objects = [{ id: 'A', x: 60, z: 37.5 }];
  const session = new BeachSession(demo); session.start(); session.press('s', 'backward');
  for (let i = 0; i < 120; i++) session.tick(1 / 60);
  session.release('s');
  for (let i = 0; i < 60; i++) session.tick(1 / 60);
  assert.deepEqual(session.snapshot().collected, ['A']);
  assert.equal(session.snapshot().actions, 1, 'the only action was driving');
  assert.equal(session.phase, 'completed');
});

test('a held shell is accepted after settling at the edge without release input', () => {
  const demo = structuredClone(beachLevels[0]);
  demo.scene_config.start = { x: 60, z: 52.5, heading: 0 };
  demo.scene_config.objects = [{ id: 'A', x: 60, z: 40 }];
  const session = new BeachSession(demo); session.start(); session.press('g', 'grab'); session.release('g');
  for (let i = 0; i < 120; i++) session.tick(1 / 60);
  assert.equal(session.snapshot().holding, 'A');
  session.press('w', 'forward');
  for (let i = 0; i < 108; i++) session.tick(1 / 60);
  session.release('w');
  assert.equal(session.snapshot().holding, 'A');
  assert.deepEqual(session.snapshot().collected, [], 'moving shells must first stop');
  for (let i = 0; i < 60; i++) session.tick(1 / 60);
  assert.deepEqual(session.snapshot().collected, ['A']);
  assert.equal(session.snapshot().actions, 2, 'only grab and driving, no release');
  assert.equal(session.snapshot().gripper?.target, 'open', 'accepted cargo automatically frees the gripper');
  assert.equal(session.phase, 'completed');
});

for (const demo of beachLevels.filter(level => level.supported_modes[0] === 'manual')) test(`${demo.demo_id}: complete every shell through manual driving and physical grasp/release`, () => {
  let clock = 0; const session = new BeachSession(demo, () => clock); session.start();
  const tick = () => { clock += 1000 / 60; session.tick(1 / 60); };
  const act = (action: ThirdAction) => { session.press('control', action); session.release('control'); };
  const wait = (seconds: number) => { for (let i = 0; i < seconds * 60; i++) tick(); };
  const turn = (heading: number) => {
    for (let i = 0; i < 700; i++) {
      const current = session.snapshot(), error = Math.atan2(Math.sin(heading - current.heading), Math.cos(heading - current.heading));
      session.release('drive'); if (Math.abs(error) < .012) { wait(.1); return; }
      session.release('turn'); session.press('turn', error > 0 ? 'turn_right' : 'turn_left');
      // Last turn step uses a smaller interval to align without teleporting.
      clock += 1000 * Math.min(1 / 60, Math.abs(error) / (Math.PI / 2)); session.tick(Math.min(1 / 60, Math.abs(error) / (Math.PI / 2))); session.release('turn');
    }
    assert.fail('turn did not converge');
  };
  const drive = (x: number, z: number, backwards = false) => {
    for (let i = 0; i < 1800; i++) {
      const s = session.snapshot();
      if (Math.hypot(s.x - x, s.z - z) < .3) { session.release('drive'); wait(.1); return; }
      const heading = Math.atan2(x - s.x, s.z - z) + (backwards ? Math.PI : 0);
      const error = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading));
      if (Math.abs(error) > .018) turn(heading);
      session.press('drive', backwards ? 'backward' : 'forward');
      tick();
    }
    assert.fail(`drive to ${x},${z}: ${JSON.stringify(session.snapshot())}`);
  };
  let lane = demo.demo_id === 'shells-1' ? 76 : 64;
  drive(60, lane);
  for (const [index, shell] of demo.scene_config.objects.entries()) {
    drive(60, lane);
    lane = demo.demo_id === 'shells-1' ? [76, 68][index] : [64, 54, 64, 58][index];
    drive(60, lane);
    drive(shell.x, lane);
    const top = shell.z < 60;
    const pickupZ = shell.z + (top ? 12.5 : -12.5);
    drive(shell.x, pickupZ); turn(top ? 0 : Math.PI); wait(.2); act('grab'); wait(1.8);
    assert.equal(session.snapshot().holding, shell.id, `physically grasp ${shell.id}: ${JSON.stringify(session.snapshot())}`);
    drive(shell.x, top ? 19.5 : 100.5); act('release'); wait(2);
    assert.ok(session.snapshot().collected.includes(shell.id), `deliver ${shell.id} at edge`);
    if (!session.snapshot().completed) drive(shell.x, lane, true);
  }
  assert.equal(session.phase, 'completed'); assert.equal(session.snapshot().score, beachScore(session.elapsed, true));
  assert.equal(session.snapshot().collected.length, demo.scene_config.objects.length);
  const elapsed = session.elapsed; clock += 5000; session.tick(1); assert.equal(session.elapsed, elapsed);
});
