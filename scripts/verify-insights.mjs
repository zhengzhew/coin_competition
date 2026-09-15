import assert from 'node:assert/strict';
import { buildInsights } from '../server/dist/insights.js';
const base = { player_uuid: 'a', display_name: '甲', assignment_key: 'K01', mode: 'keyboard', status: 'stopped', steps: 5, collisions: 2, started_at: '2026-09-09T00:00:00Z', finalized_at: '2026-09-09T00:00:10Z' };
const attempts = [
  { ...base, attempt_id: 'a1', trial_index: 1, score: 20 },
  { ...base, attempt_id: 'a2', trial_index: 2, score: 80 },
  { ...base, attempt_id: 'a3', trial_index: 3, score: 50 },
  { ...base, attempt_id: 'a4', trial_index: 4, score: 100 },
  { ...base, player_uuid: 'b', attempt_id: 'b1', trial_index: 1, score: 100, status: 'running', finalized_at: null },
  { ...base, player_uuid: 'c', attempt_id: 'c1', trial_index: 1, score: null },
  { ...base, player_uuid: 'd', attempt_id: 'd1', trial_index: 1, score: 60, status: 'success', assignment_key: 'K16' },
];
const event = { attempt_id: 'a1', player_uuid: 'a', event_type: 'attempt_started', payload: JSON.stringify({ entry_to_start_ms: 10000 }) };
const result = buildInsights(attempts, [event, event, { ...event, player_uuid: 'other', payload: '{"entry_to_start_ms":90000}' }], []);
assert.equal(result.overview.first_n, 2);
assert.equal(result.overview.first_score, 40);
assert.equal(result.overview.best_score, 70);
assert.equal(result.overview.gain, 60);
assert.equal(result.overview.gain_n, 1);
assert.equal(result.overview.mastered, 0, 'budget settlement alone is not mastery');
assert.equal(result.overview.exhausted, 1);
assert.equal(result.overview.preparation_n, 1, 'deduplicate formal start events and reject wrong owner');
assert.equal(result.overview.preparation_s, 10);
assert.equal(result.overview.duration_s, 10);
assert.equal(result.quality.excluded_legacy, 1);
assert.equal(result.quality.missing_scores, 1);
const empty = buildInsights([], [], []);
assert.equal(empty.overview.first_score, null);
assert.equal(empty.overview.mastery_rate, null);
assert.equal(empty.overview.gain, null);
console.log('通过：首次/最高/配对提升、预算关达成、准备时间去重、缺失值与空样本口径。');
