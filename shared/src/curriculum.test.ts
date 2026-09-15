import test from 'node:test';
import assert from 'node:assert/strict';
import {robotLevels} from './robot-levels.js';
import {curriculumReferencePrograms} from './curriculum-reference.js';
import {curriculumMapData} from './curriculum-map-data.js';
import {validateAndExpand,countCodeLines,generateInitialRows,generatePythonSource} from './python-template.js';
import {scoreRobotChallenge,verifiedRobotCodeLines} from './robot-scoring.js';
import {replay} from './solver.js';
import {createGameState,step} from './rule-engine.js';

test('robot code starts with a blank loop and requires both count and body',()=>{
  const config=robotLevels()[0].python;
  const rows=generateInitialRows(config);
  assert.equal(rows.length,1);
  assert.equal(rows[0].direction,'repeat');
  assert.equal(rows[0].count,'');
  assert.deepEqual(rows[0].children,[]);
  assert.equal(validateAndExpand(rows,config).valid,false);
  rows[0].count='4';
  assert.equal(validateAndExpand(rows,config).valid,false);
  rows[0].children=[{row_id:'turn',direction:'turn_right',count:'1'}];
  assert.deepEqual(validateAndExpand(rows,config).expanded,Array(4).fill('turn_right'));
  rows[0].count='';
  assert.equal(validateAndExpand(rows,config).valid,false);
  const fresh=generateInitialRows(config);
  assert.notEqual(fresh[0].row_id,rows[0].row_id);
  assert.deepEqual(fresh[0].children,[]);
});

test('all six curriculum maps complete with their published line targets',()=>{
  assert.equal(robotLevels().length,6);
  robotLevels().forEach((level,i)=>{
    const rows=curriculumReferencePrograms()[i];const compiled=validateAndExpand(rows,level.python);
    assert.equal(compiled.valid,true,`${level.title}: ${compiled.errors}`);
    assert.equal(countCodeLines(rows),level.optimal_code_lines);
    const result=replay(level,compiled.expanded!,null);
    assert.equal(result.status,'success',`${level.title}: ${JSON.stringify(result)}`);
    assert.equal(result.collisions,0,level.title);assert.equal(result.collected_order.length,level.coins.length,level.title);
    assert.equal(result.robot!.holding,null);assert.ok(result.consumed_commands<=level.max_commands);
    let state=createGameState(level);
    for(const [index,direction] of compiled.expanded!.entries()) {
      state=step(state,{direction,command_index:index+1,command_id:'verify',source:'keyboard'},null,level.coins.length).state;
    }
    assert.deepEqual(state.collected,result.collected_order);assert.equal(state.consumed_commands,result.consumed_commands);
    if(i<2)assert.deepEqual(result.end,level.start,'intro routes return to their starting point');
  });
});

test('exported maps preserve geometry apart from requested cargo and dock exchanges',()=>{
  for(const [index,key] of [[2,'2'],[3,'3'],[5,'5']] as const) {
    const level=robotLevels()[index],source=curriculumMapData[key];
    for(const field of ['width','height','start','walls','initial_facing'] as const)assert.deepEqual(level[field],source[field],`${key}: ${field}`);
    if(index===3) {
      assert.deepEqual(level.robot,{...source.robot,deliveries:{...source.robot!.deliveries,A:[1,5]}});
      assert.deepEqual(level.coins,source.coins.map(coin=>coin.id==='A'?{...coin,position:[2,6]}:coin));
    } else if(index!==5) {
      assert.deepEqual(level.coins,source.coins);
      assert.deepEqual(level.robot,source.robot);
    } else {
      assert.deepEqual(level.robot,{...source.robot,deliveries:{A:[3,0],B:[6,0],C:[9,0]}});
      assert.deepEqual(level.coins,source.coins.map(coin=>coin.type==='checkpoint'?coin:{...coin,position:source.robot!.deliveries[coin.id]}));
    }
  }
});

test('early visit to home does not satisfy ordered introduction patrol',()=>{
  const level=robotLevels()[1];const result=replay(level,['forward','backward'],null);
  assert.deepEqual(result.collected_order,[]);assert.equal(result.status,'incomplete');
});

test('only level two requires checkpoint order; level one accepts the reverse circuit',()=>{
  robotLevels().forEach((level,i)=>assert.equal(!!level.robot!.checkpoint_order,i===1));
  const result=replay(robotLevels()[0],['turn_right',...Array.from({length:4},()=>[...Array(4).fill('forward'),'turn_left']).flat()],null);
  assert.equal(result.status,'success');
  assert.deepEqual(result.collected_order,['C','B','A','H']);
  assert.ok(curriculumReferencePrograms().every(rows=>rows.every(row=>row.direction==='repeat')));
});

test('final scoring targets and 0/60/80/100 tiers respect mode and actual actions',()=>{
  const levels=robotLevels();
  assert.deepEqual(levels.map(l=>[l.optimal_actions,l.optimal_code_lines]),[[19,3],[27,4],[26,5],[25,7],[35,7],[28,8]]);
  levels.forEach((level,i)=>{
    const rows=curriculumReferencePrograms()[i],commands=validateAndExpand(rows,level.python).expanded!;
    const source=generatePythonSource(rows,level.python),result=replay(level,commands,null);
    assert.equal(scoreRobotChallenge(level,result,'keyboard',commands,source).total_score,80);
    assert.equal(scoreRobotChallenge(level,result,'python_blank',commands,source).total_score,100);
    // Boundary, better-than-target, failed movements, and incomplete targets.
    const score=(actions:number)=>scoreRobotChallenge(level,{...result,consumed_commands:actions},'python_blank',commands,source).total_score;
    assert.equal(score(level.optimal_actions!),100);assert.equal(score(level.optimal_actions!-1),100);
    assert.equal(score(level.optimal_actions!+1),60);
    assert.equal(scoreRobotChallenge(level,{...result,status:'incomplete',collected_order:result.collected_order.slice(1)},'python_blank',commands,source).total_score,0);
    assert.equal(scoreRobotChallenge(level,result,'python_blank',commands,'for i in range(1):\n    grab()\n').total_score,80);
  });
});

test('code bonus uses verified written lines, not a client-provided line count or shorter fake program',()=>{
  const level=robotLevels()[0],rows=curriculumReferencePrograms()[0];
  const commands=validateAndExpand(rows,level.python).expanded!,result=replay(level,commands,null);
  const longer='for i in range(4):\n    forward(2)\n    forward(2)\n    turn_right()\n';
  assert.equal(verifiedRobotCodeLines(longer,level.python,commands),4);
  assert.equal(scoreRobotChallenge(level,result,'python_blank',commands,longer).total_score,80);
  for(const bad of [null,123,'',longer.replace('forward(2)','forward(1)'),longer.replace('    forward(2)','\tforward(2)'), 'for i in range(4):\n    __import__("os")\n',longer.replace('turn_right()','turn_right(0)'),longer.replace('    forward(2)','forward(2)')]) {
    assert.equal(verifiedRobotCodeLines(bad,level.python,commands),undefined);
  }
});
