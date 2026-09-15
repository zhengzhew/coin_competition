import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, step } from './rule-engine.js';
import { legacyRobotLevels as robotLevels } from './robot-levels.js';
import type { Action, Direction } from './types.js';

test('initial robot heading controls first move in all four directions',()=>{
  const moves: [Direction,number,number][] = [['up',2,3],['right',3,2],['down',2,1],['left',1,2]];
  for(const [facing,x,y] of moves) {
    const level=robotLevels()[0];level.start=[2,2];level.robot!.facing=facing;
    level.robot!.cells=Array.from({length:25},(_,i)=>[i%5,Math.floor(i/5),0]);
    const next=step(createGameState(level),{direction:'forward',command_index:0,command_id:'test',source:'keyboard'},null,1).state;
    assert.deepEqual([next.x,next.y],[x,y]);
  }
});

test('checkpoint is reached by movement only, counts once, and does not replace delivery goals',()=>{
  const level=robotLevels()[0];
  level.coins.push({id:'B',position:[2,4],type:'checkpoint',value:1});
  let state=createGameState(level);
  const run=(direction:Action)=>{state=step(state,{direction,command_index:state.consumed_commands,command_id:'test',source:'keyboard'},null,2).state;};
  assert.equal(state.robot!.cargo.B,undefined);
  run('turn_right');run('grab');assert.equal(state.robot!.holding,null);assert.deepEqual(state.collected,[]);
  run('forward');assert.deepEqual(state.collected,['B']);assert.equal(state.status,'running');
  run('backward');run('forward');assert.deepEqual(state.collected,['B']);
  run('backward');run('turn_left');run('grab');run('turn_right');run('turn_right');run('release');
  assert.equal(state.status,'success');assert.deepEqual(state.collected,['B','A']);assert.equal(state.collected_mask,3);
});

test('checkpoint-only map needs no dock and cannot finish on a turn or collision',()=>{
  const level=robotLevels()[0];level.coins=[{id:'A',position:[2,4],type:'checkpoint'}];level.robot!.deliveries={};
  let state=createGameState(level);
  const run=(direction:Action)=>{state=step(state,{direction,command_index:state.consumed_commands,command_id:'test',source:'keyboard'},null,1).state;};
  run('turn_left');run('forward');run('forward');assert.equal(state.status,'running');assert.equal(state.collisions,1);
  run('turn_right');run('turn_right');run('forward');run('forward');assert.equal(state.status,'success');assert.deepEqual(state.collected,['A']);
});
