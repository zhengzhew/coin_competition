import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const base = process.env.LOADTEST_URL || 'http://127.0.0.1:3001';
const users = Number(process.env.LOADTEST_USERS || 40);

async function json(path, options = {}, cookie = '') {
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`);
  return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function student(index) {
  const started = performance.now();
  let response = await json('/api/players/bootstrap', { method: 'POST', body: '{}' });
  const cookie = response.cookie;
  await json('/api/players/profile', { method: 'PATCH', body: JSON.stringify({ language_experience: index % 2 ? 'cpp' : 'python' }) }, cookie);
  response = await json('/api/attempts', { method: 'POST', body: JSON.stringify({ assignment_key: 'K01' }) }, cookie);
  const attempt = response.body.attempt_id;
  response = await json('/api/event-streams', { method: 'POST', body: JSON.stringify({ scope: 'loadtest' }) }, cookie);
  const stream = response.body.stream_id;
  const page = crypto.randomUUID();
  const events = Array.from({ length: 30 }, (_, eventIndex) => ({
    schema_version: '2.0.0', event_id: crypto.randomUUID(), player_uuid: null, session_id: null,
    assignment_key: 'K01', level_id: 'L01', mode: 'keyboard', attempt_id: attempt,
    stream_id: stream, seq: eventIndex + 1, event_type: 'loadtest_interaction', element_id: 'move.right',
    interaction_id: crypto.randomUUID(), client_time: new Date().toISOString(), page_instance_id: page,
    mono_ms: eventIndex, elapsed_ms: eventIndex, payload: { user: index, event: eventIndex },
  }));
  await Promise.all([
    json(`/api/event-streams/${stream}/batches`, { method: 'POST', body: JSON.stringify({ events }) }, cookie),
    json(`/api/attempts/${attempt}/commands`, { method: 'POST', body: JSON.stringify({ commands: ['right', 'right'] }) }, cookie),
  ]);
  return performance.now() - started;
}

const started = performance.now();
const timings = await Promise.all(Array.from({ length: users }, (_, index) => student(index)));
const health = await json('/api/health');
assert.equal(health.body.status, 'ok');
console.log(JSON.stringify({ users, wall_ms: Math.round(performance.now() - started), max_user_ms: Math.round(Math.max(...timings)), failures: 0 }));
