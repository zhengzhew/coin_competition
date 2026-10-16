import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { strawberryLevels, beachLevels, solveStrawberryRoute } from '../shared/dist/index.js';

// Never open the workspace or production database, even if COIN_DATA_DIR was set by the caller.
process.env.COIN_DATA_DIR = mkdtempSync(join(tmpdir(), 'teacher-competitions-'));
process.env.TEACHER_KEY = 'teacher-competitions-test';
const { apiRouter } = await import('../server/dist/routes.js');
const { getDb, closeDb } = await import('../server/dist/db.js');
const app = express(); app.use(express.json(), cookieParser()); app.use('/api', apiRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}/api`;
let cookie = '';
async function request(path, method = 'GET', body, auth = true) {
  const response = await fetch(origin + path, { method, headers: { cookie, 'Content-Type': 'application/json', ...(auth ? { 'x-teacher-key': process.env.TEACHER_KEY } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return response;
}
async function json(path, method = 'GET', body) {
  const response = await request(path, method, body);
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`); return data;
}
function snapshot() {
  const db = getDb();
  return JSON.stringify({ schema: db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(),
    data: Object.fromEntries(['players', 'assignments', 'attempts', 'events', 'event_streams', 'leaderboard_config', 'leaderboard_submissions']
      .map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])) });
}
try {
  assert.equal((await request('/teacher/dashboard', 'GET', undefined, false)).status, 401);
  const boot = await request('/players/bootstrap', 'POST', {});
  cookie = boot.headers.get('set-cookie').split(';')[0];
  const owner = (await boot.json()).player_uuid;
  const farm = strawberryLevels[0], participant = randomUUID(), secondParticipant = randomUUID();
  const sample = { submission_id: randomUUID(), participant_id: participant, display_name: '同名学生', competition: 'farm',
    level_id: farm.demo_id, content_version: farm.content_version, mode: 'auto', source: solveStrawberryRoute(farm).program,
    steps: 10, seconds: 12, completed: true };
  for (let i = 0; i < 4; i++) await json('/leaderboard/submissions', 'POST', { ...sample, submission_id: randomUUID(), seconds: 12 + i });
  await json('/leaderboard/submissions', 'POST', { ...sample, submission_id: randomUUID(), participant_id: secondParticipant });
  const beach = beachLevels.find(level => level.supported_modes.includes('auto'));
  await json('/leaderboard/submissions', 'POST', { ...sample, submission_id: randomUUID(), display_name: '海边学生', competition: 'beach',
    level_id: beach.demo_id, content_version: beach.content_version, mode: 'auto', source: 'forward(48)', steps: 4, seconds: 8 });
  await json('/attempts', 'POST', { assignment_key: 'K01' });
  const db = getDb();
  // Existing historical data includes a retired content version and an incomplete legacy submission.
  for (const [version, completed] of [['old-version', 1], ['invalid-old-version', 0]]) {
    db.prepare('INSERT INTO leaderboard_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), owner, participant, '历史学生', 'farm', 'retired-farm', 'manual', version, 7, 0, 20, completed, '2026-10-01T00:00:00.000Z');
  }
  const config = { start: null, end: null, rule: { base: 100, steps: -1, code_lines: -2, seconds: -.5, min: 0, max: 100 } };
  await json('/teacher/leaderboard', 'PUT', config);
  const before = snapshot();
  let dashboard = await json('/teacher/dashboard');
  assert.equal(dashboard.submissions.overview.submissions, 7);
  assert.equal(dashboard.submissions.overview.students, 3, 'separate participants sharing a browser; do not merge across competitions');
  assert.equal(dashboard.insights.overview.attempts, 1, 'submissions do not masquerade as formal attempts');
  assert.equal(dashboard.catalog.find(event => event.id === 'farm').levels.length, strawberryLevels.length + 1);
  assert.ok(dashboard.catalog.find(event => event.id === 'future').levels.some(level => level.id === 'FL36'));
  assert.ok(dashboard.catalog.find(event => event.id === 'farm').levels.some(level => level.id === 'retired-farm'));
  assert.equal(dashboard.students[0].submissions, 7);
  assert.match(dashboard.students[0].participant_names, /同名学生/);
  dashboard = await json(`/teacher/dashboard?competition=farm&level=STRAWBERRY-1&mode=auto&uuid=${participant.slice(0, 12)}`);
  assert.equal(dashboard.submissions.rows.length, 4, 'all successful submissions are retained beyond the third');
  assert.equal(dashboard.submissions.overview.students, 1);
  assert.equal(dashboard.students[0].submissions, 4);
  assert.equal(dashboard.insights.overview.attempts, 0);
  const rank = await json(`/leaderboard?competition=farm&level=${farm.demo_id}&mode=auto&version=${farm.content_version}`);
  assert.equal(dashboard.submissions.rows[0].score, rank.rows[0].score, 'same metrics use the current leaderboard score rule');
  const beachDashboard = await json('/teacher/dashboard?competition=beach&mode=auto');
  assert.deepEqual(beachDashboard.submissions.rows.map(row => row.display_name), ['海边学生']);
  assert.equal(beachDashboard.submissions.rows[0].code_lines, 1);
  assert.equal((await json('/teacher/dashboard?competition=coin')).submissions.rows.length, 0);
  assert.equal((await json('/teacher/dashboard?competition=unknown')).submissions.rows.length, 0, 'unknown filter never silently broadens to every competition');
  assert.equal((await json('/teacher/dashboard?competition=farm&mode=keyboard')).submissions.rows.length, 0);
  assert.equal((await json('/teacher/dashboard?competition=farm&uuid=missing')).students.length, 0);
  const exportResponse = await request('/teacher/export?kind=attempts&format=jsonl');
  const exported = (await exportResponse.text()).trim().split('\n').map(row => JSON.parse(row));
  assert.equal(exported.filter(row => row.record_type === 'completion_submission').length, 7);
  assert.equal(exported.filter(row => row.record_type === 'formal_attempt').length, 1);
  const csv = await (await request('/teacher/export?kind=attempts&format=csv')).text();
  for (const key of ['participant_id', 'content_version', 'submission_id', 'attempt_id', 'code_lines']) assert.ok(csv.split('\n')[0].includes(`"${key}"`), 'mixed CSV includes every record type column');
  const filtered = await (await request(`/teacher/export?kind=attempts&format=jsonl&competition=farm&level=strawberry-1&uuid=${secondParticipant}`)).text();
  const single = JSON.parse(filtered.trim()); assert.equal(single.participant_id, secondParticipant); assert.equal(single.competition, 'farm');
  const scope = await json(`/teacher/players/${owner}/data`);
  assert.equal(scope.submissions, 8, 'deletion preview includes every existing row, including legacy incomplete data');
  assert.equal(snapshot(), before, 'dashboard, catalog, filters, preview and exports do not modify any stored row or schema');
  closeDb(); assert.equal(snapshot(), before, 'reopening the database retains all existing records');
  await json('/teacher/leaderboard', 'PUT', { start: null, end: null, rule: null });
  const hidden = await json('/teacher/dashboard?competition=farm');
  assert.equal(hidden.submissions.overview.average_score, null);
  assert.ok(hidden.submissions.rows.every(row => row.score === null));
  console.log('教师多赛事验证通过：农场/贝壳、真实目录、学生隔离、历史版本、筛选、统一导出、当前计分及所有既有数据/表结构只读校验。');
} finally { await new Promise(resolve => server.close(resolve)); closeDb(); }
