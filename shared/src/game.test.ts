import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, step, replay, solve, validateAndExpand, type LevelDef } from './index.js';

const level: LevelDef = {
  level_id: 'LXX', keyboard_id: 'KXX', python_id: 'PXX', title: 'test', stage: 'challenge',
  width: 4, height: 3, start: [0, 0],
  coins: [{ id: 'A', position: [2, 0] }, { id: 'B', position: [3, 2] }],
  walls: [[1, 0]], required_order: ['A', 'B'], max_commands: 64,
  expected_optimal_steps: 7, knowledge: '', objective: '',
  python: { template_id: 'repeat_slots_v2', initial_rows: 2, min_rows: 1, max_rows: 6,
    can_add_delete_rows: true, count_range: [0, 20],
    allowed_functions: ['move_up()', 'move_down()', 'move_left()', 'move_right()'] },
};

test('solver route replays successfully and respects the wall', () => {
  const path = solve(level, level.required_order);
  assert.ok(path);
  const result = replay(level, path, level.required_order);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.collected_order, ['A', 'B']);
  assert.equal(result.steps, 7);
});

test('rule engine counts a collision without moving the car', () => {
  const state = createGameState(level);
  const result = step(state, {
    direction: 'right', command_index: 1, command_id: 'c1', source: 'keyboard',
  }, level.required_order, level.coins.length, level.max_commands);
  assert.equal(result.event.type, 'collision');
  assert.equal(result.state.x, 0);
  assert.equal(result.state.collisions, 1);
  assert.equal(result.state.consumed_commands, 1);
});

test('Python blanks retain and reject invalid raw count input', () => {
  const result = validateAndExpand([
    { row_id: 'r1', direction: 'right', count: '2+2' },
  ], { ...level.python, initial_rows: 1 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /整数/);
});
