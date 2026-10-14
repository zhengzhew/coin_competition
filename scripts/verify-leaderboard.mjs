import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { strawberryLevels, beachLevels, robotDemoManifests, solveStrawberryRoute, solve } from '../shared/dist/index.js';

process.env.COIN_DATA_DIR = mkdtempSync(join(tmpdir(), 'leaderboard-test-'));
process.env.TEACHER_KEY = 'leaderboard-test';
const { apiRouter } = await import('../server/dist/routes.js');
const { getDb, closeDb } = await import('../server/dist/db.js');
const { getLevelForAssignment } = await import('../server/dist/levels.js');
const app = express(); app.use(express.json(), cookieParser()); app.use('/api', apiRouter);
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api`;
let cookie = '';
async function request(path, method = 'GET', body, auth = true) {
  const response = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json', ...(auth ? { 'x-teacher-key': 'leaderboard-test' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json(), response };
}
try {
  assert.equal((await request('/teacher/leaderboard', 'GET', undefined, false)).status, 401);
  const boot = await request('/players/bootstrap', 'POST', {}); cookie = boot.response.headers.get('set-cookie').split(';')[0];
  const player = boot.data.player_uuid;
  const level = strawberryLevels[0], source = solveStrawberryRoute(level).program;
  const payload = { submission_id: randomUUID(), participant_id: randomUUID(), display_name: '甲', competition: 'farm', level_id: level.demo_id, content_version: level.content_version, mode: 'auto', source, steps: 10, seconds: 12, completed: true };
  const saved = await request('/leaderboard/submissions', 'POST', payload);
  assert.equal(saved.status, 201); assert.equal(saved.data.score, null, 'completion hides score without a teacher rule');
  assert.equal((await request('/leaderboard/submissions', 'POST', payload)).status, 200);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM leaderboard_submissions WHERE submission_id = ?').get(payload.submission_id).n, 1, 'retries create only one record');
  for (const [competition, task] of [['farm', level], ['beach', beachLevels[0]], ['demo', robotDemoManifests[0].configuration]]) {
    const incomplete = await request('/leaderboard/submissions', 'POST', { ...payload, submission_id: randomUUID(), competition, level_id: task.demo_id, content_version: task.content_version, mode: task.supported_modes[0], completed: false, source: 'move(1)', steps: 1 });
    assert.equal(incomplete.status, 422); assert.match(incomplete.data.error, /成功完成/);
  }
  assert.equal((await request('/leaderboard/submissions', 'POST', { ...payload, submission_id: randomUUID(), source: 'move(1)', steps: 1 })).status, 422, 'claiming completion cannot bypass farm replay');
  assert.equal((await request('/leaderboard/submissions', 'POST', { ...payload, submission_id: randomUUID(), steps: 1 })).status, 422);
  const second = { ...payload, submission_id: randomUUID(), participant_id: randomUUID(), display_name: '乙', seconds: 20 };
  assert.equal((await request('/leaderboard/submissions', 'POST', second)).status, 201);
  const db = getDb();
  db.prepare('UPDATE leaderboard_submissions SET submitted_at = ? WHERE submission_id = ?').run('2026-10-13T02:00:00.000Z', payload.submission_id);
  db.prepare('UPDATE leaderboard_submissions SET submitted_at = ? WHERE submission_id = ?').run('2026-10-13T03:00:00.000Z', second.submission_id);
  // Simulate old incomplete rows, including a newer failed run by an existing successful player.
  const legacyId = randomUUID();
  for (const [id, participant, date] of [[legacyId, payload.participant_id, '2026-10-13T02:20:00.000Z'], [randomUUID(), randomUUID(), '2026-10-13T03:10:00.000Z']]) {
    db.prepare('INSERT INTO leaderboard_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, player, participant, '无效旧记录', 'farm', level.demo_id, 'auto', level.content_version, 1, 1, 1, 0, date);
  }
  assert.equal((await request('/leaderboard/submissions', 'POST', { ...payload, submission_id: legacyId })).status, 422, 'an invalid legacy id cannot acknowledge a completed submission');
  const scope = `/leaderboard?competition=farm&level=${level.demo_id}&mode=auto&version=${level.content_version}`;
  let result = await request(scope); assert.equal(result.data.rows.length, 2); assert.equal(result.data.rows[0].score, null);
  assert.equal((await request(scope + '&sort=score')).status, 422);
  assert.equal((await request('/teacher/leaderboard', 'PUT', { start: 'invalid', end: '2026-10-14', rule: null })).status, 422);
  const config = { start: '2026-10-13T00:00:00.000Z', end: '2026-10-13T02:30:00.000Z', rule: { base: 100, steps: -1, code_lines: -2, seconds: -.5, min: 0, max: 100 } };
  assert.equal((await request('/teacher/leaderboard', 'PUT', { ...config, rule: { ...config.rule, exec: 'x' } })).status, 422);
  assert.equal((await request('/teacher/leaderboard', 'PUT', config)).status, 200);
  closeDb(); assert.deepEqual((await request('/teacher/leaderboard')).data, config, 'config persists across reopening SQLite');
  result = await request(scope + '&sort=score&order=desc'); assert.deepEqual(result.data.rows.map(r => r.name), ['甲']);
  const lines = source.split('\n').length;
  assert.equal(result.data.rows[0].score, Math.max(0, 100 - 10 - lines * 2 - 6));
  const repeated = await request('/leaderboard/submissions', 'POST', { ...payload, seconds: 100 });
  assert.equal(repeated.data.score, result.data.rows[0].score, 'retry scores the saved metrics using the current rule');
  assert.deepEqual((await request(scope + '&scope=history')).data.rows.map(r => r.name), ['乙']);
  await request('/teacher/leaderboard', 'PUT', { ...config, start: null, end: null });
  assert.deepEqual((await request(scope + '&sort=seconds&order=desc')).data.rows.map(r => r.name), ['乙', '甲']);
  // Re-submission by the same participant replaces their displayed entry, without deleting history.
  const retry = { ...payload, submission_id: randomUUID(), seconds: 15 };
  const scored = await request('/leaderboard/submissions', 'POST', retry);
  assert.equal(scored.data.score, Math.max(0, 100 - 10 - lines * 2 - 7.5));
  result = await request(scope + '&sort=seconds'); assert.equal(result.data.rows.length, 2); assert.equal(result.data.rows[0].seconds, 15);
  assert.equal(scored.data.score, result.data.rows[0].score, 'completion and leaderboard use the same backend score');
  // Formal attempts keep their analytics history, but only successes enter the leaderboard.
  const attempt = (await request('/attempts', 'POST', { assignment_key: 'P01' })).data;
  await request(`/attempts/${attempt.attempt_id}/commands`, 'POST', { commands: ['up'], program_snapshot: '# note\nmove_up(1)', active_seconds: .01 });
  await request(`/attempts/${attempt.attempt_id}/finalize`, 'POST', {});
  const formalScope = '/leaderboard?competition=coin&level=L01&mode=python_blank';
  assert.equal((await request(formalScope)).data.rows.length, 0, 'incomplete formal attempts are excluded');
  const successful = (await request('/attempts', 'POST', { assignment_key: 'P01' })).data;
  const formalLevel = getLevelForAssignment('P01'), commands = solve(formalLevel, formalLevel.required_order);
  assert.ok(commands?.length);
  const program = '# 完成路线\n' + commands.map(dir => `move_${dir}(1)`).join('\n');
  assert.equal((await request(`/attempts/${successful.attempt_id}/commands`, 'POST', { commands, program_snapshot: program, active_seconds: .02 })).status, 200);
  await request(`/attempts/${successful.attempt_id}/finalize`, 'POST', {});
  const formal = (await request(formalScope)).data;
  assert.equal(formal.rows.length, 1); assert.equal(formal.rows[0].id, successful.attempt_id);
  assert.equal(formal.rows[0].code_lines, commands.length); assert.equal(formal.rows[0].seconds, .02);
  const later = (await request('/attempts', 'POST', { assignment_key: 'P01' })).data;
  await request(`/attempts/${later.attempt_id}/finalize`, 'POST', {});
  assert.equal((await request(formalScope)).data.rows[0].id, successful.attempt_id, 'later failure preserves previous success');
  await request('/teacher/leaderboard', 'PUT', { start: null, end: null, rule: null });
  assert.equal((await request(scope)).data.rows[0].score, null);
  assert.equal((await request('/leaderboard/submissions', 'POST', retry)).data.score, null);
  await request(`/teacher/players/${player}/data`, 'DELETE', { confirm_uuid: player });
  assert.equal((await request(scope)).data.rows.length, 0, 'player deletion also removes leaderboard submissions');
  console.log('Leaderboard API: success-only submission, legacy invalid exclusion, replay, idempotency, periods, sorting, latest success, auth, persistence, rules, formal history and deletion passed.');
} finally { await new Promise(r => server.close(r)); closeDb(); }
