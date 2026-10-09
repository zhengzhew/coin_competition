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
  await page.goto(origin + '/beach/'); await page.getByLabel('你的名字', { exact: true }).fill('拾贝测试员'); await screenshot('01-welcome.png');
  await confirm(); assert.equal(await page.locator('.experience-grid button').count(), 4);
  await page.getByRole('button', { name: /初潮寻贝.*手动驾驶/ }).click(); await ready(); await layout(); await screenshot('02-level-one.png');
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000)); clockInstalled = true;
  assert.deepEqual((await snapshot()).objects.map(o => [o.x, 120 - o.z]), [[36, 70], [18, 80]]);
  await page.keyboard.down('w'); await advance(500); await page.keyboard.up('w'); assert.equal((await snapshot()).z, 96);
  await start(); await page.keyboard.down('w'); await advance(300); await page.keyboard.down('ArrowUp'); await page.keyboard.up('w'); const z = (await snapshot()).z;
  await advance(300); assert.ok((await snapshot()).z < z); await page.keyboard.up('ArrowUp');
  await page.getByRole('button', { name: '停止', exact: true }).click(); const stopped = await snapshot(); const time = await page.getByTestId('beach-timer').innerText(); await advance(2000); assert.deepEqual(await snapshot(), stopped); assert.equal(await page.getByTestId('beach-timer').innerText(), time);
  await start(); assert.equal((await snapshot()).z, 96); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await snapshot()).phase, 'stopped');
  checks.push('production routes, identity, exact OID coordinates, keyboard aliases, stop and blur lifecycle');
  await start();
  const forward = page.getByRole('button', { name: '前进 W / ↑', exact: true });
  await forward.focus(); await page.keyboard.down('Space'); await advance(300); await page.keyboard.up('Space');
  assert.ok((await snapshot()).z < 95, 'focused control supports held keyboard activation');
  const control = await forward.boundingBox(); await page.mouse.move(control.x + control.width / 2, control.y + control.height / 2);
  const beforePointer = (await snapshot()).z; await page.mouse.down(); await advance(300); await page.mouse.up();
  assert.ok((await snapshot()).z < beforePointer, 'pointer controls drive the same simulation');
  await page.getByRole('button', { name: '停止', exact: true }).click();
  checks.push('screen controls support pointer hold and accessible keyboard hold without extra simulation steps');
  await start();
  let held = null;
  const hold = async key => { if (key === held) return; if (held) await page.keyboard.up(held); held = key; if (key) await page.keyboard.down(key); };
  const wait = async ms => { await hold(null); await advance(ms); };
  const turn = async target => {
    for (let i = 0; i < 400; i++) {
      const s = await snapshot(), error = Math.atan2(Math.sin(target - s.heading), Math.cos(target - s.heading));
      if (Math.abs(error) < .024) { await wait(100); return; }
      await hold(error > 0 ? 'd' : 'a'); await advance(Math.max(16, Math.min(100, Math.abs(error) / (Math.PI / 2) * 1000)));
    }
    throw new Error('keyboard turn did not converge');
  };
  const drive = async (x, z, backwards = false) => {
    for (let i = 0; i < 1200; i++) {
      const s = await snapshot(), distance = Math.hypot(s.x - x, s.z - z);
      if (distance < .5) { await wait(100); return; }
      const heading = Math.atan2(x - s.x, s.z - z) + (backwards ? Math.PI : 0), error = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading));
      if (Math.abs(error) > .035) await turn(heading);
      await hold(backwards ? 's' : 'w'); await advance(Math.max(16, Math.min(100, distance / 18 * 1000)));
    }
    throw new Error(`keyboard drive to ${x},${z} failed: ${JSON.stringify(await snapshot())}`);
  };
  await drive(60, 76);
  for (const [index, shell] of [{ id: 'A', x: 36, z: 50 }, { id: 'B', x: 18, z: 40 }].entries()) {
    if (index) { await drive(60, 76); await drive(60, 68); }
    const lane = index ? 68 : 76;
    await drive(shell.x, lane); await drive(shell.x, shell.z + 12.5); await turn(0); await page.keyboard.press('g'); await advance(1800);
    assert.equal((await snapshot()).holding, shell.id, JSON.stringify(await snapshot()));
    await drive(shell.x, 19.5); await advance(2000); assert.equal((await snapshot()).collected, index + 1, 'edge placement is accepted without R');
    if (!index) await drive(shell.x, lane, true);
  }
  assert.equal((await snapshot()).phase, 'completed'); assert.ok(Number((await page.getByTestId('beach-score').innerText()).replace(' 分', '')) > 0);
  const finalTime = await page.getByTestId('beach-timer').innerText(); await advance(4000); assert.equal(await page.getByTestId('beach-timer').innerText(), finalTime); await screenshot('03-complete.png');
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('beach.best-times.'))));
  checks.push('complete two-shell race without release input, automatic gripper opening, result, frozen timer and saved best');
  await page.clock.resume(); await page.reload(); await confirm(); await ready(); assert.notEqual(await page.getByTestId('beach-best').innerText(), '—');
  await page.getByRole('button', { name: '2 四海拾珍', exact: true }).click(); await ready(); assert.equal((await snapshot()).objects.length, 4);
  await page.getByRole('button', { name: '俯视', exact: true }).click(); await advance(100); await screenshot('04-level-two.png');
  await page.setViewportSize({ width: 390, height: 844 }); await advance(100); await layout(); await screenshot('05-mobile.png');
  checks.push('best survives reload, independent four-shell level, top camera and mobile layout');
  await page.setViewportSize({ width: 1543, height: 950 });
  const level = n => page.getByRole('button', { name: n === 3 ? '3 初潮寻贝 · 编程' : '4 四海拾珍 · 编程', exact: true }).click();
  const editor = () => page.getByRole('textbox', { name: '指令程序', exact: true });
  await level(3); await ready(); await layout();
  assert.equal(await page.locator('.beach-game').getAttribute('data-mode'), 'auto');
  assert.equal(await page.locator('.beach-keypad').count(), 0);
  assert.deepEqual((await snapshot()).objects.map(o => [o.x, 120 - o.z]), [[36, 70], [18, 80]]);
  assert.deepEqual(await page.locator('.beach-command-palette b').allTextContents(), ['前进', '后退', '移动到点', '转到角度', '左转', '右转', '合拢', '张开']);
  for (const button of await page.locator('.beach-command-palette button').all()) await button.click();
  assert.equal(await editor().inputValue(), 'forward(12)\nbackward(12)\nmove_to(60, 48)\nturn_to(90)\nturn_left(90)\nturn_right(90)\ngrab()\nrelease()');
  await editor().fill('wait(1)'); await start(); assert.match(await page.getByRole('alert').innerText(), /第 1 行.*八种指令/); assert.equal((await snapshot()).phase, 'ready');
  await editor().fill('move_to(60, 36)\nturn_to(90)');
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await start(); await advance(200); assert.equal(await editor().isDisabled(), true); assert.equal(await page.getByTestId('running-code-line').getAttribute('data-line'), '1');
  await page.keyboard.down('s'); await advance(400); await page.keyboard.up('s'); assert.ok((await snapshot()).z < 95, 'manual reverse input cannot override code');
  await page.getByRole('button', { name: '停止', exact: true }).click(); const codeStopped = await snapshot(), codeTime = await page.getByTestId('beach-timer').innerText();
  await advance(1000); assert.deepEqual(await snapshot(), codeStopped); assert.equal(await page.getByTestId('beach-timer').innerText(), codeTime);
  await page.getByRole('button', { name: '重置', exact: true }).click(); assert.equal((await snapshot()).z, 96); assert.equal(await editor().inputValue(), 'move_to(60, 36)\nturn_to(90)');
  await start(); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal((await snapshot()).phase, 'stopped');
  await editor().fill(programs['shells-3']); await level(4); await ready(); assert.equal(await editor().inputValue(), '');
  await editor().fill(programs['shells-4']); await level(3); await ready(); assert.equal(await editor().inputValue(), programs['shells-3']);
  await screenshot('06-level-three-code.png');
  checks.push('exact eight code buttons, source insertion, unsupported command error, line highlight, code-only control, stop/reset/blur and independent drafts');
  const completeCode = async n => {
    await start(); let scrolled = false;
    for (let i = 0; i < 160 && (await snapshot()).phase === 'running'; i++) {
      await advance(1000); if (await editor().evaluate(el => el.scrollTop > 0)) scrolled = true;
    }
    assert.equal((await snapshot()).phase, 'completed', JSON.stringify(await snapshot()));
    assert.equal((await snapshot()).collected, n === 3 ? 2 : 4); assert.equal(scrolled, true, 'current source line scrolls into view');
    assert.ok(parseFloat(await page.getByTestId('beach-score').innerText()) > 0);
    const time = await page.getByTestId('beach-timer').innerText(); await advance(2000); assert.equal(await page.getByTestId('beach-timer').innerText(), time);
    await page.getByTestId('beach-score').scrollIntoViewIfNeeded(); await screenshot(`0${n + 4}-level-${n}-complete.png`);
  };
  await completeCode(3); await level(4); await ready();
  assert.deepEqual((await snapshot()).objects.map(o => [o.x, 120 - o.z]), [[30, 32], [84, 38], [36, 78], [88, 90]]);
  assert.equal(await editor().inputValue(), programs['shells-4']);
  for (const [width, height] of [[1280, 720], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height }); await advance(100); await layout();
    if (width >= 1000) { const run = await page.getByTestId('beach-start').boundingBox(); assert.ok(run.y >= 0 && run.y + run.height < height, 'run button stays in view'); }
    await screenshot(`code-layout-${width}.png`);
  }
  await page.setViewportSize({ width: 1543, height: 950 }); await advance(100); await completeCode(4);
  await page.clock.resume(); await page.reload(); await confirm(); await ready();
  assert.equal(await editor().inputValue(), programs['shells-4']); assert.notEqual(await page.getByTestId('beach-best').innerText(), '—');
  await level(3); await ready(); assert.equal(await editor().inputValue(), programs['shells-3']); assert.notEqual(await page.getByTestId('beach-best').innerText(), '—');
  checks.push('code completes both copied maps, execution auto-scroll, independent saved bests and drafts after reload, frozen scoring and three responsive code layouts');
  await page.goto(origin + '/beach/missing/'); await page.getByRole('heading', { name: '这片沙滩还未开放' }).waitFor();
  await page.goto(origin + '/farm/'); await page.getByRole('heading', { name: '欢迎来到生态农场' }).waitFor();
  await page.goto(origin + '/demo/place/manual/simulation3d/place-simulation3d-sample/');
  await page.locator('canvas[data-third-scene][data-ready=true]').waitFor(); assert.equal(await page.locator('canvas[data-beach-scene]').count(), 0);
  checks.push('farm entry and original 3D placement DEMO still render');
  assert.deepEqual(errors, []); assert.deepEqual(remote, []); assert.deepEqual(api, []);
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, errors, remote, api, temp }, null, 2)); console.log(JSON.stringify({ checks, errors, output }, null, 2));
} catch (error) { if (page) { await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {}); console.error(await page.locator('body').innerText()); } throw error; }
finally { await browser?.close(); server.kill(); }
