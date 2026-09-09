import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { replay, solve } from '../shared/dist/index.js';

const pack = JSON.parse(readFileSync(resolve('levels.teacher.json'), 'utf8'));
const teacherPack = JSON.parse(readFileSync(resolve('solutions.teacher.json'), 'utf8'));
assert.equal(pack.levels.length, 20, 'must contain 20 maps');
assert.equal(pack.max_coins, 8, 'maximum coin count must be 8');
const expectedCoins = [2,3,4,3,4,5,5,4,5,5,5,4,4,4,4,5,6,7,7,8];
const expectedSizes = [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,7,7,8,8,9];
const expectedBudgets = [20,16,19,17,22];
const expectedBudgetRouteSteps = [20,16,18,13,21];

for (const [index, level] of pack.levels.entries()) {
  assert.equal(level.coins.length, expectedCoins[index], `${level.level_id} coin progression`);
  assert.deepEqual([level.width, level.height], [expectedSizes[index], expectedSizes[index]], `${level.level_id} map size`);
  assert.deepEqual(level.start, [0, level.height - 1], `${level.level_id} starts at top-left`);
  assert.match(level.keyboard_id, /^K\d{2}$/);
  assert.match(level.python_id, /^P\d{2}$/);
  assert.equal(level.python.allowed_functions.length, 4);
  const route = solve(level, level.required_order);
  assert.ok(route, `${level.level_id} must be solvable`);
  if (!level.step_limit) {
    assert.equal(route.length, level.expected_optimal_steps, `${level.level_id} optimal length`);
    assert.equal(replay(level, route, level.required_order).status, 'success');
  } else {
    assert.equal(level.step_limit, expectedBudgets[index - 15], `${level.level_id} step budget`);
    assert.ok(level.expected_max_value > 0, `${level.level_id} expected budget value`);
  }
}

for (const [offset, level] of pack.levels.slice(15).entries()) {
  const solution = teacherPack.solutions.find((item) => item.level_id === level.level_id);
  assert.ok(solution, `${level.level_id} teacher route exists`);
  assert.equal(solution.commands.length, expectedBudgetRouteSteps[offset], `${level.level_id} documented route length`);
  const result = replay(level, solution.commands, level.required_order);
  const collectedValue = level.coins
    .filter((coin) => result.collected_order.includes(coin.id))
    .reduce((sum, coin) => sum + (coin.value ?? 1), 0);
  assert.equal(collectedValue, level.expected_max_value, `${level.level_id} documented maximum value`);
  assert.ok(result.steps <= level.step_limit, `${level.level_id} route stays inside budget`);
}

const level6 = pack.levels[5];
// Screenshot replacements, in top-origin [row, column] coordinates.
const replacementMaps = [
  { coins: [[0,4],[1,0],[1,4],[3,3]], walls: [[0,2],[1,2],[2,2],[3,2]], route: [['down',4],['right',3],['up',3],['right',1],['up',1]], steps: 12 },
  { coins: [[0,4],[2,2],[4,1],[4,4]], walls: [[0,1],[1,1],[2,1],[3,1],[1,3],[2,3],[3,3],[4,3]], route: [['down',4],['right',2],['up',4],['right',2],['down',4]], steps: 16 },
  { coins: [[0,3],[2,1],[4,0],[4,4]], walls: [[1,0],[1,1],[1,2],[1,3],[3,0],[3,1],[3,2],[3,3]], route: [['right',4],['down',2],['left',3],['right',3],['down',2],['left',4]], steps: 18 },
];
for (const [offset, expected] of replacementMaps.entries()) {
  const level = pack.levels[12 + offset];
  const convert = points => points.map(([row, column]) => [column, 4 - row]);
  assert.deepEqual(level.coins.map(coin => coin.position), convert(expected.coins));
  assert.deepEqual(level.walls, convert(expected.walls));
  const commands = expected.route.flatMap(([direction, count]) => Array(count).fill(direction));
  const result = replay(level, commands, null);
  assert.equal(result.status, 'success');
  assert.equal(result.collisions, 0);
  assert.equal(result.steps, expected.steps);
}
const level7 = pack.levels[6];
assert.deepEqual(level6.coins.map((coin) => coin.position).sort(), level7.coins.map((coin) => coin.position).sort(), 'L06/L07 must use the same map');
assert.equal(pack.levels.slice(0, 5).some((level) => /最短|最优步数|最小步数/.test(`${level.objective}${level.rule_hint}`)), false, 'L01-L05 must not preview shortest-path wording');

console.log(`content verified: ${pack.levels.length} maps, 7 categories, ${expectedBudgets.length} budget levels, up to ${pack.max_coins} targets`);
