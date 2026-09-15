import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, createUuid, generateInitialRows, generatePythonSource, step, replay, solve,
  validateAndExpand, legacyRobotLevels as robotLevels, countCodeLines, type Action, type LevelDef,
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

test('robot turns in place, reverses relative to heading, and never automatically collects cargo',()=>{
  const level=robotLevels()[1];let state=createGameState(level);
  const run=(direction:Action)=>{state=step(state,{direction,command_index:state.consumed_commands+1,command_id:'test',source:'keyboard'},null,level.coins.length).state;};
  run('forward');assert.equal(state.collisions,1);assert.equal(state.steps,0);assert.equal(state.collected.length,0);
  run('turn_right');assert.deepEqual([state.x,state.y],[1,4]);assert.equal(state.robot!.facing,'right');assert.equal(state.steps,0);
  run('forward');assert.deepEqual([state.x,state.y],[2,4]);
  run('backward');assert.deepEqual([state.x,state.y],[1,4]);assert.equal(state.robot!.facing,'right');
  run('turn_left');run('grab');assert.equal(state.robot!.holding,'A');assert.equal(state.collected.length,0);
  run('release');assert.deepEqual(state.robot!.cargo.A,[1,5]);assert.equal(state.collected.length,0);
  run('grab');run('turn_left');run('turn_left');run('release');assert.deepEqual(state.collected,['A']);assert.equal(state.robot!.holding,null);
});

test('all six cargo scenes complete with the same repeated program and server replay',()=>{
  const cycle:Action[]=['grab','turn_right','turn_right','release','turn_right','turn_right','turn_right','forward','forward','forward','turn_left'];
  for(const level of robotLevels()) {
    const rows=[{row_id:'loop',direction:'repeat',count:String(level.coins.length),children:cycle.map((direction,i)=>({row_id:String(i),direction,count:'1'}))}];
    const compiled=validateAndExpand(rows,level.python);assert.equal(compiled.valid,true);
    const result=replay(level,compiled.expanded!,null);assert.equal(result.status,'success');assert.equal(result.collisions,0);
    assert.equal(result.collected_order.length,level.coins.length);assert.equal(result.steps,3*(level.coins.length-1));
    assert.equal(result.robot!.holding,null);
  }
});

test('robot empty grabs, illegal release, edges and loop limits preserve cargo',()=>{
  const level=robotLevels()[0];let state=createGameState(level);
  const run=(direction:Action)=>{state=step(state,{direction,command_index:state.consumed_commands+1,command_id:'test',source:'keyboard'},null,1).state;};
  run('grab');run('turn_right');run('forward');run('turn_left');run('release');
  assert.equal(state.robot!.holding,'A','cannot release over a gap');assert.equal(state.robot!.closed,true);
  run('forward');assert.equal(state.collisions,1);
  const invalid=validateAndExpand([{row_id:'x',direction:'repeat',count:'20',children:[{row_id:'y',direction:'forward',count:'20'}]}],level.python);
  assert.equal(invalid.valid,false);
  assert.equal(validateAndExpand([{row_id:'x',direction:'up',count:'1'}],level.python).valid,false);
  assert.equal(validateAndExpand([{row_id:'x',direction:'repeat',count:'2',children:[]}],level.python).valid,false);
});

test('code line targets are achievable; loop count and move count do not inflate written lines',()=>{
  for(const level of robotLevels()) {
    const actions=level.coins.length===1?['grab','turn_right','turn_right','release']:['grab','turn_right','turn_right','release','turn_left','forward','turn_left'];
    const body=actions.map((direction,i)=>({row_id:String(i),direction,count:direction==='forward'?'3':'1'}));
    const rows=level.coins.length===1?body:[{row_id:'loop',direction:'repeat',count:String(level.coins.length),children:body}];
    assert.equal(countCodeLines(rows),level.optimal_code_lines);
    const compiled=validateAndExpand(rows,level.python);assert.equal(compiled.valid,true);
    const result=replay(level,compiled.expanded!,null);assert.equal(result.status,'success');assert.equal(result.collisions,0);
    assert.equal(result.collected_order.length,level.coins.length);
  }
  assert.equal(countCodeLines([]),0);
  assert.equal(countCodeLines([{row_id:'loop',direction:'repeat',count:'20',children:[{row_id:'f',direction:'forward',count:'20'}]}]),2);
});
