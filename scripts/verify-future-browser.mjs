import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

// Supply PLAYWRIGHT_MODULE if Playwright is provided by an external runtime.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = mkdtempSync(join(tmpdir(), 'future-browser-'));
process.env.COIN_DATA_DIR = directory;
process.env.TEACHER_KEY = 'browser-test-key';
const { apiRouter } = await import('../server/dist/routes.js');
const { getDb, closeDb } = await import('../server/dist/db.js');
const app = express();
app.use(express.json(), cookieParser());
app.use('/api', apiRouter);
app.use(express.static(resolve('client/dist')));
app.get('/teacher', (_req, res) => res.sendFile(resolve('client/dist/index.html')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = resolve('outputs/future-city');
mkdirSync(output, { recursive: true });
const errors = [];
const report = [];
let browser;
const solutions = JSON.parse(readFileSync('solutions.teacher.json', 'utf8')).solutions;
const levels = JSON.parse(readFileSync('levels.teacher.json', 'utf8')).levels;
const directions = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function step(page, direction, kind = 'key') {
  const completed = page.waitForResponse(response => /\/commands$/.test(response.url()) && response.request().method() === 'POST');
  if (kind === 'button') await page.locator(`[data-track-id="move.${direction}"]`).click();
  else await page.keyboard.press(kind === 'wasd' ? { up:'w', down:'s', left:'a', right:'d' }[direction] : directions[direction]);
  const response = await completed;
  assert.equal(response.status(), 200);
  const result = await response.json();
  if (await page.locator('.city-vehicle').count()) {
    await page.waitForFunction(position => document.querySelector('.city-vehicle')?.getAttribute('data-position') === position, result.end.join(','));
    assert.equal(await page.locator('[role=gridcell][data-car=true]').getAttribute('data-track-id'), `board.cell.${result.end[0]}.${result.end[1]}`);
  }
  if (await page.locator('canvas[data-renderer=three]').count()) {
    const levelId=await page.locator('canvas').getAttribute('data-level-id');
    const level=levels.find(l=>`F${l.level_id}`===levelId);
    const expected=[result.end[0]-(level.width-1)/2,(level.height-1)/2-result.end[1]];
    await page.waitForFunction(([x,z])=>{
      const p=document.querySelector('canvas')?.dataset.vehicle?.split(',').map(Number);
      return p && Math.abs(p[0]-x)<.015 && Math.abs(p[2]-z)<.015;
    },expected);
    assert.equal(await page.locator('[role=gridcell][data-car=true]').getAttribute('data-track-id'), `board.cell.${result.end[0]}.${result.end[1]}`);
  }
}
async function navigate(page, level) {
  await page.locator(`[data-track-id="nav.level.${level}"]`).click();
  await page.waitForFunction(id => document.querySelector('.level-btn.active')?.getAttribute('data-track-id') === `nav.level.${id}`, level);
}
async function screenshot(page, name) {
  if(await page.locator('.city3d-stage').count()) await page.locator('canvas[data-ready=true]').waitFor();
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode().catch(() => {}))));
  await page.screenshot({ path: join(output, name) });
}
async function frameCheck(page, label) {
  const result = await page.evaluate(() => {
    const viewport = document.querySelector('.board-viewport').getBoundingClientRect();
    const grid = document.querySelector('.board-grid').getBoundingClientRect();
    const app = document.querySelector('.app').getBoundingClientRect();
    const controls = document.querySelector('.control-column').getBoundingClientRect();
    return { gridInside: grid.x >= viewport.x && grid.y >= viewport.y && grid.right <= viewport.right + 1 && grid.bottom <= viewport.bottom + 1,
      controlsInside: controls.right <= app.right + 1 && controls.bottom <= app.bottom + 1,
      cells: document.querySelectorAll('[role=gridcell]').length,
      renderer: document.querySelector('canvas[data-renderer]')?.getAttribute('data-renderer') ?? 'svg' };
  });
  assert.ok(result.gridInside && result.controlsInside, `${label}: ${JSON.stringify(result)}`);
  report.push({ check: label, ...result });
}
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  });
  const page = await context.newPage();
  await page.goto(origin + '/future/');
  await page.locator('.onboarding-card').waitFor();
  assert.match(await page.title(), /未来城市/);
  await screenshot(page, '01-welcome.png');
  await page.locator('[data-track-id="onboarding.mode.keyboard"]').click();
  await screenshot(page, '02-keyboard.png');
  await page.locator('[data-track-id="attempt.start"]').click();
  await page.locator('.dpad-btn.right:not([disabled])').waitFor();
  await page.locator('[data-track-id="camera.view.follow"]').click();
  const followCanvas=page.locator('canvas[data-view=follow]');
  await followCanvas.waitFor();
  const followBox=await followCanvas.boundingBox();
  const readFollow=()=>followCanvas.evaluate(c=>{
    const camera=c.dataset.camera.split(',').map(Number),target=c.dataset.target.split(',').map(Number);
    return {offset:camera.map((n,i)=>n-target[i]),position:c.dataset.position,view:c.dataset.view};
  });
  const beforeDrag=await readFollow();
  await page.mouse.move(followBox.x+followBox.width*.5,followBox.y+followBox.height*.5);
  await page.mouse.down();
  await page.mouse.move(followBox.x+followBox.width*.7,followBox.y+followBox.height*.55,{steps:12});
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const afterDrag=await readFollow();
  assert.equal(afterDrag.view,'follow');
  assert.equal(afterDrag.position,beforeDrag.position);
  assert.ok(Math.hypot(...afterDrag.offset.map((n,i)=>n-beforeDrag.offset[i]))>.5,'follow drag rotates camera');
  await page.mouse.wheel(0,-240);
  await page.waitForTimeout(800);
  const afterZoom=await readFollow();
  assert.ok(Math.hypot(...afterZoom.offset)<Math.hypot(...afterDrag.offset)-.1,'follow wheel zooms');
  await step(page, 'right');
  await page.waitForFunction(()=>{
    const c=document.querySelector('canvas');const target=c?.dataset.target?.split(',').map(Number),vehicle=c?.dataset.vehicle?.split(',').map(Number);
    return target&&vehicle&&Math.abs(target[0]-vehicle[0])<.05&&Math.abs(target[2]-vehicle[2])<.05;
  });
  await page.waitForTimeout(500);
  const afterFollowMove=await readFollow();
  assert.ok(Math.hypot(...afterFollowMove.offset.map((n,i)=>n-afterZoom.offset[i]))<.05,'moving vehicle preserves orbit angle and zoom');
  assert.equal(afterFollowMove.view,'follow');
  report.push({check:'follow camera supports drag rotation and wheel zoom, preserves both while vehicle moves',passed:true});
  await screenshot(page,'09-follow-camera.png');
  await step(page, 'left', 'wasd');
  await step(page, 'down', 'button');
  await page.locator('.score-total b').filter({ hasText: '100' }).waitFor();
  await page.locator('[data-track-id="attempt.next_level"]').click();
  assert.equal(await page.locator('.mission-number').innerText(), '02');
  report.push({ check: 'keyboard, WASD, direction buttons, 100-point result and next level', passed: true });

  // Ordered targets: visit a later target first using a route that avoids the first.
  await navigate(page, 'FL04');
  const ordered = levels[3];
  const target = ordered.coins.find(c => c.id === ordered.required_order[1]).position;
  const blockedCoin = ordered.coins.find(c => c.id === ordered.required_order[0]).position.join(',');
  const queue = [[ordered.start, []]], seen = new Set();
  let wrongOrderRoute;
  for (let i = 0; i < queue.length; i++) {
    const [[x,y], route] = queue[i];
    if (x === target[0] && y === target[1]) { wrongOrderRoute = route; break; }
    for (const [direction, dx, dy] of [['up',0,1],['down',0,-1],['left',-1,0],['right',1,0]]) {
      const nx=x+dx, ny=y+dy, key=`${nx},${ny}`;
      if (nx<0 || ny<0 || nx>=ordered.width || ny>=ordered.height || key===blockedCoin || seen.has(key) || ordered.walls.some(p=>p.join(',')===key)) continue;
      seen.add(key); queue.push([[nx,ny], [...route,direction]]);
    }
  }
  assert.ok(wrongOrderRoute);
  await page.locator('[data-track-id="attempt.start"]').click();
  await page.locator('.dpad-btn.right:not([disabled])').waitFor();
  for (const direction of wrongOrderRoute) await step(page,direction);
  assert.match(await page.locator('.message').innerText(), /请先收集当前编号/);
  assert.equal(await page.locator('.status-bar > div').nth(2).locator('b').innerText(), '0 / 3');
  await page.locator('[data-track-id="attempt.stop"]').click();
  report.push({ check: 'ordered target stays uncollected without ending the round', passed: true });

  await navigate(page, 'FL20');
  await screenshot(page, '03-city-budget.png');
  const canvas=page.locator('canvas[data-renderer=three]');
  const canvasBox=await canvas.boundingBox();
  const cameraBefore=await canvas.getAttribute('data-camera');
  await page.mouse.move(canvasBox.x+canvasBox.width*.5,canvasBox.y+canvasBox.height*.5);
  await page.mouse.down();await page.mouse.move(canvasBox.x+canvasBox.width*.65,canvasBox.y+canvasBox.height*.55,{steps:12});await page.mouse.up();
  await page.waitForFunction(before=>document.querySelector('canvas')?.dataset.camera!==before,cameraBefore);
  await screenshot(page,'10-orbit-camera.png');
  const zoomBefore=await canvas.getAttribute('data-camera');
  await page.mouse.wheel(0,-180);
  await page.waitForFunction(before=>document.querySelector('canvas')?.dataset.camera!==before,zoomBefore);
  const targetBefore=await canvas.getAttribute('data-target');
  await page.mouse.down({button:'right'});await page.mouse.move(canvasBox.x+canvasBox.width*.6,canvasBox.y+canvasBox.height*.65,{steps:10});await page.mouse.up({button:'right'});
  await page.waitForFunction(before=>document.querySelector('canvas')?.dataset.target!==before,targetBefore);
  assert.equal(await page.locator('.status-bar > div').first().locator('b').innerText(),'0 / 22');
  await page.locator('[data-track-id="camera.view.top"]').click();
  await page.locator('canvas[data-view=top]').waitFor();
  await screenshot(page,'11-top-camera.png');
  await page.locator('[data-track-id="camera.zoom.in"]').click();
  await page.locator('[data-track-id="camera.zoom.out"]').click();
  await page.locator('[data-track-id="camera.fullscreen"]').click();
  await page.waitForFunction(()=>Boolean(document.fullscreenElement));
  await page.locator('[data-track-id="camera.fullscreen"]').click();
  await page.waitForFunction(()=>!document.fullscreenElement);
  await page.locator('[data-track-id="camera.reset"]').click();
  await page.locator('canvas[data-view=orbit]').waitFor();
  report.push({check:'real WebGL orbit, wheel zoom, right-button pan, top view, following, reset and fullscreen; camera does not move the vehicle',passed:true});
  for (const viewport of [{width:1280,height:720},{width:1024,height:768},{width:1920,height:1080}]) {
    await page.setViewportSize(viewport);
    await page.locator('canvas[data-ready=true]').waitFor();
    // ResizeObserver settles on the next frame.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await frameCheck(page, `9x9 keyboard map ${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({width:1280,height:720});
  await page.locator('[data-track-id="attempt.start"]').click();
  await page.locator('.dpad-btn.up:not([disabled])').waitFor();
  await step(page,'up');
  assert.equal(await page.locator('.status-bar > div').nth(1).locator('b').innerText(), '1');
  assert.equal(await page.locator('.status-bar > div').first().locator('b').innerText(), '0 / 22');
  for (const direction of solutions[19].commands) await step(page,direction);
  // Reference route reaches the best value in 21 steps; spend the last valid step to auto-settle.
  await step(page,'right');
  await page.locator('.score-total b').filter({hasText:'100'}).waitFor();
  await screenshot(page,'04-budget-result.png');
  report.push({check:'collision does not consume budget; budget route automatically settles at 100',passed:true});

  // Same browser identity, independent code assignment and original coin assignment.
  const code = await context.newPage();
  await code.goto(origin + '/future/');
  await code.locator('[data-track-id="onboarding.mode.python_blank"]').click();
  await code.locator('[data-track-id="python.command.add.right"]').click();
  await code.locator('.count-input').fill('21');
  await code.locator('.run-btn').click();
  await code.locator('.editor-error').waitFor();
  assert.equal(getDb().prepare("SELECT count(*) n FROM attempts WHERE assignment_key='FP01'").get().n, 0);
  await code.locator('.row-btn.remove').click();
  assert.equal(await code.locator('.editor-row').count(),0);
  for (const row of solutions[0].reference_rows) {
    await code.locator(`[data-track-id="python.command.add.${row.direction}"]`).click();
    await code.locator('.count-input').last().fill(String(row.count));
  }
  await screenshot(code,'05-code-program.png');
  await code.locator('.run-btn').click();
  await code.locator('.score-total b').filter({hasText:'100'}).waitFor();
  await navigate(code,'FL20');
  await code.setViewportSize({width:1280,height:720});
  await frameCheck(code,'9x9 code map 1280x720');
  await screenshot(code,'06-code-city.png');
  report.push({check:'command add/count validation/removal/run and 100-point server result',passed:true});

  // Check all projected maps, including tall objects and coordinate labels, at the smallest desktop size.
  await code.setViewportSize({width:1024,height:768});
  for (const level of levels) {
    await navigate(code, `F${level.level_id}`);
    await code.locator(`canvas[data-level-id=F${level.level_id}][data-ready=true]`).waitFor();
    const scene = await code.locator('canvas').evaluate(canvas => {
      const bounds=JSON.parse(canvas.dataset.bounds);
      return { inside: bounds.every(n=>n>=-1.02&&n<=1.02), cells: document.querySelectorAll('[role=gridcell]').length,
        towers: Number(canvas.dataset.buildings), position: canvas.dataset.position };
    });
    assert.ok(scene.inside, `${level.level_id}: projected object clipped`);
    assert.equal(scene.cells, level.width*level.height);
    assert.equal(scene.towers, level.walls.length);
    assert.equal(scene.position, level.start.join(','));
  }
  report.push({check:'all 20 WebGL maps: models fit camera frame, correct building counts and starting positions at 1024x768',passed:true});

  // Exhaust formal attempts through the UI; the fourth run is local practice.
  await navigate(page,'FL01');
  for (let i=0;i<2;i++) {
    await page.locator('[data-track-id="attempt.start"]').click();
    await page.locator('.dpad-btn.right:not([disabled])').waitFor();
    for (const direction of solutions[0].commands) await step(page,direction);
    await page.locator('.score-total b').filter({hasText:'100'}).waitFor();
    await navigate(page,'FL02'); await navigate(page,'FL01');
  }
  await page.locator('[data-track-id="attempt.start"]').filter({hasText:'开始练习'}).waitFor();
  await page.locator('[data-track-id="attempt.start"]').click();
  await page.locator('.dpad-btn.right:not([disabled])').waitFor();
  for (const direction of solutions[0].commands) await page.keyboard.press(directions[direction]);
  await page.locator('.message.success').waitFor();
  assert.equal(getDb().prepare("SELECT count(*) n FROM attempts WHERE assignment_key='FK01'").get().n, 3);
  report.push({check:'three formal attempts followed by unscored local practice',passed:true});

  const coin = await context.newPage();
  await coin.goto(origin + '/');
  await coin.locator('[data-track-id="onboarding.mode.keyboard"]').click();
  assert.equal(await coin.locator('.brand b').innerText(),'旷野淘金');
  assert.equal(await coin.locator('.car-sprite').getAttribute('src'),'/assets/car.png');
  await coin.locator('[data-track-id="attempt.start"]').click();
  await coin.locator('.dpad-btn.right:not([disabled])').waitFor();
  for (const direction of solutions[0].commands) await step(coin,direction);
  await coin.locator('.score-total b').filter({hasText:'100'}).waitFor();
  await screenshot(coin,'07-original-coin.png');
  assert.equal(getDb().prepare('SELECT count(*) n FROM players').get().n,1);
  assert.equal(getDb().prepare("SELECT trial_index FROM attempts WHERE assignment_key='K01'").get().trial_index,1);
  report.push({check:'original coin visuals and interaction work; identity shared, attempts separate',passed:true});

  const teacher = await context.newPage();
  await teacher.goto(origin+'/teacher');
  await teacher.locator('input[type=password]').fill('browser-test-key');
  await teacher.getByRole('button', { name: '进入看板' }).click();
  await teacher.locator('.dashboard-filters').waitFor();
  const filters=teacher.locator('.dashboard-filters');
  await filters.locator('label').filter({hasText:'测试赛'}).locator('select').selectOption('future');
  await filters.locator('label').filter({hasText:'关卡'}).locator('select').selectOption('FL01');
  await filters.locator('button[type=submit]').click();
  await teacher.waitForFunction(() => document.querySelector('.dashboard-filters small')?.textContent.includes('未来城市') && document.querySelectorAll('.level-card tbody tr').length === 2);
  await screenshot(teacher,'08-shared-dashboard.png');
  await teacher.getByRole('button',{name:'导出逐次成绩',exact:true}).click();
  await teacher.getByRole('button',{name:'导出行为记录',exact:true}).click();
  // Wait for a regular telemetry flush using browser polling, not a fixed delay.
  await page.waitForFunction(async () => {
    const res=await fetch('/api/teacher/export?kind=events&competition=future&format=jsonl',{headers:{'x-teacher-key':'browser-test-key'}});
    return (await res.text()).includes('future-city-1.0.0');
  });
  const recovery=await context.newPage();
  await recovery.goto(origin+'/future/');
  await recovery.locator('[data-track-id="onboarding.mode.keyboard"]').click();
  await recovery.locator('canvas[data-ready=true]').waitFor();
  await recovery.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await recovery.locator('.city-scene').waitFor();
  await navigate(recovery,'FL02');
  await recovery.locator('[data-track-id="attempt.start"]').click();
  await recovery.locator('.dpad-btn.right:not([disabled])').waitFor();
  for(const direction of solutions[1].commands)await step(recovery,direction);
  await recovery.locator('.score-total b').filter({hasText:'100'}).waitFor();
  report.push({check:'WebGL context loss falls back to the projected map; movement and 100-point server scoring still work',passed:true});
  assert.deepEqual(errors, []);
  report.push({check:'shared teacher filter, exports, versioned telemetry, no browser errors',passed:true});
  writeFileSync(join(output,'browser-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  closeDb();
  assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep) && directory.includes('future-browser-'));
  rmSync(directory,{recursive:true,force:true});
}
