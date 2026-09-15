import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import {curriculumReferencePrograms} from '../shared/dist/curriculum-reference.js';
import {generatePythonSource,validateAndExpand} from '../shared/dist/index.js';
const directory=mkdtempSync(join(tmpdir(),'robot-scoring-'));
process.env.COIN_DATA_DIR=directory;process.env.TEACHER_KEY='robot-scoring-test';
const {apiRouter}=await import('../server/dist/routes.js');const {closeDb}=await import('../server/dist/db.js');
const app=express();app.use(express.json(),cookieParser());app.use('/api',apiRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const origin=`http://127.0.0.1:${server.address().port}/api`;let cookie='';
async function api(path,body) {
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{cookie,'content-type':'application/json','x-teacher-key':'robot-scoring-test'},body:body===undefined?undefined:JSON.stringify(body)});
  assert.ok(response.ok,`${path} ${response.status}`);
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return response.json();
}
try {
  await api('/players/bootstrap',{});
  const levels=await api('/levels?competition=future');
  const run=async(level,mode,rows,expected,override={})=>{
    const key=mode==='keyboard'?level.keyboard_id:level.python_id;
    const commands=validateAndExpand(rows,level.python).expanded,source=generatePythonSource(rows,level.python);
    const attempt=await api('/attempts',{assignment_key:key});
    const result=await api(`/attempts/${attempt.attempt_id}/commands`,{commands,program_snapshot:source,...override});
    assert.equal(result.score.total_score,expected,`${key} commands`);
    const finalized=await api(`/attempts/${attempt.attempt_id}/finalize`,{});
    assert.equal(finalized.score.total_score,expected,`${key} finalize`);
    const assignment=await api(`/assignments/${key}`);
    assert.equal(assignment.attempts.at(-1).score,expected,`${key} persisted`);
    return result;
  };
  for(const [i,level] of levels.entries()) {
    const rows=curriculumReferencePrograms()[i];
    await run(level,'keyboard',rows,80);await run(level,'python_blank',rows,100);
    const slow=structuredClone(rows);
    slow[0].children.unshift(...Array.from({length:4},(_,n)=>({row_id:`extra${n}`,direction:'turn_right',count:'1'})));
    await run(level,'keyboard',slow,60);await run(level,'python_blank',slow,60);
    const longer=structuredClone(rows),body=longer[0].children;
    const index=body.findIndex(row=>['forward','backward'].includes(row.direction)&&Number(row.count)>1);
    const row=body[index];body.splice(index,1,{...row,count:String(Number(row.count)-1)},{...row,row_id:'split',count:'1'});
    await run(level,'python_blank',longer,80);
    assert.equal((await api(`/assignments/${level.keyboard_id}`)).final_score,80);
    console.log('PASS',level.level_id,'keyboard 60/80, code 60/80/100, finalize and storage');
  }
  const dashboard=await api('/teacher/dashboard?competition=future&level=FL31&mode=keyboard');
  assert.equal(dashboard.insights.overview.mastery_rate,100);
  assert.equal(dashboard.insights.overview.first_mastery,100);
  // New player for incomplete and mismatched-code cases (no classroom data touched).
  cookie='';await api('/players/bootstrap',{});
  const level=levels[0],rows=curriculumReferencePrograms()[0];
  const incomplete=[{row_id:'loop',direction:'repeat',count:'1',children:[{row_id:'f',direction:'forward',count:'4'}]}];
  await run(level,'python_blank',incomplete,0);
  await run(level,'python_blank',rows,80,{program_snapshot:'for i in range(1):\n    grab()\n',code_line_count:1});
  await run(level,'python_blank',rows,80,{program_snapshot:null,code_line_count:1});
  console.log('PASS incomplete=0; fake or missing code cannot earn 100; keyboard mastery uses 80.');
} finally {
  await new Promise(r=>server.close(r));closeDb();
  assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep)&&directory.includes('robot-scoring-'));
  rmSync(directory,{recursive:true,force:true});
}
