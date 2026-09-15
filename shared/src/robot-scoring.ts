import type {Action,LevelDef,Mode,PythonConfig,ScoreResult} from './types.js';
import type {ReplayResult} from './solver.js';
import {countCodeLines,validateAndExpand,type TemplateRow} from './python-template.js';

/** Parse the editor's restricted Python display format; never execute submitted code. */
export function verifiedRobotCodeLines(source:unknown,config:PythonConfig,commands:Action[]):number|undefined {
  if(typeof source!=='string'||source.length>8000)return undefined;
  const rows:TemplateRow[]=[],stack:TemplateRow[][]=[rows];
  const lines=source.split(/\r?\n/).filter(line=>line.trim());
  if(!lines.length||lines.length>config.max_rows)return undefined;
  for(const [index,line] of lines.entries()) {
    const match=/^( *)(\S.*)$/.exec(line);
    if(!match||match[1].length%4!==0)return undefined;
    const depth=match[1].length/4;
    if(depth>3||depth>=stack.length)return undefined;
    stack.length=depth+1;
    const loop=/^for i in range\((\d+)\):$/.exec(match[2]);
    const action=/^(forward|backward|turn_left|turn_right|grab|release|wait)\((\d*)\)$/.exec(match[2]);
    if(loop) {
      const row:TemplateRow={row_id:String(index),direction:'repeat',count:loop[1],children:[]};
      stack[depth].push(row);stack.push(row.children!);
    } else if(action) {
      const needsCount=['forward','backward','wait'].includes(action[1]);
      if(needsCount?!action[2]:!!action[2])return undefined;
      stack[depth].push({row_id:String(index),direction:action[1],count:needsCount?action[2]:'1'});
    } else return undefined;
  }
  if(rows.some(row=>row.direction!=='repeat'))return undefined;
  const compiled=validateAndExpand(rows,config);
  if(!compiled.valid||compiled.expanded?.length!==commands.length||compiled.expanded.some((action,i)=>action!==commands[i]))return undefined;
  return countCodeLines(rows);
}

/** Completed tasks earn 60; efficient actions unlock 80; efficient code unlocks 100. */
export function scoreRobotChallenge(level:LevelDef,result:ReplayResult,mode:Mode,commands:Action[],source?:unknown):ScoreResult {
  const complete=result.status==='success'&&level.coins.every(coin=>result.collected_order.includes(coin.id));
  const actionsOptimal=complete&&result.consumed_commands<=level.optimal_actions!;
  const codeLines=mode==='python_blank'?verifiedRobotCodeLines(source,level.python,commands):undefined;
  const collection=complete?60:0,actions=actionsOptimal?20:0;
  const code=actionsOptimal&&codeLines!==undefined&&level.optimal_code_lines!==undefined&&codeLines<=level.optimal_code_lines?20:0;
  return {
    collection_score:collection,route_score:actions+code,total_score:collection+actions+code,
    action_score:actions,code_score:code,action_count:result.consumed_commands,optimal_actions:level.optimal_actions,
    code_lines:codeLines,optimal_code_lines:level.optimal_code_lines,code_verified:codeLines!==undefined,max_score:mode==='keyboard'?80:100,
    collected_count:result.collected_order.length,total_coins:level.coins.length,steps:result.steps,
    collected_value:result.collected_order.length,total_value:level.coins.length,
  };
}
