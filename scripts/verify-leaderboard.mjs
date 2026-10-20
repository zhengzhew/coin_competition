import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { strawberryLevels, beachLevels, warehouseLevels, robotDemoManifests, solveStrawberryRoute, solve } from '../shared/dist/index.js';
import { generatePythonSource, validateAndExpand } from '../shared/dist/index.js';
import { curriculumReferencePrograms } from '../shared/dist/curriculum-reference.js';

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
  const completion = await request(`/attempts/${successful.attempt_id}/commands`, 'POST', { commands, program_snapshot: program, active_seconds: .02 });
  assert.equal(completion.status, 200);
  await request(`/attempts/${successful.attempt_id}/finalize`, 'POST', {});
  const formal = (await request(formalScope)).data;
  assert.equal(formal.rows.length, 1); assert.equal(formal.rows[0].id, successful.attempt_id);
  assert.equal(formal.rows[0].code_lines, commands.length); assert.equal(formal.rows[0].seconds, .02);
  assert.equal(completion.data.leaderboard_score, formal.rows[0].score, 'coin completion uses the same rule as leaderboard');
  const submittedAt = formal.rows[0].submitted_at;
  await request(`/attempts/${successful.attempt_id}/finalize`, 'POST', {});
  assert.equal((await request(formalScope)).data.rows[0].submitted_at, submittedAt, 'repeated finalize preserves the original submission time');
  assert.equal((await request('/assignments/P01')).data.final_score, completion.data.leaderboard_score);
  const formalDashboard = (await request('/teacher/dashboard?competition=coin&level=L01&mode=python_blank')).data;
  assert.equal(formalDashboard.insights.overview.best_score, Math.round(completion.data.leaderboard_score * 10) / 10);
  assert.equal(formalDashboard.recent_attempts.find(a => a.attempt_id === successful.attempt_id).score, completion.data.leaderboard_score);
  for (const mode of ['keyboard', 'python_blank']) {
    const task = getLevelForAssignment(mode === 'keyboard' ? 'FK31' : 'FP31');
    const rows = curriculumReferencePrograms()[0], source = generatePythonSource(rows, task.python);
    const key = mode === 'keyboard' ? task.keyboard_id : task.python_id;
    const round = (await request('/attempts', 'POST', { assignment_key: key })).data;
    const done = (await request(`/attempts/${round.attempt_id}/commands`, 'POST', { commands: validateAndExpand(rows, task.python).expanded, program_snapshot: source, active_seconds: .1 })).data;
    assert.equal(done.status, 'success');
    const rank = (await request(`/leaderboard?competition=future&level=${task.level_id}&mode=${mode}`)).data.rows[0];
    assert.equal(done.leaderboard_score, rank.score);
    assert.equal((await request(`/assignments/${key}`)).data.final_score, rank.score);
    assert.equal(rank.code_lines, mode === 'keyboard' ? 0 : source.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length);
  }
  for (const [competition, task] of [['beach', beachLevels[0]], ['demo', robotDemoManifests[0].configuration]]) {
    const sample = { ...payload, submission_id: randomUUID(), competition, level_id: task.demo_id, content_version: task.content_version, mode: task.supported_modes[0], source: '', steps: 4, seconds: 8 };
    const saved = (await request('/leaderboard/submissions', 'POST', sample)).data;
    assert.equal(saved.score, 92);
    assert.equal((await request(`/leaderboard?competition=${competition}&level=${task.demo_id}&mode=${sample.mode}&version=${task.content_version}`)).data.rows[0].score, saved.score);
  }
  // Warehouse shares identity, periods and latest-success selection, but ranks time only.
  const warehouse = warehouseLevels[0];
  const timed = { ...payload, submission_id: randomUUID(), participant_id: randomUUID(), competition: 'warehouse',
    level_id: warehouse.demo_id, content_version: warehouse.content_version, mode: 'manual', source: '', steps: 0, seconds: 31.25 };
  for (const extra of [{ completed: false }, { seconds: 0 }, { steps: 1 }, { mode: 'auto' }, { content_version: 'warehouse-manual-2' }, { content_version: 'warehouse-manual-3' }, { content_version: 'warehouse-manual-4' }, { content_version: 'warehouse-manual-5' }, { content_version: 'warehouse-manual-6' }, { content_version: 'warehouse-manual-7' }]) {
    assert.equal((await request('/leaderboard/submissions', 'POST', { ...timed, ...extra })).status, 422);
  }
  assert.equal((await request('/leaderboard/submissions', 'POST', timed)).status, 201);
  const timedRetry = await request('/leaderboard/submissions', 'POST', timed);
  assert.equal(timedRetry.status, 200); assert.equal(timedRetry.data.score, null);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM leaderboard_submissions WHERE submission_id = ?').get(timed.submission_id).n, 1);
  const faster = { ...timed, submission_id: randomUUID(), participant_id: randomUUID(), display_name: '更快', seconds: 20.12 };
  const latestTimed = { ...timed, submission_id: randomUUID(), seconds: 35.5 };
  await request('/leaderboard/submissions', 'POST', faster);
  await request('/leaderboard/submissions', 'POST', latestTimed);
  for (const [entry, date] of [[timed, '2026-10-13T01:00:00.000Z'], [faster, '2026-10-13T03:00:00.000Z'], [latestTimed, '2026-10-13T04:00:00.000Z']]) {
    getDb().prepare('UPDATE leaderboard_submissions SET submitted_at = ? WHERE submission_id = ?').run(date, entry.submission_id);
  }
  const timedScope = `/leaderboard?competition=warehouse&level=${warehouse.demo_id}&mode=manual&version=${warehouse.content_version}`;
  // Preserve a real old-version row while proving it cannot compete with the new layout.
  const oldWarehouseId = randomUUID();
  getDb().prepare('INSERT INTO leaderboard_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(oldWarehouseId, player, timed.participant_id, '仓储旧版本', 'warehouse', warehouse.demo_id,
      'manual', 'warehouse-manual-3', 0, 0, 1, 1, '2026-10-13T05:00:00.000Z');
  const timedRank = (await request(timedScope)).data;
  assert.deepEqual(timedRank.rows.map(row => row.seconds), [20.12, 35.5], 'default time ascending; latest success rather than personal best');
  assert.equal(timedRank.score_visible, false); assert(timedRank.rows.every(row => row.score === null));
  assert.equal((await request(timedScope + '&sort=score')).status, 422);
  assert.deepEqual((await request(timedScope + '&order=desc')).data.rows.map(row => row.seconds), [35.5, 20.12]);
  assert.equal((await request(timedScope.replace(warehouse.content_version, 'warehouse-manual-2'))).data.rows.length, 0);
  assert.deepEqual((await request(timedScope.replace(warehouse.content_version, 'warehouse-manual-3'))).data.rows.map(row => row.seconds), [1]);
  assert.equal(getDb().prepare('SELECT content_version FROM leaderboard_submissions WHERE submission_id = ?').get(oldWarehouseId).content_version, 'warehouse-manual-3');
  assert.equal((await request(timedScope.replace(warehouse.demo_id, 'warehouse-2'))).data.rows.length, 0);
  await request('/teacher/leaderboard', 'PUT', config);
  assert.deepEqual((await request(timedScope)).data.rows.map(row => row.seconds), [31.25]);
  assert.deepEqual((await request(timedScope + '&scope=history')).data.rows.map(row => row.seconds), [20.12, 35.5]);
  const warehouseDashboard = (await request('/teacher/dashboard?competition=warehouse')).data;
  assert.equal(warehouseDashboard.catalog.find(event => event.id === 'warehouse').levels.length, 6);
  assert.equal(warehouseDashboard.submissions.rows.length, 4);
  assert(warehouseDashboard.submissions.rows.every(row => row.score === null));
  await request('/teacher/leaderboard', 'PUT', { ...config, start: null, end: null });
  const later = (await request('/attempts', 'POST', { assignment_key: 'P01' })).data;
  await request(`/attempts/${later.attempt_id}/finalize`, 'POST', {});
  assert.equal((await request(formalScope)).data.rows[0].id, successful.attempt_id, 'later failure preserves previous success');
  await request('/teacher/leaderboard', 'PUT', { start: null, end: null, rule: null });
  assert.equal((await request(scope)).data.rows[0].score, null);
  assert.equal((await request('/leaderboard/submissions', 'POST', retry)).data.score, null);
  assert.equal((await request('/assignments/P01')).data.final_score, null, 'clearing rule also hides personal best');
  const hiddenDashboard = (await request('/teacher/dashboard')).data;
  assert.equal(hiddenDashboard.overview.average_score, null);
  assert.equal(hiddenDashboard.insights.overview.mastery_rate, null);
  assert.ok(hiddenDashboard.recent_attempts.every(a => a.score === null));
  const storedScore = getDb().prepare('SELECT score FROM attempts WHERE attempt_id = ?').get(successful.attempt_id).score;
  await request('/teacher/leaderboard', 'PUT', { start: null, end: null, rule: { base: 200, steps: 0, code_lines: 0, seconds: 0, min: 0, max: 200 } });
  const updated = (await request('/teacher/dashboard?competition=coin&level=L01')).data;
  assert.equal(updated.insights.overview.best_score, 200);
  assert.equal(updated.insights.overview.mastery_rate, 100);
  assert.equal((await request('/assignments/P01')).data.final_score, 200);
  assert.equal((await request(formalScope)).data.rows[0].score, 200);
  assert.equal(getDb().prepare('SELECT score FROM attempts WHERE attempt_id = ?').get(successful.attempt_id).score, storedScore, 'current-rule view preserves original stored history');
  await request(`/teacher/players/${player}/data`, 'DELETE', { confirm_uuid: player });
  assert.equal((await request(scope)).data.rows.length, 0, 'player deletion also removes leaderboard submissions');
  console.log('Leaderboard API: success-only submission, legacy invalid exclusion, replay, idempotency, periods, sorting, latest success, auth, persistence, rules, formal history and deletion passed.');
} finally { await new Promise(r => server.close(r)); closeDb(); }
