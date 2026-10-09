import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=mkdtempSync(join(tmpdir(),'robot-browser-'));
process.env.COIN_DATA_DIR=directory;process.env.TEACHER_KEY='robot-browser-test';
const {apiRouter}=await import('../server/dist/routes.js');
const {closeDb}=await import('../server/dist/db.js');
const app=express();app.use(express.json(),cookieParser());app.use('/api',apiRouter);app.use(express.static(resolve('client/dist')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const origin=`http://127.0.0.1:${server.address().port}`,output=resolve('outputs/robot-city');mkdirSync(output,{recursive:true});
let browser;const errors=[];
const cycle=['grab','turn_right','turn_right','release','turn_right','turn_right','turn_right','forward','forward','forward','turn_left'];
try {
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/future/');await page.locator('[data-track-id="onboarding.mode.keyboard"]').click();
  await page.locator('canvas[data-ready=true]').waitFor();
  assert.equal(await page.locator('.mission-meta').count(),0);
  assert.equal(await page.locator('.status-bar').getByText('有效步数').count(),0);
  assert.equal(await page.locator('.status-bar').getByText('碰撞次数').count(),0);
  const titleBox=await page.locator('.mission-card').boundingBox(),controlBox=await page.locator('.control-column').boundingBox();
  assert.ok(Math.abs(titleBox.y-controlBox.y)<2,'control panel starts at the title row');
  await page.screenshot({path:join(output,'01-city.png')});
  await page.locator('[data-track-id="attempt.start"]').click();
  const command=async key=>{
    const response=page.waitForResponse(r=>r.url().endsWith('/commands')&&r.request().method()==='POST');
    await page.keyboard.press(key);const res=await response;assert.equal(res.status(),200);
    const result=await res.json();assert.equal(Number(await page.locator('[data-track-id="status.actions"] b').innerText()),result.consumed_commands);return result;
  };
  let result=await command('d');assert.deepEqual(result.end,[1,4]);assert.equal(result.steps,0);assert.equal(result.consumed_commands,1);assert.equal(result.robot.facing,'right');
  result=await command('w');assert.deepEqual(result.end,[2,4]);
  result=await command('s');assert.deepEqual(result.end,[1,4]);assert.equal(result.robot.facing,'right');
  await command('a');
  await page.locator('[data-track-id="camera.view.follow"]').click();
  const canvas=page.locator('canvas');const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5,{steps:10});await page.mouse.up();
  result=await command('g');assert.equal(result.robot.holding,'A');assert.equal(result.collected_order.length,0);
  await page.waitForTimeout(400);await page.screenshot({path:join(output,'02-grab-follow.png')});
  await command('d');await command('d');result=await command('r');assert.equal(result.score.total_score,100);assert.equal(result.robot.holding,null);
  await page.locator('.score-total b').filter({hasText:'100'}).waitFor();
  // Exercise all six scenes through the same authenticated backend in both modes.
  const api=async(path,body)=>{
    const response=await context.request.fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',data:body});
    assert.ok(response.ok(),`${path}: ${response.status()}`);return response.json();
  };
  const levels=await api('/levels?competition=future');assert.equal(levels.length,6);
  for(const level of levels) for(const assignment of [level.keyboard_id,level.python_id]) {
    const attempt=await api('/attempts',{assignment_key:assignment});
    const response=await api(`/attempts/${attempt.attempt_id}/commands`,{commands:Array(level.coins.length).fill(cycle).flat()});
    assert.equal(response.score.total_score,100);assert.equal(response.collisions,0);assert.equal(response.collected_order.length,level.coins.length);
  }
  const invalidAttempt=await api('/attempts',{assignment_key:'FK22'});
  const invalid=await context.request.post(origin+`/api/attempts/${invalidAttempt.attempt_id}/commands`,{data:{commands:['up']}});assert.equal(invalid.status(),422);
  // New page chooses code mode through onboarding, then builds a real loop in the UI.
  const code=await context.newPage();code.on('pageerror',e=>errors.push(e.message));
  await code.goto(origin+'/future/');
  await code.locator('[data-track-id="onboarding.mode.python_blank"]').click();
  await code.locator('[data-track-id="nav.level.FL23"]').click();
  assert.match(await code.locator('[data-track-id="python.line-count"]').innerText(),/当前 0 行.*最优目标 8 行/s);
  await code.locator('[data-track-id="python.loop.add"]').click();await code.getByRole('button',{name:'循环',exact:true}).click();
  await code.getByRole('textbox',{name:'循环次数'}).fill('3');
  for(const action of cycle) await code.locator(`[data-track-id="python.command.add.${action}"]`).click();
  assert.match(await code.locator('[data-track-id="python.line-count"]').innerText(),/当前 12 行/);
  await code.screenshot({path:join(output,'03-loop-code.png')});
  await code.locator('[data-track-id="python.run"]').click();await code.locator('.score-total b').filter({hasText:'100'}).waitFor({timeout:30000});
  assert.equal(Number(await code.locator('[data-track-id="status.actions"] b').innerText()),26,'loop counts executed actions, excluding commands after completion');
  await code.locator('[data-track-id="python.line-result"]').filter({hasText:'本轮 12 行'}).waitFor();
  await code.locator('[data-track-id="python.command.add.grab"]').click();
  assert.match(await code.locator('[data-track-id="python.line-count"]').innerText(),/当前 13 行/);
  assert.match(await code.locator('[data-track-id="python.line-result"]').innerText(),/本轮 12 行/,'editing after submission does not change the submitted result');
  await code.screenshot({path:join(output,'04-loop-success.png')});
  for(const level of levels) {
    await code.locator(`[data-track-id="nav.level.${level.level_id}"]`).click();
    await code.locator(`canvas[data-level-id="${level.level_id}"][data-ready=true]`).waitFor();
    assert.equal(await code.locator('canvas').getAttribute('data-position'),level.start.join(','));
  }
  await code.screenshot({path:join(output,'05-large-city.png')});
  await code.locator('canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await code.locator('.robot-fallback').waitFor();
  const coin=await api('/attempts',{assignment_key:'K01'});
  const badCoin=await context.request.post(origin+`/api/attempts/${coin.attempt_id}/commands`,{data:{commands:['grab']}});assert.equal(badCoin.status(),422);
  const teacher=await context.request.get(origin+'/api/teacher/dashboard?competition=future&level=FL23',{headers:{'x-teacher-key':'robot-browser-test'}});
  assert.equal(teacher.status(),200);assert.equal((await teacher.json()).insights.levels.length,2);
  assert.deepEqual(errors,[]);
  const report={passed:true,checks:['relative W/S movement and stationary A/D turns','camera rotation independent from controls','grip/hold/release/delivery','six scenes and both modes server score 100','actual editable loop program completion','new command whitelist and legacy coin isolation','all scene rendering and WebGL fallback','shared teacher filtering']};
  writeFileSync(join(output,'verification.json'),JSON.stringify(report,null,2));console.log(report);
} finally {await browser?.close();await new Promise(r=>server.close(r));closeDb();rmSync(directory,{recursive:true,force:true});}
