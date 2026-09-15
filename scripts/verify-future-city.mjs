import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { replay } from '../shared/dist/index.js';

// Never connects to a classroom database.
const directory = mkdtempSync(join(tmpdir(), 'future-city-test-'));
process.env.COIN_DATA_DIR = directory;
process.env.TEACHER_KEY = 'future-test';
const { apiRouter } = await import('../server/dist/routes.js');
const { closeDb } = await import('../server/dist/db.js');
const app = express();
app.use(express.json(), cookieParser());
app.use('/api', apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
let cookie = '';
const request = (path, body) => fetch(base + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { cookie, 'content-type': 'application/json', 'x-teacher-key': 'future-test' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (path, body, status = 200) => {
  const res = await request(path, body);
  assert.equal(res.status, status, `${path}: ${res.status}`);
  return res.json();
};
try {
  const bootstrap = await request('/players/bootstrap', {});
  cookie = bootstrap.headers.get('set-cookie').split(';')[0];
  const player = await bootstrap.json();
  assert.equal((await json('/players/bootstrap', {})).player_uuid, player.player_uuid);
  const coins = await json('/levels');
  const future = await json('/levels?competition=future');
  const solutions = JSON.parse(readFileSync(new URL('../solutions.teacher.json', import.meta.url))).solutions;
  assert.equal(coins.length, 20);
  assert.equal(future.length, 20);
  await json('/levels?competition=unknown', undefined, 400);
  await json('/assignments/FK21', undefined, 404);
  for (let index = 0; index < 20; index++) {
    const original = coins[index], city = future[index];
    for (const property of ['width','height','start','walls','coins','required_order','step_limit','show_optimal_feedback','max_commands','max_attempts','python']) {
      assert.deepEqual(city[property], original[property], `${city.level_id} ${property}`);
    }
    assert.ok(!('expected_optimal_steps' in city) && !('expected_max_value' in city));
    assert.equal((await json(`/levels/${city.level_id}`)).title, city.title);
    assert.ok(!/金币|淘金/.test(city.title + city.objective + city.rule_hint));
    const commands = solutions[index].commands;
    // Replay real reference routes plus collisions and arbitrary routes identically.
    for (const route of [commands, Array(30).fill('left'), ['up','right','down','left']]) {
      assert.deepEqual(replay(city, route, city.required_order), replay(original, route, original.required_order));
    }
    for (const mode of ['keyboard_id', 'python_id']) {
      const originalAttempt = await json('/attempts', { assignment_key: original[mode] }, 201);
      const cityAttempt = await json('/attempts', { assignment_key: city[mode] }, 201);
      assert.equal(cityAttempt.mode, mode === 'keyboard_id' ? 'keyboard' : 'python_blank');
      assert.equal(cityAttempt.trial_index, 1);
      const results = [];
      for (const attempt of [originalAttempt, cityAttempt]) {
        let result = await json(`/attempts/${attempt.attempt_id}/commands`, { commands });
        if (!result.is_terminal) result = await json(`/attempts/${attempt.attempt_id}/finalize`, {});
        results.push(result);
      }
      assert.deepEqual(results[1].score, results[0].score, city[mode]);
      assert.equal(results[1].score.total_score, 100, city[mode]);
    }
  }
  // A used-up city assignment does not consume coin attempts or code attempts.
  for (const trial of [2, 3]) {
    const attempt = await json('/attempts', { assignment_key: 'FK01' }, 201);
    assert.equal(attempt.trial_index, trial);
    await json(`/attempts/${attempt.attempt_id}/stop`, {});
  }
  await json('/attempts', { assignment_key: 'FK01' }, 409);
  assert.equal((await json('/assignments/FK01')).remaining_attempts, 0);
  assert.equal((await json('/assignments/K01')).remaining_attempts, 2);
  assert.equal((await json('/assignments/FP01')).remaining_attempts, 2);
  for (const competition of ['coin', 'future']) {
    const stream = await json('/event-streams', { scope: `${competition}_student_page` }, 201);
    await json(`/event-streams/${stream.stream_id}/batches`, { events: [{
      event_id: `${competition}-event`, seq: 1, event_type: 'page_view', assignment_key: null, level_id: null,
      mode: null, attempt_id: null, element_id: null, interaction_id: null,
      client_time: new Date().toISOString(), page_instance_id: 'test', mono_ms: 0, elapsed_ms: 0, payload: { competition },
    }] });
  }
  const total = await json('/teacher/dashboard');
  assert.equal(total.overview.players, 1);
  assert.equal(total.overview.attempts, 82);
  for (const competition of ['coin', 'future']) {
    const dashboard = await json(`/teacher/dashboard?competition=${competition}`);
    assert.equal(dashboard.overview.attempts, competition === 'future' ? 42 : 40);
    assert.equal(dashboard.overview.events, 1);
    assert.equal(dashboard.insights.levels.length, 40);
    assert.ok(dashboard.insights.levels.every(level => level.level_id.startsWith('F') === (competition === 'future')));
    const filtered = await json(`/teacher/dashboard?competition=${competition}&level=${competition === 'future' ? 'FL01' : 'L01'}&mode=keyboard`);
    assert.equal(filtered.insights.levels.length, 1);
    assert.equal(filtered.insights.overview.attempts, competition === 'future' ? 3 : 1);
    const exported = await (await request(`/teacher/export?competition=${competition}&format=jsonl`)).text();
    const records = exported.trim().split('\n').map(JSON.parse);
    assert.equal(records.length, competition === 'future' ? 42 : 40);
    assert.ok(records.every(row => row.competition === competition));
    const events = await (await request(`/teacher/export?competition=${competition}&kind=events&format=jsonl`)).text();
    assert.equal(JSON.parse(events.trim()).payload.competition, competition);
  }
  console.log('PASS: 20 paired maps, 80 scored routes, independent limits, shared identity, dashboard and exports.');
} finally {
  await new Promise(resolve => server.close(resolve));
  closeDb();
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('future-city-test-'));
  rmSync(directory, { recursive: true, force: true });
}
