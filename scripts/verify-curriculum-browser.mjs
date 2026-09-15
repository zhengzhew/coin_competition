import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import {curriculumReferencePrograms} from '../shared/dist/curriculum-reference.js';
import {validateAndExpand,generatePythonSource,replay} from '../shared/dist/index.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=mkdtempSync(join(tmpdir(),'curriculum-browser-'));
process.env.COIN_DATA_DIR=directory;process.env.TEACHER_KEY='curriculum-browser-test';
const {apiRouter}=await import('../server/dist/routes.js');const {closeDb}=await import('../server/dist/db.js');
const app=express();app.use(express.json(),cookieParser());app.use('/api',apiRouter);app.use(express.static(resolve('client/dist')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const origin=`http://127.0.0.1:${server.address().port}`,output=resolve('outputs/curriculum-916');mkdirSync(output,{recursive:true});
let browser;const errors=[],report=[];
try {
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1452,height:1114}});
  const api=async(path,body)=>{const response=await context.request.fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',data:body});assert.ok(response.ok(),`${path}: ${response.status()}`);return response.json();};
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/future/');await page.locator('[data-track-id="onboarding.mode.keyboard"]').click();await page.locator('canvas[data-ready=true]').waitFor();
  const levels=await api('/levels?competition=future');assert.deepEqual(levels.map(l=>l.level_id),['FL31','FL32','FL33','FL34','FL35','FL36']);
  await page.locator('[data-track-id="attempt.start"]').click();
  const keys={forward:'w',backward:'s',turn_left:'a',turn_right:'d',grab:'g',release:'r',wait:'Space'};
  const first=validateAndExpand(curriculumReferencePrograms()[0],levels[0].python).expanded;
  for(const action of first) {
    if(await page.locator('.score-total b').count())break;
    const response=page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().method()==='POST');await page.keyboard.press(keys[action]);
    const result=await (await response).json();assert.equal(Number(await page.locator('[data-track-id="status.actions"] b').innerText()),result.consumed_commands);
    if(result.is_terminal)break;
  }
  await page.locator('.score-total b').filter({hasText:'80'}).waitFor();
  assert.equal(await page.locator('.score-total em').innerText(),'/ 80');
  assert.equal(await page.locator('[data-track-id="attempt.next_level"]').count(),1);
  for(const [index,level] of levels.entries()) {
    const rows=curriculumReferencePrograms()[index],commands=validateAndExpand(rows,level.python).expanded;
    const expected=replay(level,commands,null);
    for(const assignment_key of [level.keyboard_id,level.python_id]) {
      const attempt=await api('/attempts',{assignment_key});const result=await api(`/attempts/${attempt.attempt_id}/commands`,{commands,program_snapshot:generatePythonSource(rows,level.python)});
      assert.equal(result.score.total_score,assignment_key===level.keyboard_id?80:100);assert.equal(result.collisions,0);assert.deepEqual(result.collected_order,expected.collected_order);assert.equal(result.consumed_commands,expected.consumed_commands);
    }
    // Check real map and actual code editor execution for every curriculum level.
    const code=await context.newPage();code.on('pageerror',e=>errors.push(e.message));await code.goto(origin+'/future/');await code.locator('[data-track-id="onboarding.mode.python_blank"]').click();
    await code.locator(`[data-track-id="nav.level.${level.level_id}"]`).click();await code.locator(`canvas[data-level-id="${level.level_id}"][data-ready=true]`).waitFor();
    await code.screenshot({path:join(output,`${index+1}-map.png`)});
    const marks=await code.locator('canvas').evaluate(c=>JSON.parse(c.dataset.checkpoints));
    assert.ok(marks.every(mark=>mark.label===(index===1?mark.id:'●')));
    assert.equal(await code.locator('.robot-map-compass').count(),1);
    assert.match(await code.locator('.robot-map-compass').textContent(),/北南西东/);
    assert.doesNotMatch(await code.locator('.city3d-directions').textContent(),/W|S/);
    if(index===5) {
      const compass=code.locator('.robot-map-compass');
      const position=await compass.boundingBox();
      const north=await compass.locator('[data-direction="up"]').getAttribute('data-screen-direction');
      const stage=await code.locator('canvas').boundingBox();
      await code.mouse.move(stage.x+stage.width*.5,stage.y+stage.height*.5);await code.mouse.down();
      await code.mouse.move(stage.x+stage.width*.7,stage.y+stage.height*.5,{steps:12});await code.mouse.up();
      await code.waitForFunction(previous=>document.querySelector('.robot-map-compass [data-direction="up"]').dataset.screenDirection!==previous,north);
      assert.deepEqual(await compass.boundingBox(),position);
      await code.locator('[data-track-id="camera.view.top"]').click();
      await code.waitForFunction(()=>document.querySelector('.robot-map-compass [data-direction="up"]').dataset.screenDirection==='0.000,-1.000');
      await code.locator('[data-track-id="camera.view.follow"]').click();
      assert.deepEqual(await compass.boundingBox(),position);
      await code.locator('[data-track-id="camera.reset"]').click();
    }
    assert.equal(await code.locator('.robot-loop').count(),1);
    assert.equal(await code.getByRole('textbox',{name:'循环次数'}).inputValue(),'');
    assert.equal(await code.locator('.robot-code-row').count(),0);
    assert.equal(await code.locator('.robot-loop.selected').count(),1);
    assert.equal(await code.locator('[data-track-id="nav.level.FL37"]').count(),0);
    if(index===0) {
      const before=await api('/assignments/FP31');
      await code.locator('[data-track-id="python.run"]').click();
      await code.locator('.editor-error').waitFor();
      assert.equal((await api('/assignments/FP31')).remaining_attempts,before.remaining_attempts);
    }
    assert.equal(rows.length,1);
    const snapshot=()=>code.locator('.robot-code').evaluate(el=>({html:el.innerHTML,values:[...el.querySelectorAll('input')].map(i=>i.value)}));
    const add=async row=>{
      if(row.direction==='repeat') {
        await code.getByRole('button',{name:'循环',exact:true}).last().click();await code.getByRole('textbox',{name:'循环次数'}).last().fill(row.count);
        for(const child of row.children)await add(child);
      } else {await code.locator(`[data-track-id="python.command.add.${row.direction}"]`).click();if(['forward','backward','wait'].includes(row.direction))await code.locator('.robot-code-row').last().locator('input').fill(row.count);}
    };
    assert.equal(await code.locator('[data-track-id="python.loop.add"]').count(),0);
    for(const row of rows)await add(row);
    assert.match(await code.locator('[data-track-id="python.line-count"]').innerText(),new RegExp(`当前 ${level.optimal_code_lines} 行`));
    const written=await snapshot();
    await code.locator('[data-track-id="python.restart"]').click();
    assert.deepEqual(await snapshot(),written);
    await code.locator('[data-track-id="python.run"]').click();await code.locator('.score-total b').filter({hasText:'100'}).waitFor({timeout:45000});
    assert.equal(Number(await code.locator('[data-track-id="status.actions"] b').innerText()),expected.consumed_commands);
    assert.match(await code.locator('[data-track-id="python.line-result"]').innerText(),/达成最优目标/);
    await code.screenshot({path:join(output,`${index+1}-completed.png`)});
    const completedProgram=await snapshot();
    await code.locator('[data-track-id="python.restart"]').click();
    assert.deepEqual(await snapshot(),completedProgram);
    assert.equal(Number(await code.locator('[data-track-id="status.actions"] b').innerText()),0);
    assert.equal(await code.locator('.score-total b').count(),0);
    if(index===5) {
      await code.locator('[data-track-id="nav.level.FL35"]').click();await code.locator('canvas[data-level-id=FL35][data-ready=true]').waitFor();
      await code.locator('canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await code.locator('.robot-fallback').waitFor();
      assert.equal(await code.locator('.robot-map-compass').count(),1);
      assert.ok((await code.locator('.robot-fallback [aria-label^="巡逻点"] text').allTextContents()).every(text=>text==='●'||text==='✓'));
    }
    await code.close();report.push({level:level.level_id,title:level.title,actions:expected.consumed_commands,codeLines:level.optimal_code_lines,passed:true});console.log('PASS',level.level_id,level.title);
  }
  // A fresh student can fill the preselected loop, retry an incomplete run,
  // and keep all instructions inside their loops.
  const retryContext=await browser.newContext({viewport:{width:1452,height:1114}});
  const retry=await retryContext.newPage();retry.on('pageerror',e=>errors.push(e.message));
  await retry.goto(origin+'/future/');await retry.locator('[data-track-id="onboarding.mode.python_blank"]').click();
  await retry.getByRole('textbox',{name:'循环次数'}).fill('2');
  await retry.locator('[data-track-id="python.command.add.forward"]').click();
  assert.equal(await retry.locator('.robot-loop .robot-code-row').count(),1);
  assert.equal(await retry.getByRole('button',{name:'添加到循环外',exact:true}).count(),0);
  await retry.locator('[data-track-id="python.command.add.turn_right"]').click();
  const retrySnapshot=()=>retry.locator('.robot-code').evaluate(el=>({html:el.innerHTML,values:[...el.querySelectorAll('input')].map(i=>i.value)}));
  const saved=await retrySnapshot();
  await retry.locator('[data-track-id="python.run"]').click();
  await retry.locator('.score-total b').waitFor();
  assert.equal(Number(await retry.locator('[data-track-id="status.actions"] b').innerText()),4);
  await retry.locator('[data-track-id="attempt.reset_after_score"]').click();
  assert.deepEqual(await retrySnapshot(),saved);
  assert.equal(Number(await retry.locator('[data-track-id="status.actions"] b').innerText()),0);
  assert.equal(await retry.locator('.score-total b').count(),0);
  await retry.locator('[data-track-id="nav.level.FL31"]').click();
  assert.deepEqual(await retrySnapshot(),saved);
  await retry.screenshot({path:join(output,'restart-preserved.png')});
  await retry.locator('[data-track-id="nav.level.FL32"]').click();
  assert.equal(await retry.getByRole('textbox',{name:'循环次数'}).inputValue(),'');
  assert.equal(await retry.locator('.robot-code-row').count(),0);
  await retry.locator('[data-track-id="python.command.add.backward"]').click();
  assert.equal(await retry.locator('.robot-loop.selected .robot-code-row').count(),1);
  await retry.getByRole('button',{name:'删除循环',exact:true}).click();
  await retry.locator('[data-track-id="python.command.add.grab"]').click();
  assert.equal(await retry.locator('.robot-loop.selected .robot-code-row').count(),1);
  assert.equal(await retry.locator('.robot-code > .robot-code-row').count(),0);
  assert.equal(await retry.getByRole('textbox',{name:'循环次数'}).inputValue(),'');
  await retryContext.close();
  console.log('PASS blank loop, automatic insertion, incomplete retry and code preservation');
  const legacy=await api('/levels/FL21');assert.ok(legacy.robot);assert.equal(legacy.title,'夹爪初体验');
  const coin=await api('/levels');assert.equal(coin.length,20);
  const response=await context.request.get(origin+'/api/teacher/dashboard?competition=future&level=FL34',{headers:{'x-teacher-key':'curriculum-browser-test'}});assert.equal(response.status(),200);assert.equal((await response.json()).insights.levels.length,2);
  assert.deepEqual(errors,[]);writeFileSync(join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser?.close();await new Promise(r=>server.close(r));closeDb();rmSync(directory,{recursive:true,force:true});}
