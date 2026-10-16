import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = mkdtempSync(join(tmpdir(), 'beach-browser-'));
const output = resolve('outputs/beach'); mkdirSync(output, { recursive: true });
const programs = JSON.parse(readFileSync(new URL('./fixtures/beach-programs.json', import.meta.url), 'utf8'));
const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port; await new Promise(r => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/dist/index.js'], { cwd: process.cwd(), windowsHide: true,
  env: { ...process.env, PORT: String(port), COIN_DATA_DIR: temp, PUBLIC_ORIGIN: origin, TEACHER_KEY: 'beach-test-only' }, stdio: 'pipe' });
let browser, page, log = ''; server.stdout.on('data', s => log += s); server.stderr.on('data', s => log += s);
const checks = [], errors = [], remote = [], api = [];
try {
  for (let i = 0; i < 75; i++) { try { if ((await fetch(origin + '/api/health')).ok) break; } catch {} if (server.exitCode !== null) throw new Error(log); await new Promise(r => setTimeout(r, 200)); }
  for (const route of ['/beach/', ...[1, 2, 3, 4].map(n => `/beach/shells-${n}/`)]) {
    const response = await fetch(origin + route); assert.equal(response.status, 200); assert.match(await response.text(), /潮汐拾光/);
  }
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1543, height: 950 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = route.request().url(); if (/^https?:/.test(url) && !url.startsWith(origin + '/')) { remote.push(url); return route.abort(); }
    if (url.includes('/api/')) api.push(url); return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  let clockInstalled = false;
  const advance = ms => clockInstalled ? page.clock.runFor(ms) : page.waitForTimeout(ms);
  const stage = () => page.getByTestId('beach-stage');
  const snapshot = () => stage().evaluate(el => ({ x: Number(el.dataset.x), z: 120 - Number(el.dataset.mapY), heading: Number(el.dataset.heading), holding: el.dataset.holding, phase: el.dataset.phase, collected: Number(el.dataset.collected), objects: JSON.parse(el.dataset.objects) }));
  const ready = async () => { await page.locator('canvas[data-beach-scene][data-ready=true]').waitFor(); await advance(100); };
  const start = () => page.getByTestId('beach-start').click();
  const confirm = () => page.getByRole('button', { name: '确认，前往海边 →' }).click();
  const screenshot = name => page.screenshot({ path: join(output, name), fullPage: true });
  const layout = async () => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); const box = await page.locator('canvas[data-beach-scene]').boundingBox(); assert.ok(box.width > 260 && box.height > 200, JSON.stringify(box)); };
  const names = ['初潮寻贝', '四海拾珍', '一排贝壳', '一堆贝壳'];
  const counts = [2, 4, 10, 12];
  const level = n => page.getByRole('button', { name: `${n} ${names[n - 1]}`, exact: true }).click();
  const editor = () => page.getByRole('textbox', { name: '指令程序', exact: true });
  await page.goto(origin + '/beach/'); await page.getByLabel('你的名字', { exact: true }).fill('拾贝测试员'); await screenshot('01-welcome.png');
  await confirm(); assert.equal(await page.locator('.experience-grid button').count(), 4);
  assert.equal(await page.getByText('手动驾驶', { exact: false }).count(), 0);
  await page.getByRole('button', { name: /初潮寻贝.*代码操控/ }).click(); await ready(); await layout();
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000)); clockInstalled = true;
  const oldCoordinates = [[[36, 70], [18, 80]], [[30, 32], [84, 38], [36, 78], [88, 90]]];
  for (let n = 1; n <= 4; n++) {
    await level(n); await ready();
    assert.equal(await page.locator('.beach-game').getAttribute('data-mode'), 'auto');
    assert.equal(await page.locator('.beach-keypad').count(), 0);
    assert.equal((await snapshot()).objects.length, counts[n - 1]);
    assert.equal(await page.getByRole('region', { name: '贝壳坐标', exact: true }).count(), 1);
    assert.equal(await page.getByLabel('精准定位读数', { exact: true }).count(), 1);
    const positions = (await snapshot()).objects.map(o => [o.x, 120 - o.z]);
    if (n <= 2) assert.deepEqual(positions, oldCoordinates[n - 1]);
    if (n === 3) { assert.equal(new Set(positions.map(p => p[1])).size, 1); assert.equal(new Set(positions.map(p => p[0])).size, 10); }
    if (n === 4) {
      assert.deepEqual([...new Set(positions.map(p => p[0]))], [39, 53, 67, 81]);
      assert.deepEqual([...new Set(positions.map(p => p[1]))], [46, 60, 74]);
    }
    await page.getByRole('button', { name: '俯视', exact: true }).click(); await advance(100); await screenshot(`level-${n}-layout.png`);
  }
  checks.push('four programming-only levels, original maps preserved, 10-shell row, 3 by 4 rectangle, visible coordinate lists and map readout');
  await level(1); await ready();
  assert.deepEqual(await page.locator('.beach-command-palette b').allTextContents(), ['前进', '后退', '移动到点', '转到角度', '左转', '右转', '合拢', '张开', '循环']);
  for (const button of (await page.locator('.beach-command-palette button').all()).slice(0, 8)) await button.click();
  assert.equal(await editor().inputValue(), 'forward(12)\nbackward(12)\nmove_to(60, 48)\nturn_to(90)\nturn_left(90)\nturn_right(90)\ngrab()\nrelease()');
  await editor().fill(''); await page.getByTitle('插入循环', { exact: true }).click();
  await page.getByTitle('插入 forward(12)', { exact: true }).click();
  assert.equal(await editor().inputValue(), 'for i in range(4):\n    forward(12)');
  await editor().fill('wait(1)'); await start(); assert.match(await page.getByRole('alert').innerText(), /第 1 行.*八种指令/); assert.equal((await snapshot()).phase, 'ready');
  await editor().fill('for i in range(2):\n  forward(12)'); await start(); assert.match(await page.getByRole('alert').innerText(), /缩进|循环内/);
  await editor().fill('move_to(60, 36)\nturn_to(90)');
  await start(); await advance(200); assert.equal(await editor().isDisabled(), true); assert.equal(await page.getByTestId('running-code-line').getAttribute('data-line'), '1');
  await page.keyboard.down('s'); await advance(400); await page.keyboard.up('s'); assert.ok((await snapshot()).z < 95, 'manual reverse input cannot override code');
  await page.getByRole('button', { name: '暂停', exact: true }).click(); const paused = await snapshot(), pausedTime = await page.getByTestId('beach-timer').innerText();
  await advance(1000); assert.deepEqual(await snapshot(), paused); assert.equal(await page.getByTestId('beach-timer').innerText(), pausedTime);
  await page.getByRole('button', { name: '继续', exact: true }).click(); await advance(500); assert.equal((await snapshot()).phase, 'running');
  await page.getByRole('button', { name: '停止', exact: true }).click(); const stopped = await snapshot(); await advance(1000); assert.deepEqual(await snapshot(), stopped); assert.equal(stopped.z, 96);
  assert.equal(await editor().inputValue(), 'move_to(60, 36)\nturn_to(90)');
  await start(); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await snapshot()).phase, 'paused');
  await page.getByRole('button', { name: '停止', exact: true }).click();
  checks.push('eight commands plus working loop insertion, validation, line highlight, code-only controls, pause/resume, stop/reset and blur');
  for (let n = 1; n <= 4; n++) {
    await level(n); await ready(); await editor().fill(programs[`shells-${n}`]);
  }
  for (let n = 1; n <= 4; n++) {
    await level(n); await ready(); assert.equal(await editor().inputValue(), programs[`shells-${n}`]);
    await start(); let scrolled = false;
    for (let i = 0; i < 360 && (await snapshot()).phase === 'running'; i++) {
      await advance(1000); if (await editor().evaluate(el => el.scrollTop > 0)) scrolled = true;
    }
    assert.equal((await snapshot()).phase, 'completed', JSON.stringify(await snapshot()));
    assert.equal((await snapshot()).collected, counts[n - 1]);
    if (n !== 3) assert.equal(scrolled, true, 'current source line scrolls into view');
    assert.equal(await page.getByTestId('beach-score').innerText(), '？？');
    const time = await page.getByTestId('beach-timer').innerText(); await advance(2000); assert.equal(await page.getByTestId('beach-timer').innerText(), time);
    await page.getByTestId('beach-score').scrollIntoViewIfNeeded(); await screenshot(`level-${n}-complete.png`);
    console.log(`completed level ${n}: ${counts[n - 1]} shells`);
  }
  checks.push('all four levels complete physically through the browser, new levels use loops, timer freezes and execution lines follow');
  await page.clock.resume(); await page.reload(); await confirm(); await ready();
  for (let n = 1; n <= 4; n++) {
    await level(n); await ready(); assert.equal(await editor().inputValue(), programs[`shells-${n}`]); assert.notEqual(await page.getByTestId('beach-best').innerText(), '—');
  }
  for (const [width, height] of [[1280, 720], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height }); await advance(100); await layout();
    if (width >= 1000) { const run = await page.getByTestId('beach-start').boundingBox(); assert.ok(run.y >= 0 && run.y + run.height < height, 'run button stays in view'); }
    await screenshot(`code-layout-${width}.png`);
  }
  checks.push('independent bests and drafts survive reload; desktop, tablet and phone layouts fit');
  await page.goto(origin + '/beach/missing/'); await page.getByRole('heading', { name: '这片沙滩还未开放' }).waitFor();
  await page.goto(origin + '/farm/'); await page.getByRole('heading', { name: '欢迎来到生态农场' }).waitFor();
  await page.goto(origin + '/demo/place/manual/simulation3d/place-simulation3d-sample/');
  await page.locator('canvas[data-third-scene][data-ready=true]').waitFor(); assert.equal(await page.locator('canvas[data-beach-scene]').count(), 0);
  checks.push('farm entry and original 3D placement DEMO still render');
  assert.deepEqual(errors, []); assert.deepEqual(remote, []); assert.ok(api.every(url => /\/api\/(players\/bootstrap|leaderboard)/.test(url)));
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, errors, remote, api, temp }, null, 2)); console.log(JSON.stringify({ checks, errors, output }, null, 2));
} catch (error) { if (page) { await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {}); console.error(await page.locator('body').innerText()); } throw error; }
finally { await browser?.close(); server.kill(); }
