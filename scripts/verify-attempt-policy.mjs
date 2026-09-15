import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

const directory = mkdtempSync(join(tmpdir(), 'coin-attempt-policy-'));
process.env.COIN_DATA_DIR = directory;
process.env.TEACHER_KEY = 'policy-test';
const { apiRouter } = await import('../server/dist/routes.js');
const { getDb, closeDb } = await import('../server/dist/db.js');
const app = express();
app.use(express.json(), cookieParser());
app.use('/api', apiRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
let cookie = '';
async function request(path, body) {
  return fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, 'content-type': 'application/json', 'x-teacher-key': 'policy-test' },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
try {
  const db = getDb();
  const stamp = new Date().toISOString();
  db.prepare('INSERT INTO players VALUES (?, ?, ?, ?, ?)').run('policy-player', 'Test', 'python', stamp, stamp);
  cookie = 'player_uuid=policy-player';
  for (const mode of ['K', 'P']) {
    for (let level = 1; level <= 20; level++) {
      const key = mode + String(level).padStart(2, '0');
      for (let trial = 1; trial <= 3; trial++) {
        const response = await request('/attempts', { assignment_key: key });
        assert.equal(response.status, 201);
        const attempt = await response.json();
        assert.equal(attempt.trial_index, trial);
        assert.equal((await request(`/attempts/${attempt.attempt_id}/stop`, {})).status, 200);
        // Distinct synthetic scores prove aggregation uses MAX, not last/average.
        db.prepare('UPDATE attempts SET score = ? WHERE attempt_id = ?').run([25, 90, 50][trial - 1], attempt.attempt_id);
      }
      const rejected = await request('/attempts', { assignment_key: key });
      assert.equal(rejected.status, 409);
      assert.equal((await rejected.json()).code, 'ATTEMPT_LIMIT_REACHED');
      const summary = await (await request(`/assignments/${key}`)).json();
      assert.equal(summary.remaining_attempts, 0);
      assert.equal(summary.final_score, 90);
      assert.deepEqual(summary.attempts.map(a => a.score), [25, 90, 50]);
    }
  }
  // Preserve legacy records beyond three without including them in final grades.
  db.prepare(`INSERT INTO attempts (attempt_id, assignment_key, player_uuid, mode, trial_index, status, score, started_at)
    VALUES ('legacy-fourth', 'K01', 'policy-player', 'keyboard', 4, 'success', 100, ?)`).run(stamp);
  for (const query of ['', '?uuid=policy&level=L01']) {
    const response = await request('/teacher/dashboard' + query);
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    assert.equal(dashboard.overview.average_score, 90);
    for (const row of [...dashboard.modes, ...dashboard.languages, ...dashboard.levels]) assert.equal(row.average_score, 90);
    for (const row of dashboard.recent_attempts) assert.equal(row.final_score, 90);
  }
  const summary = await (await request('/teacher/summary')).json();
  assert.ok(summary.progress.every(row => row.average_score === 90));
  const exported = await (await request('/teacher/export?format=jsonl&uuid=policy&level=L01')).text();
  const records = exported.trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 7);
  assert.ok(records.every(row => row.final_score === 90));
  assert.equal(records.find(row => row.attempt_id === 'legacy-fourth').counts_toward_final, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 121);
  const filtered = await (await request('/teacher/dashboard?mode=keyboard&level=L01')).json();
  assert.equal(filtered.insights.overview.attempts, 3);
  assert.equal(filtered.insights.overview.first_score, 25);
  assert.equal(filtered.insights.overview.best_score, 90);
  assert.equal(filtered.insights.overview.gain, 65);
  assert.equal(filtered.insights.levels.length, 1);
  assert.equal(filtered.students.length, 1);
  // All deletion checks run only against this temporary database.
  db.prepare('INSERT INTO players VALUES (?, ?, ?, ?, ?)').run('policy-player-neighbor', '保留的学生', null, stamp, stamp);
  db.prepare('INSERT INTO event_streams VALUES (?, ?, ?, ?)').run('test-stream', 'policy-player', 'test', stamp);
  const eventResponse = await request('/event-streams/test-stream/batches', { events: [{ event_id: 'test-event', seq: 1, event_type: 'attempt_started', assignment_key: 'K01', level_id: 'L01', mode: 'keyboard', attempt_id: null, element_id: null, interaction_id: null, client_time: stamp, page_instance_id: 'test-page', mono_ms: 0, elapsed_ms: 0, payload: {} }] });
  assert.equal(eventResponse.status, 200);
  const preview = await (await request('/teacher/players/policy-player/data')).json();
  assert.equal(preview.attempts, 121);
  assert.equal(preview.streams, 1);
  assert.equal(preview.events, 1);
  const remove = (id, confirmation, auth = 'policy-test') => fetch(base + '/teacher/players/' + id + '/data?level=L01&mode=keyboard', {
    method: 'DELETE', headers: { 'x-teacher-key': auth, 'content-type': 'application/json' }, body: JSON.stringify({ confirm_uuid: confirmation }),
  });
  assert.equal((await remove('policy-player', 'policy-player', 'wrong')).status, 401);
  assert.equal((await remove('policy-player', 'wrong')).status, 400);
  assert.equal((await remove('policy', 'policy')).status, 404, 'prefix must never delete matching players');
  assert.equal((await remove('policy-player', 'policy-player')).status, 200);
  for (const table of ['attempts', 'assignments', 'events', 'event_streams']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE player_uuid = ?`).get('policy-player').n, 0);
  assert.ok(db.prepare('SELECT 1 FROM players WHERE player_uuid = ?').get('policy-player-neighbor'));
  assert.equal((await remove('policy-player', 'policy-player')).status, 404);
  console.log('通过：分析筛选、删除鉴权、精确 UUID、确认值、跨关卡删除与邻居数据保护。');
  console.log('PASS: all 40 assignments enforce 3 attempts; per-attempt records, best scores, filters, exports and legacy exclusion verified.');
} finally {
  await new Promise(resolve => server.close(resolve));
  closeDb();
  rmSync(directory, { recursive: true, force: true });
}
