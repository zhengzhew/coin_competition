import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = mkdtempSync(join(tmpdir(), 'third-browser-'));
const output = resolve('outputs/third-competition'); mkdirSync(output, { recursive: true });
const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port; await new Promise(r => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/dist/index.js'], { cwd: process.cwd(), windowsHide: true,
  env: { ...process.env, PORT: String(port), COIN_DATA_DIR: temp, PUBLIC_ORIGIN: origin, TEACHER_KEY: 'third-test-only' }, stdio: 'pipe' });
let serverOutput = ''; server.stdout.on('data', s => serverOutput += s); server.stderr.on('data', s => serverOutput += s);
let browser, page;
const errors = [], thirdApiRequests = [], remoteRequests = [], checks = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let n = 0; n < 75; n++) {
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(serverOutput);
    await wait(200);
  }
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(origin + '/')) { remoteRequests.push(url); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => { if (page.url().match(/^https?:\/\/[^/]+\/(?:demo|third)(?:\/|$)/) && request.url().includes('/api/')) thirdApiRequests.push(request.url()); });
  const stage = () => page.getByTestId('third-stage');
  const start = () => page.getByTestId('third-start').click();
  const completed = () => page.waitForFunction(() => document.querySelector('[data-testid="third-stage"]')?.getAttribute('data-phase') === 'completed', { }, { timeout: 20000 });
  const ready = async simulation => {
    await stage().waitFor();
    if (simulation === 'simulation3d') await page.locator('canvas[data-third-scene][data-ready=true]').waitFor();
    else await page.locator('.third-stage canvas[data-ready=true], .third-stage .robot-fallback').first().waitFor();
    await page.getByTestId('third-start').waitFor({ state: 'visible' });
    if (simulation === 'simulation3d') {
      assert.match(await page.locator('.third-physical-scale').innerText(), /120 × 120 cm/);
      assert.match(await page.locator('.third-map-coordinates').innerText(), /X 54.0 · Y 24.0 cm/);
    }
    assert.equal(await page.locator('.app.future-city .workspace-grid.robot-workspace').count(), 1);
    assert.equal(await page.getByRole('button', { name: /^(自动|手动)$/ }).count(), 0, 'mode is fixed inside the level');
    assert.equal(await page.locator('.mode-toggle, .third-mode-toggle').count(), 0);
    const runBox = await page.getByTestId('third-start').boundingBox();
    const panelBox = await page.locator('.third-program-editor, .keyboard-card').boundingBox();
    assert.ok(runBox.y + runBox.height <= panelBox.y + panelBox.height + 1, 'start/run stays visible within control panel');
  };
  const path = (category, mode, simulation) => `/demo/${category}/${mode}/${simulation}/${category}-${simulation}-sample/`;
  for (const method of ['GET', 'HEAD']) for (const [oldPath, newPath] of [
    ['/third', '/demo/'], ['/third/', '/demo/'], ['/third/index.html', '/demo/'],
    ['/third/place/manual/simulation3d/place-simulation3d-sample/', path('place', 'manual', 'simulation3d')],
  ]) {
    const response = await fetch(origin + oldPath + '?from=bookmark', { method, redirect: 'manual' });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), newPath + '?from=bookmark');
  }
  await page.goto(origin + '/third/?from=bookmark#catalog');
  await page.getByRole('heading', { name: /从这里开始体验/ }).waitFor();
  assert.equal(page.url(), origin + '/demo/?from=bookmark#catalog');
  assert.equal(await page.title(), 'DEMO 展示中心');
  assert.equal(await page.getByText('第三子赛项').count(), 0);
  // Seed an existing-origin draft using the same stable key as the old release.
  const { thirdSample } = await import('../shared/dist/index.js');
  const existingDemo = thirdSample('collect', 'grid');
  const existingDraftKey = `third.program.${existingDemo.demo_id}.${existingDemo.content_version}.grid`;
  await page.evaluate(key => localStorage.setItem(key, 'forward(1)\n# existing draft'), existingDraftKey);
  await page.goto(origin + path('collect', 'auto', 'grid').replace('/demo/', '/third/') + '?from=bookmark#program');
  await ready('grid');
  assert.equal(page.url(), origin + path('collect', 'auto', 'grid') + '?from=bookmark#program');
  assert.equal(await page.getByRole('textbox', { name: '指令程序', exact: true }).inputValue(), 'forward(1)\n# existing draft');
  await page.getByRole('button', { name: '恢复示例程序' }).click();
  await page.locator('a.brand[href="/demo/"]').click();
  await page.getByRole('heading', { name: /从这里开始体验/ }).waitFor();
  assert.equal(page.url(), origin + '/demo/');
  checks.push('legacy root/deep GET and HEAD redirects/query/hash/draft preservation/return to demo centre');
  await page.goto(origin + '/demo/');
  await page.getByRole('heading', { name: /从这里开始体验/ }).waitFor();
  await page.screenshot({ path: join(output, '01-home.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: join(output, '01-home-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.locator('.third-category-card').first().click();
  assert.equal(await page.locator('.third-sim-options a').count(), 4);
  await page.locator('.third-sim-options a').first().click();
  assert.equal(await page.getByRole('button', { name: 'DEMO 准备中' }).isDisabled(), true);
  await page.getByRole('button', { name: /进入体验/ }).click();
  await ready('grid'); await page.goBack(); await page.getByRole('button', { name: /进入体验/ }).waitFor();
  await page.goForward(); await ready('grid'); await page.reload(); await ready('grid');
  checks.push('category/navigation/history/production deep refresh');
  for (const category of ['collect', 'place']) for (const simulation of ['grid', 'simulation3d']) {
    await page.goto(origin + path(category, 'auto', simulation)); await ready(simulation);
    if (simulation === 'simulation3d') await page.screenshot({ path: join(output, `02-${category}-3d.png`), fullPage: true });
    else await page.screenshot({ path: join(output, `02-${category}-grid.png`), fullPage: true });
    await start(); await completed();
    assert.equal(await stage().getAttribute('data-collected'), category === 'collect' ? '3' : '1');
    await page.getByRole('button', { name: '重置', exact: true }).click();
    assert.equal(await stage().getAttribute('data-collected'), '0');
    assert.equal(await stage().getAttribute('data-holding'), '');
    await page.getByRole('textbox', { name: '指令程序', exact: true }).fill('forward(-1)');
    await start(); await page.getByRole('alert').filter({ hasText: /第 1 行/ }).waitFor();
    assert.equal(await stage().getAttribute('data-phase'), 'ready');
    await page.getByRole('button', { name: '恢复示例程序' }).click();
    checks.push(`${category}/${simulation}/auto completion/reset/validation`);
    await page.getByRole('button', { name: '返回分类', exact: true }).click();
    await page.locator(`a[href="/demo/${category}/manual/${simulation}/"]`).click();
    await page.getByRole('button', { name: /进入体验/ }).click(); await ready(simulation);
    if (simulation === 'simulation3d') await page.screenshot({ path: join(output, `02-${category}-3d-manual.png`), fullPage: true });
    await start();
    if (simulation === 'grid') {
      if (category === 'place') await page.keyboard.press('g');
      for (let n = 0; n < (category === 'collect' ? 3 : 2); n++) await page.keyboard.press('w');
      if (category === 'place') await page.keyboard.press('r');
    } else if (category === 'collect') {
      await page.keyboard.down('w'); await completed(); await page.keyboard.up('w');
    } else {
      await page.keyboard.press('g'); await page.waitForFunction(() => document.querySelector('[data-testid="third-stage"]').dataset.holding === 'A');
      await page.keyboard.down('w');
      await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset.z) <= 72.04);
      await page.keyboard.up('w');
      await page.keyboard.down('d');
      await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset.heading) >= 1.54);
      await page.keyboard.up('d');
      await page.keyboard.down('w');
      await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset.x) >= 83.98);
      await page.keyboard.up('w');
      await page.keyboard.down('d');
      await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset.heading) >= 3.12);
      await page.keyboard.up('d'); await page.keyboard.press('r');
    }
    await completed(); checks.push(`${category}/${simulation}/manual completion`);
  }
  // Stop, held-key release, visibility, editing focus, view switches, and route cleanup.
  await page.goto(origin + path('place', 'manual', 'simulation3d')); await ready('simulation3d'); await start();
  await page.keyboard.down('s'); await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset.z) > 96.25);
  await page.keyboard.up('s'); const released = Number(await stage().getAttribute('data-z')); await wait(350);
  assert.ok(Math.abs(Number(await stage().getAttribute('data-z')) - released) < 1, 'physical robot brakes within 1 cm');
  await page.keyboard.down('w'); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('w');
  assert.equal(await stage().getAttribute('data-phase'), 'stopped');
  const blurred = await stage().getAttribute('data-z'); await wait(180); assert.equal(await stage().getAttribute('data-z'), blurred);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  for (const name of ['俯视', '跟随', '自由视角']) { await page.getByRole('button', { name, exact: true }).click(); assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true'); }
  await page.getByRole('button', { name: '返回分类', exact: true }).click();
  await page.locator('a[href="/demo/place/auto/simulation3d/"]').click();
  await page.getByRole('button', { name: /进入体验/ }).click(); await ready('simulation3d');
  const editor = page.getByRole('textbox', { name: '指令程序', exact: true });
  await editor.fill('wait(10)'); await editor.press('w'); assert.equal(await stage().getAttribute('data-z'), '96.0000');
  await editor.fill('wait(10)'); await start(); await page.getByRole('button', { name: '停止', exact: true }).click();
  assert.equal(await stage().getAttribute('data-phase'), 'stopped');
  await editor.fill('forward(1)\n# saved draft'); await page.reload(); await ready('simulation3d');
  assert.equal(await editor.inputValue(), 'forward(1)\n# saved draft');
  await page.getByRole('button', { name: '恢复示例程序' }).click();
  await start(); await page.getByRole('button', { name: '返回分类', exact: true }).click();
  await page.locator('a[href="/demo/place/manual/simulation3d/"]').click();
  await page.getByRole('button', { name: /进入体验/ }).click(); await ready('simulation3d');
  await wait(200); assert.equal(await stage().getAttribute('data-phase'), 'ready'); assert.equal(await stage().getAttribute('data-z'), '96.0000');
  checks.push('keyup/blur/stop/editor focus/draft isolation/exit-and-reenter cleanup/camera');
  checks.push('future-city shared layout and board/no in-level mode switch');
  await start();
  await page.keyboard.down('w');
  await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="third-stage"]').dataset.objects)[0].z < 72);
  await page.keyboard.up('w'); await wait(350);
  assert.equal(await stage().getAttribute('data-holding'), '');
  await page.screenshot({ path: join(output, '04-physical-push.png'), fullPage: true });
  await page.getByRole('button', { name: '重置', exact: true }).click(); await start();
  await page.keyboard.press('g');
  await page.waitForFunction(() => document.querySelector('[data-testid="third-stage"]').dataset.holding === 'A');
  await page.screenshot({ path: join(output, '05-contact-grip.png'), fullPage: true });
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.querySelector('[data-testid="third-stage"]').dataset.gripper === 'open');
  assert.equal(await stage().getAttribute('data-holding'), '');
  await page.keyboard.down('s');
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="third-stage"]').dataset.z) > 106);
  await page.keyboard.up('s'); await wait(350); await page.keyboard.press('g');
  await page.waitForFunction(() => document.querySelector('[data-testid="third-stage"]').dataset.gripper === 'closed');
  assert.equal(await stage().getAttribute('data-holding'), '');
  checks.push('dynamic cube pushing/contact-only grip/open release/empty closure');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  // WebGL context loss must stop the active controller and allow a fresh scene.
  await start(); await page.locator('canvas[data-third-scene]').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('button', { name: '重新加载场景' }).waitFor();
  assert.equal(await stage().getAttribute('data-phase'), 'stopped'); assert.equal(await page.getByTestId('third-start').isDisabled(), true);
  await page.getByRole('button', { name: '重新加载场景' }).click(); await ready('simulation3d');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, '03-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  checks.push('context loss/retry/mobile layout');
  for (const invalid of ['/demo/bad/', '/demo/collect/manual/nope/', '/demo/collect/auto/grid/missing/', '/demo//']) {
    await page.goto(origin + invalid); await page.getByRole('heading', { name: '这个玩法暂时无法打开' }).waitFor();
  }
  assert.deepEqual(thirdApiRequests, []); assert.deepEqual(remoteRequests, []);
  checks.push('invalid routes/no remote dependency/no old score API requests');
  // Exercise original pages against the isolated production server/database.
  await page.setViewportSize({ width: 1440, height: 1040 });
  for (const route of ['/', '/future/']) {
    await page.goto(origin + route);
    await page.locator('#player-name').fill('DEMO 回归测试'); await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.locator('[data-track-id="onboarding.mode.keyboard"]').click();
    await page.locator('[data-track-id="attempt.start"]').click();
    await page.getByRole('button', { name: '停止本轮', exact: true }).waitFor();
    const command = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST');
    await page.keyboard.press(route === '/' ? 'ArrowRight' : 'd'); assert.equal((await command).status(), 200);
    await page.locator('[data-track-id="header.mode.switch"]').click();
    await page.waitForFunction(() => document.querySelector('.current-mode')?.textContent.includes('代码操控'));
    checks.push(`original ${route} identity/keyboard/API/mode switch`);
  }
  assert.deepEqual(errors, []);
  const report = { passed: true, checks, errors, thirdApiRequests, remoteRequests, environment: { browser: 'headless Edge', viewport: '1440x1040 / 390x844', hardware: 'local machine; target classroom hardware not measured' } };
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  writeFileSync(join(output, 'failure.txt'), `${error.stack}\n${serverOutput}\npage errors: ${errors.join('\n')}`);
  throw error;
} finally {
  await browser?.close();
  server.kill(); if (server.exitCode === null) await new Promise(r => server.once('exit', r));
  const resolved = resolve(temp);
  if (!resolved.startsWith(resolve(tmpdir()) + sep) || !basename(resolved).startsWith('third-browser-')) throw new Error('Refusing cleanup outside generated test directory');
  rmSync(resolved, { recursive: true, force: true });
}
