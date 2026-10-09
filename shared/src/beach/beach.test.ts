import test from 'node:test';
import assert from 'node:assert/strict';
import { beachLevels, BEACH_OID_POSITIONS } from './levels.js';
import { BeachSession } from './session.js';
import { beachScore, isShellAtEdge } from './rules.js';
import { thirdMapPosition } from '../third/geometry.js';
import type { ThirdAction } from '../third/types.js';

test('shells use exact OID coordinates and two manual-only 3D levels', () => {
  for (const [index, level] of beachLevels.entries()) {
    assert.deepEqual(level.supported_modes, ['manual']);
    assert.equal(level.simulation, 'simulation3d');
    assert.deepEqual(level.scene_config.objects.map(o => { const p = thirdMapPosition(o.x, o.z, 120); return [p.x, p.y]; }), BEACH_OID_POSITIONS[index]);
    assert.equal(level.scene_config.objects.length, index ? 4 : 2);
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

test('pushing a shell onto an edge without a grasp and release does not deliver', () => {
  const demo = structuredClone(beachLevels[0]); demo.scene_config.objects = [{ id: 'A', x: 60, z: 6 }];
  const session = new BeachSession(demo); session.start();
  for (let i = 0; i < 120; i++) session.tick(1 / 60);
  assert.deepEqual(session.snapshot().collected, []);
});

for (const demo of beachLevels) test(`${demo.demo_id}: complete every shell through manual driving and physical grasp/release`, () => {
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
