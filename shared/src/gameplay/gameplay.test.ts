import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { demoManifests, validateDemoRegistry, scoringDemo, exportDemoPreset, robotDemoManifests, competitionComponentBindings } from './catalog.js';
import { createRobotRuntime } from './robot/runtime.js';
import { scoreWithRelease, resolveScoreRelease, FUTURE_SCORING_BINDING, FUTURE_SCORE_POLICY } from './scoring/releases.js';

const evidence = { complete: true, actionCount: 8, actionTarget: 8, programMode: true, verifiedCodeLines: 3, codeTarget: 3 };
test('published score component covers boundaries, evidence verification and manual maximum', () => {
  const score = (change = {}) => scoreWithRelease('1.0.0', { ...evidence, ...change });
  assert.equal(score().total, 100);
  assert.equal(score({ complete: false }).total, 0);
  assert.equal(score({ actionCount: 9 }).total, 60);
  assert.equal(score({ verifiedCodeLines: 4 }).total, 80);
  assert.equal(score({ verifiedCodeLines: undefined }).total, 80);
  assert.equal(score({ programMode: false }).total, 80);
  assert.equal(score({ programMode: false }).maximum, 80);
  assert.equal(score({ verifiedCodeLines: NaN }).programming, 0);
  assert.equal(score({ actionCount: -1 }).efficiency, 0);
});
test('DEMO configuration changes leave the pinned competition policy unchanged', () => {
  const version = FUTURE_SCORING_BINDING.version;
  const demo = scoreWithRelease(version, evidence, { completion: 20, efficiency: 10, programming: 5 });
  assert.equal(demo.total, 35);
  assert.equal(scoreWithRelease(version, evidence).total, 100);
  assert.equal(FUTURE_SCORE_POLICY.completion, 60);
  assert.throws(() => scoreWithRelease(version, evidence, { completion: -1, efficiency: 20, programming: 20 }));
  assert.equal(resolveScoreRelease(version), resolveScoreRelease(version));
  for (const invalid of ['latest', '2.0.0', 'constructor', '__proto__']) assert.throws(() => resolveScoreRelease(invalid));
  assert.ok(competitionComponentBindings.some(b => b.component.id === FUTURE_SCORING_BINDING.component && b.component.version === version));
});
test('frozen release source matches its checked-in fingerprint on Windows and Linux', () => {
  const lock = JSON.parse(readFileSync(new URL('../../src/gameplay/scoring/releases.lock.json', import.meta.url), 'utf8')) as Record<string, string>;
  for (const [path, hash] of Object.entries(lock)) {
    const source = readFileSync(new URL(`../../src/gameplay/scoring/${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), hash, 'Released implementations must be preserved; add a new version');
  }
});
test('catalog supports new themes without robot categories and rejects duplicate or missing dependencies', () => {
  const newDemo = { ...scoringDemo, id: 'signal-timing', topic: '交通规则', renderer: 'signal', modes: ['interactive'] };
  validateDemoRegistry([...demoManifests, newDemo]);
  assert.equal('competition_id' in newDemo, false);
  assert.throws(() => validateDemoRegistry([...demoManifests, newDemo, newDemo]));
  assert.throws(() => validateDemoRegistry([{ ...newDemo, dependencies: [{ id: 'missing', version: '1' }] }]));
  const downloaded = JSON.parse(JSON.stringify(exportDemoPreset(scoringDemo)));
  assert.equal(downloaded.schemaVersion, 1);
  assert.equal(scoreWithRelease(downloaded.components[0].version, evidence, downloaded.configuration).total, 100);
});
test('robot presets create isolated sessions and preserve reset/stop/dispose behaviour', () => {
  const original = robotDemoManifests[0].configuration;
  const config = structuredClone(original);
  const demo = createRobotRuntime(config, 'auto');
  const event = createRobotRuntime({ ...config, demo_id: 'event-collect', content_version: 'event-1' }, 'auto');
  config.scene_config.objects[0].x = 0;
  assert.notEqual(demo.demo.scene_config.objects[0].x, 0);
  demo.start(original.starter);
  for (let i = 0; i < 1000 && demo.phase === 'running'; i++) demo.tick(1 / 60);
  assert.equal(demo.snapshot().completed, true);
  assert.equal(event.phase, 'ready'); assert.equal(event.snapshot().collected.length, 0);
  demo.reset(); assert.equal(demo.snapshot().collected.length, 0);
  event.start('wait(1)'); event.stop(); const stopped = event.snapshot(); event.tick(1 / 60); assert.deepEqual(event.snapshot(), stopped);
  event.dispose(); assert.throws(() => event.start('wait(1)'));
  assert.throws(() => demo.tick(NaN));
});
test('robot adapters validate unsupported modes, malformed coordinates and mismatched renderers', () => {
  const scenario = structuredClone(robotDemoManifests[0].configuration);
  assert.throws(() => createRobotRuntime({ ...scenario, supported_modes: ['auto'] }, 'manual'));
  assert.throws(() => createRobotRuntime({ ...scenario, simulation: 'simulation3d' }, 'auto'));
  scenario.scene_config.start.x = NaN;
  assert.throws(() => createRobotRuntime(scenario, 'auto'));
  for (const d of robotDemoManifests) for (const mode of d.configuration.supported_modes) assert.doesNotThrow(() => createRobotRuntime(d.configuration, mode));
});
