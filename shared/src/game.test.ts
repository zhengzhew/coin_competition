import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, createUuid, generateInitialRows, generatePythonSource, step, replay, solve,
  validateAndExpand, type LevelDef,
} from './index.js';

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

test('a locked ordered coin is skipped without ending the attempt', () => {
  const ordered = { ...level, walls: [], start: [2, 2] as [number, number] };
  const result = step(createGameState(ordered), {
    direction: 'right', command_index: 1, command_id: 'c2', source: 'keyboard',
  }, ordered.required_order, ordered.coins.length, ordered.max_commands);
  assert.equal(result.event.type, 'order_violation');
  assert.equal(result.state.status, 'running');
  assert.deepEqual(result.state.collected, []);
});

test('a budget level settles after its successful-move limit', () => {
  const budget = { ...level, coins: [{ id: 'A', position: [3, 2] as [number, number] }], walls: [], required_order: null, step_limit: 2 };
  const first = step(createGameState(budget), {
    direction: 'right', command_index: 1, command_id: 'c3', source: 'keyboard',
  }, null, budget.coins.length, budget.max_commands, budget.step_limit);
  const second = step(first.state, {
    direction: 'left', command_index: 2, command_id: 'c4', source: 'keyboard',
  }, null, budget.coins.length, budget.max_commands, budget.step_limit);
  assert.equal(second.event.type, 'budget_exhausted');
  assert.equal(second.state.status, 'success');
  assert.equal(second.state.steps, 2);
});

test('Python blanks retain and reject invalid raw count input', () => {
  const result = validateAndExpand([
    { row_id: 'r1', direction: 'right', count: '2+2' },
  ], { ...level.python, initial_rows: 1 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /整数/);
});

test('command rows expand the number inside movement parentheses', () => {
  const rows = [
    { row_id: 'r1', direction: 'right', count: '3' },
    { row_id: 'r2', direction: 'up', count: '2' },
  ];
  const result = validateAndExpand(rows, level.python);
  assert.equal(result.valid, true);
  assert.deepEqual(result.expanded, ['right', 'right', 'right', 'up', 'up']);
  assert.equal(generatePythonSource(rows, level.python), 'move_right(3)\nmove_up(2)\n');
  assert.deepEqual(generateInitialRows(level.python), []);
});

test('command rows require a positive step count', () => {
  const result = validateAndExpand([
    { row_id: 'r1', direction: 'left', count: '0' },
  ], level.python);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /1-20/);
});

test('UUID generation falls back to getRandomValues when randomUUID is unavailable', () => {
  const uuid = createUuid({
    getRandomValues(values) {
      values.forEach((_, index) => { values[index] = index; });
      return values;
    },
  });
  assert.equal(uuid, '00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('UUID generation prefers the native randomUUID implementation', () => {
  const expected = '11111111-2222-4333-8444-555555555555';
  assert.equal(createUuid({ randomUUID: () => expected }), expected);
});
