import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beachLevels } from './levels.js';
import { BEACH_PROGRAM_COMMANDS, BeachProgramSession, compileBeachProgram } from './program.js';
import { beachScore } from './rules.js';

const solutions: Record<string, string> = JSON.parse(readFileSync(new URL('../../../scripts/fixtures/beach-programs.json', import.meta.url), 'utf8'));
test('programming accepts exactly the eight commands, with coordinate, angle and distance validation', () => {
  const demo = beachLevels[2];
  const compiled = compileBeachProgram(BEACH_PROGRAM_COMMANDS.map(c => c.template).join('\n'), demo);
  assert.deepEqual(compiled.map(c => c.action), BEACH_PROGRAM_COMMANDS.map(c => c.action));
  for (const source of ['wait(1)', 'forward_time(1)', 'backward_time(1)', 'print(1)', 'move_to(36.5,70)', 'move_to(36,121)', 'turn_to(361)', 'forward(0)', 'backward(-1)', 'grab(1)', 'release(1)']) {
    assert.throws(() => compileBeachProgram(source, demo), /第 \d+ 行/);
  }
  assert.equal(compileBeachProgram('# 坐标原点为左下角\nmove_to(36,70)', demo)[0].line, 2);
  assert.throws(() => compileBeachProgram('', demo), /先写/);
  assert.doesNotThrow(() => compileBeachProgram(Array(24).fill('forward(120)').join('\n'), demo), 'no additional 120-second DEMO cutoff');
});

test('loops repeat commands with original source lines and reject invalid or excessive expansion', () => {
  const demo = beachLevels[0];
  const commands = compileBeachProgram('for i in range(2):\n    for _ in range(3):\n        forward(1)\n    backward(3)', demo);
  assert.deepEqual(commands.map(c => c.line), [3, 3, 3, 4, 3, 3, 3, 4]);
  for (const source of ['for i in range(0):\n    grab()', 'for i in range(21):\n    grab()', 'for i in range(2):', 'for i in range(2):\n  grab()', 'for i in range(2):\n\tgrab()', 'for i in range(20):\n    for _ in range(20):\n        grab()', 'for i in range(2):\n    for _ in range(2):\n        for i in range(2):\n            grab()', 'for i in range(2):\n    wait(1)', 'for i in range(2):\n    forward(i)']) {
    assert.throws(() => compileBeachProgram(source, demo), /第 \d+ 行/);
  }
});

test('program uses real race time, precise OID coordinates, stop/reset and validation before execution', () => {
  let time = 0; const session = new BeachProgramSession(beachLevels[0], () => time);
  session.start('move_to(60, 36)\nturn_to(90)');
  time = 5000; session.tick(.5); assert.equal(session.elapsed, 5);
  for (let i = 0; i < 600 && session.phase === 'running'; i++) { time += 1000 / 60; session.tick(1 / 60); }
  assert.equal(session.phase, 'stopped');
  assert.ok(Math.abs(session.snapshot().x - 60) < .05); assert.ok(Math.abs(session.snapshot().z - 84) < .05);
  assert.ok(Math.abs(session.snapshot().heading - Math.PI / 2) < .01);
  const stopped = session.snapshot(); time += 3000; session.tick(1); assert.deepEqual(session.snapshot(), stopped);
  assert.throws(() => session.start('wait(1)'), /八种指令/); assert.deepEqual(session.snapshot(), stopped);
  session.start('forward(50)'); for (let i = 0; i < 10; i++) { time += 1000 / 60; session.tick(1 / 60); }
  session.stop(); const pose = session.snapshot(); time += 1000; session.tick(1); assert.deepEqual(session.snapshot(), pose);
  session.reset(); assert.equal(session.snapshot().phase, 'ready'); assert.equal(session.elapsed, 0); assert.equal(session.snapshot().z, 96);
});

for (const demo of beachLevels) test(`${demo.demo_id}: completes every shell through code and physical transport`, () => {
  let time = 0; const session = new BeachProgramSession(demo, () => time);
  session.start(solutions[demo.demo_id]);
  const lines = new Set<number>();
  for (let i = 0; i < 30000 && session.phase === 'running'; i++) {
    time += 1000 / 60; session.tick(1 / 60); const line = session.snapshot().line; if (line) lines.add(line);
  }
  assert.equal(session.phase, 'completed', JSON.stringify(session.snapshot()));
  assert.equal(session.snapshot().collected.length, demo.scene_config.objects.length);
  assert.equal(session.snapshot().score, beachScore(session.elapsed, true));
  assert.ok(lines.size >= 5, 'source lines are reported throughout execution');
  if (['shells-3', 'shells-4'].includes(demo.demo_id)) assert.match(solutions[demo.demo_id], /for i in range\(/, 'new tasks can complete with loops');
  const result = session.snapshot(); time += 1000; session.tick(1); assert.deepEqual(session.snapshot(), result);
});

for (const demo of beachLevels.slice(2)) test(`${demo.demo_id}: loop delivery remains consistent across render frame intervals`, () => {
  for (const intervals of [[.016], [.033], [.05], [.008, .017, .041, .024]]) {
    let time = 0; const session = new BeachProgramSession(demo, () => time);
    session.start(solutions[demo.demo_id]);
    for (let i = 0; i < 40000 && session.phase === 'running'; i++) {
      const dt = intervals[i % intervals.length]; time += dt * 1000; session.tick(dt);
    }
    assert.equal(session.phase, 'completed', `frame intervals ${intervals}: ${JSON.stringify(session.snapshot())}`);
    assert.equal(session.snapshot().collected.length, demo.scene_config.objects.length);
  }
});
