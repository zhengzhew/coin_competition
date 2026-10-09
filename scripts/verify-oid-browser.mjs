import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = mkdtempSync(join(tmpdir(), 'oid-browser-'));
const output = resolve('outputs/oid'); mkdirSync(output, { recursive: true });
const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port; await new Promise(r => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/dist/index.js'], { cwd: process.cwd(), windowsHide: true,
  env: { ...process.env, PORT: String(port), COIN_DATA_DIR: temp, PUBLIC_ORIGIN: origin, TEACHER_KEY: 'oid-test-only' }, stdio: 'pipe' });
let serverOutput = '', browser, page;
server.stdout.on('data', s => serverOutput += s); server.stderr.on('data', s => serverOutput += s);
const checks = [], errors = [], remoteRequests = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(serverOutput);
    await wait(200);
  }
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(origin + '/')) { remoteRequests.push(url); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const stage = () => page.getByTestId('third-stage');
  const source = () => page.getByRole('textbox', { name: '指令程序', exact: true });
  const start = () => page.getByTestId('third-start').click();
  const reset = () => page.getByRole('button', { name: '重置', exact: true }).click();
  const phase = expected => page.waitForFunction(value => document.querySelector('[data-testid="third-stage"]')?.dataset.phase === value, expected, { timeout: 30000 });
  const ready = async () => {
    await page.locator('canvas[data-third-scene][data-ready=true]').waitFor();
    assert.equal(await page.locator('canvas[data-third-scene]').getAttribute('data-vehicle-model'), '000_saikao');
    await page.waitForFunction(() => !document.querySelector('[data-testid="third-start"]')?.disabled);
  };
  const path = (category, mode = 'auto', simulation = 'simulation3d') => `/demo/${category}/${mode}/${simulation}/${category}-${simulation}-sample/`;
  const centre = async (x, y, angle) => {
    assert.equal(await stage().getAttribute('data-x'), x.toFixed(4));
    assert.equal(await stage().getAttribute('data-map-y'), y.toFixed(4));
    assert.equal(await page.getByTestId('third-oid-heading').innerText(), `${angle.toFixed(1)}°`);
  };
  const layout = async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal page overflow');
    const fields = await page.locator('.third-editor-fields').evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight, overflow: getComputedStyle(el).overflowY }));
    if (fields.content > fields.height + 1) assert.match(fields.overflow, /auto|scroll|visible/, 'editor contents can be reached without clipping');
    const run = await page.getByTestId('third-start').boundingBox(), panel = await page.locator('.third-program-editor').boundingBox();
    assert.ok(run.y + run.height <= panel.y + panel.height + 1, 'run stays inside editor');
    const code = await source().boundingBox(), editorFields = await page.locator('.third-editor-fields').boundingBox();
    assert.ok(code.height >= 128, 'code field remains usable');
    if (page.viewportSize().width >= 1000) assert.ok(code.y >= editorFields.y - 1 && code.y + code.height <= editorFields.y + editorFields.height + 1, 'code stays visible alongside controls');
    const canvas = await page.locator('canvas[data-third-scene]').boundingBox();
    assert.ok(canvas.width >= 280 && canvas.height >= 180, 'usable map viewport');
  };

  await page.goto(origin + path('collect')); await ready(); await layout();
  await page.getByRole('tab', { name: '精准定位' }).click();
  assert.equal(await page.getByRole('region', { name: '精准控制' }).count(), 1);
  assert.match(await page.getByRole('region', { name: '精准控制' }).innerText(), /普通 18 cm\/s · 精准定位 9 cm\/s/);
  await centre(54, 24, 0);
  await source().fill('');
  for (const label of [/移动到点/, /转到角度/]) await page.getByRole('button', { name: label }).click();
  await page.getByRole('tab', { name: '普通指令' }).click();
  for (const label of [/前进·时间/, /后退·时间/]) await page.getByRole('button', { name: label }).click();
  assert.equal(await source().inputValue(), 'move_to(54, 36)\nturn_to(90)\nforward_time(1)\nbackward_time(1)');
  await page.reload(); await ready();
  assert.match(await source().inputValue(), /^move_to\(54, 36\)/);
  const { thirdSample } = await import('../shared/dist/index.js');
  const demo = thirdSample('collect', 'simulation3d');
  await page.evaluate(key => localStorage.setItem(key, 'oid_move_to(54,48)\noid_turn_to(90)'), `third.program.${demo.demo_id}.${demo.content_version}.${demo.simulation}`);
  await page.reload(); await ready();
  assert.equal(await source().inputValue(), 'move_to(54,48)\nturn_to(90)');
  assert.doesNotMatch(await page.locator('body').innerText(), /OID/);
  for (const code of ['move_to(54.5,48)', 'move_to(54,121)', 'turn_to(361)', 'forward_time(0)']) {
    await source().fill(code); await start();
    await page.getByRole('alert').filter({ hasText: /第 1 行/ }).waitFor();
    assert.equal(await stage().getAttribute('data-phase'), 'ready');
  }
  checks.push('3D-only 精准定位/time palette, draft persistence, centimetre/angle/time validation');
  await source().fill('turn_to(90)\nforward_time(0.5)\nbackward_time(0.5)\nmove_to(54,48)\nturn_to(90)\nwait(1)');
  await start(); await phase('stopped'); await centre(54, 48, 90);
  await page.getByRole('tab', { name: '精准定位' }).click();
  assert.equal(await stage().getAttribute('data-collected'), '2');
  assert.match(await page.getByTestId('third-oid-target').innerText(), /定位已到位.*54.0, 48.0.*90.0/);
  await page.locator('.third-editor-fields').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: join(output, '01-demo-oid.png'), fullPage: true });
  await source().fill('move_to(54,60)'); await start(); await phase('completed'); await centre(54, 60, 0);
  assert.equal(await stage().getAttribute('data-collected'), '3');
  await reset(); assert.equal(await page.getByTestId('third-oid-target').count(), 0); await centre(54, 24, 0);
  await source().fill('move_to(54,60)'); await start();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset['mapY']) > 25);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  const stopped = await stage().getAttribute('data-map-y'); await wait(200);
  assert.equal(await stage().getAttribute('data-map-y'), stopped);
  checks.push('精准定位 + timed movement mixed program, exact centre and heading, completion at target, stop/reset');
  console.log('精准定位 collect and command validation passed');

  await page.goto(origin + path('place')); await ready();
  await page.getByRole('tab', { name: '精准定位' }).click();
  await source().fill('grab()\nmove_to(54,48)\nturn_to(90)\nmove_to(84,48)\nturn_to(180)\nrelease()\nwait(1)');
  await start(); await phase('completed'); await centre(84, 48, 180);
  assert.equal(await stage().getAttribute('data-holding'), ''); assert.equal(await stage().getAttribute('data-collected'), '1');
  await page.locator('.third-editor-fields').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: join(output, '02-oid-placement.png'), fullPage: true });
  await source().fill('move_to(54,0)'); await start(); await phase('stopped');
  assert.match(await page.locator('.message').innerText(), /精准定位受阻/);
  assert.ok(Number(await stage().getAttribute('data-map-y')) > 9);
  await reset(); await page.setViewportSize({ width: 390, height: 844 }); await layout();
  await page.screenshot({ path: join(output, '03-demo-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push('精准定位 physical gripper transport, boundary blocking without teleport, desktop/mobile controls');
  console.log('精准定位 physical placement, boundary and mobile passed');

  for (const mode of ['auto', 'manual']) {
    await page.goto(origin + path('collect', mode, 'grid')); await stage().waitFor();
    assert.equal(await page.getByRole('region', { name: '精准控制' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /前进·时间/ }).count(), 0);
    if (mode === 'auto') {
      await source().fill('move_to(54,48)'); await start();
      await page.getByRole('alert').filter({ hasText: /仅用于 3D/ }).waitFor();
      await source().fill('forward(1)'); await start(); await phase('stopped');
    } else { await start(); await page.keyboard.press('w'); }
    assert.equal(await stage().getAttribute('data-x'), '2.0000'); assert.equal(await stage().getAttribute('data-z'), '4.0000');
  }
  await page.goto(origin + path('place', 'manual')); await ready();
  assert.equal(await page.getByRole('region', { name: '精准控制' }).count(), 0);
  await centre(54, 24, 0); await start(); await page.keyboard.down('s');
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset.z) > 97);
  await page.keyboard.up('s'); await page.getByRole('button', { name: '停止', exact: true }).click();
  checks.push('both grid modes stay cell-based, manual 3D remains continuous with coordinate readout');

  await page.goto(origin + path('place', 'auto', 'grid'));
  await page.locator('canvas[data-ready=true][data-vehicle-model="000_saikao"]').waitFor();
  await start(); await phase('completed');
  assert.equal(await stage().getAttribute('data-collected'), '1');
  checks.push('same supplied vehicle model loads in 3D and grid; grid grab and delivery remain usable');
  assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
  const report = { passed: true, checks, errors, remoteRequests, environment: 'isolated local production server, headless Edge; no physical hardware' };
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  writeFileSync(join(output, 'failure.txt'), `${error.stack}\n${serverOutput}\npage errors: ${errors.join('\n')}`);
  throw error;
} finally {
  await browser?.close(); server.kill();
  if (server.exitCode === null) await new Promise(r => server.once('exit', r));
  const resolved = resolve(temp);
  if (!resolved.startsWith(resolve(tmpdir()) + sep) || !basename(resolved).startsWith('oid-browser-')) throw new Error('Refusing cleanup outside generated test directory');
  rmSync(resolved, { recursive: true, force: true });
}
