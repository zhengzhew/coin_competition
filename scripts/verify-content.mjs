import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { replay, solve } from '../shared/dist/index.js';

const pack = JSON.parse(readFileSync(resolve('levels.teacher.json'), 'utf8'));
assert.equal(pack.levels.length, 20, 'must contain 20 maps');
assert.equal(pack.max_coins, 6, 'maximum coin count must be 6');
const expectedCoins = [1,1,1,2,2,2,2,3,3,3,4,4,4,4,5,5,5,6,6,6];

for (const [index, level] of pack.levels.entries()) {
  assert.equal(level.coins.length, expectedCoins[index], `${level.level_id} coin progression`);
  assert.match(level.keyboard_id, /^K\d{2}$/);
  assert.match(level.python_id, /^P\d{2}$/);
  assert.equal(level.python.allowed_functions.length, 4);
  const route = solve(level, level.required_order);
  assert.ok(route, `${level.level_id} must be solvable`);
  assert.equal(route.length, level.expected_optimal_steps, `${level.level_id} optimal length`);
  assert.equal(replay(level, route, level.required_order).status, 'success');
}

console.log(`content verified: ${pack.levels.length} maps, ${pack.levels.length * 2} assignments, up to ${pack.max_coins} coins`);
