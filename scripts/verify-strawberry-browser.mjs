import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import { strawberryLevels, solveStrawberryRoute, STRAWBERRY_POSITIONS } from '../shared/dist/index.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = mkdtempSync(join(tmpdir(), 'farm-browser-'));
const output = resolve('outputs/farm-strawberry'); mkdirSync(output, { recursive: true });
const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port; await new Promise(r => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/dist/index.js'], { cwd: process.cwd(), windowsHide: true,
  env: { ...process.env, PORT: String(port), COIN_DATA_DIR: temp, PUBLIC_ORIGIN: origin, TEACHER_KEY: 'farm-test-only' }, stdio: 'pipe' });
let serverOutput = ''; server.stdout.on('data', s => serverOutput += s); server.stderr.on('data', s => serverOutput += s);
let browser, page;
const errors = [], farmApiRequests = [], remoteRequests = [], checks = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(serverOutput);
    await wait(200);
  }
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1543, height: 884 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(origin + '/')) { remoteRequests.push(url); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => { if (page.url().includes('/farm') && request.url().includes('/api/')) farmApiRequests.push(request.url()); });
  const stage = () => page.getByTestId('third-stage');
  const source = () => page.getByRole('textbox', { name: '指令程序', exact: true });
  const start = () => page.getByTestId('third-start').click();
  const phase = expected => page.waitForFunction(value => document.querySelector('[data-testid="third-stage"]')?.dataset.phase === value, expected, { timeout: 20000 });
  const confirm = () => page.getByRole('button', { name: '确认，进入农场 →', exact: true }).click();
  const scene = () => page.locator('canvas[data-farm-scene="strawberry"]');
  const ready = () => page.locator('canvas[data-farm-scene="strawberry"][data-ready=true]').waitFor();
  for (const route of ['/farm/', ...strawberryLevels.map(l => `/farm/${l.demo_id}/`), '/farm/place/', '/farm/auto/collect/'])
    for (const method of ['GET', 'HEAD']) assert.equal((await fetch(origin + route, { method })).status, 200);
  await page.goto(origin + '/farm/');
  await page.getByLabel('你的名字', { exact: true }).fill('草莓测试员');
  assert.match(await page.getByTestId('player-random-id').innerText(), /^[0-9a-f-]{36}$/);
  await page.screenshot({ path: join(output, 'welcome.png'), fullPage: true }); await confirm();
  assert.equal(await page.locator('.experience-grid button').count(), 3);
  await page.getByRole('button', { name: /单株草莓.*编程控制/ }).click(); await ready();
  checks.push('identity preview, three programming-only levels, deep-link responses');
  assert.equal(await scene().getAttribute('data-renderer'), 'three');
  assert.equal(await scene().getAttribute('data-vehicle-model'), '000_saikao');
  await page.screenshot({ path: join(output, '3d-initial.png'), fullPage: true });
  const camera = () => scene().getAttribute('data-camera');
  const beforeOrbit = await camera(), area = await scene().boundingBox();
  await page.mouse.move(area.x + area.width * .45, area.y + area.height * .5); await page.mouse.down();
  await page.mouse.move(area.x + area.width * .65, area.y + area.height * .55, { steps: 12 }); await page.mouse.up();
  await page.waitForFunction(previous => document.querySelector('canvas[data-farm-scene]').dataset.camera !== previous, beforeOrbit);
  const orbitCamera = await camera(); await page.mouse.wheel(0, -200);
  await page.waitForFunction(previous => document.querySelector('canvas[data-farm-scene]').dataset.camera !== previous, orbitCamera);
  await page.locator('[data-track-id="camera.view.top"]').click();
  await page.waitForFunction(() => document.querySelector('canvas[data-farm-scene]').dataset.view === 'top');
  await page.screenshot({ path: join(output, '3d-top.png'), fullPage: true });
  const beforeZoom = await camera(); await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await page.waitForFunction(previous => document.querySelector('canvas[data-farm-scene]').dataset.camera !== previous, beforeZoom);
  await page.locator('[data-track-id="camera.view.follow"]').click();
  await page.waitForFunction(() => document.querySelector('canvas[data-farm-scene]').dataset.view === 'follow');
  await source().fill('move(2)'); await start(); await phase('stopped');
  await page.waitForFunction(() => document.querySelector('canvas[data-farm-scene]').dataset.vehicle === '-3.500,0.000,1.500');
  assert.equal((await scene().getAttribute('data-target')).split(',')[2], '1.500');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.locator('[data-track-id="camera.reset"]').click();
  await page.locator('[data-track-id="camera.fullscreen"]').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  assert.equal(await page.locator('.third-program-editor').isVisible(), true);
  await page.locator('[data-track-id="camera.fullscreen"]').click(); await page.waitForFunction(() => !document.fullscreenElement);
  checks.push('real Three.js rendering, drag orbit, wheel/button zoom, top/follow/reset views, vehicle following, fullscreen with code editor');
  const palette = page.getByLabel('可用指令', { exact: true });
  assert.equal(await palette.locator('button').count(), 6);
  for (const [label, command] of [['前进', 'move(1)'], ['后退', 'move(-1)'], ['左转', 'turn_left()'], ['右转', 'turn_right()'], ['采摘', 'grab()'], ['放下', 'release()']]) {
    await source().fill(''); await palette.getByRole('button', { name: new RegExp(label) }).click(); assert.equal(await source().inputValue(), command);
  }
  assert.equal(await page.getByRole('button', { name: /切换|OID|循环|时间/ }).count(), 0);
  await source().fill('move(1.5)'); await start(); await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /第 1 行/); assert.equal(await stage().getAttribute('data-phase'), 'ready');
  await source().fill('grab()'); await start(); await phase('stopped');
  assert.match(await page.locator('.message').innerText(), /前方相邻格/); assert.equal(await stage().getAttribute('data-steps'), '0');
  await source().fill('move(4)\nturn_right()\nmove(6)'); await start(); await phase('stopped');
  assert.equal(await stage().getAttribute('data-steps'), '7'); assert.match(await page.locator('.message').innerText(), /草莓所在格/);
  await source().fill('move(3)\nturn_right()\nmove(4)\nturn_left()\ngrab()\nrelease()'); await start(); await phase('stopped');
  assert.equal(await stage().getAttribute('data-holding'), 'strawberry-1'); assert.match(await page.locator('.message').innerText(), /任意边缘/);
  await page.waitForFunction(() => document.querySelector('canvas[data-farm-scene]').dataset.holding === 'strawberry-1');
  assert.deepEqual(JSON.parse(await scene().getAttribute('data-berries')), []);
  await page.screenshot({ path: join(output, '3d-carrying.png'), fullPage: true });
  assert.equal(await page.getByTestId('farm-strawberry').count(), 0); assert.equal(await stage().getAttribute('data-collected'), '0');
  const longProgram = 'move(1)\nmove(-1)\n'.repeat(20);
  await source().fill(longProgram); await start(); await phase('running');
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="running-code-line"]')?.getAttribute('data-line')) >= 19);
  assert.ok(await source().evaluate(node => node.scrollTop) > 0, 'execution auto-scrolls to the highlighted line');
  assert.equal(await page.getByTestId('running-code-line').count(), 1);
  await page.screenshot({ path: join(output, 'running-line-highlight.png'), fullPage: true });
  await page.getByRole('button', { name: '停止', exact: true }).click(); await phase('stopped');
  const stoppedSteps = await stage().getAttribute('data-steps'); await wait(300); assert.equal(await stage().getAttribute('data-steps'), stoppedSteps);
  assert.equal(await page.getByTestId('running-code-line').count(), 0);
  assert.equal(await page.getByTestId('competition-stop-reset').innerText(), '重置');
  assert.equal(await page.getByRole('button', { name: '重置代码', exact: true }).count(), 0);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  assert.equal(await stage().getAttribute('data-steps'), '0'); assert.equal(await source().inputValue(), longProgram);
  assert.equal(await stage().getAttribute('data-x'), '0'); assert.equal(await stage().getAttribute('data-map-y'), '0');
  assert.equal(await stage().getAttribute('data-heading'), '0'); assert.equal(await page.getByTestId('farm-strawberry').count(), 1);
  assert.equal(await page.getByTestId('competition-stop-reset').innerText(), '停止'); assert.equal(await page.getByTestId('competition-stop-reset').isDisabled(), true);
  checks.push('six commands, errors/carry state, running-line highlight and scrolling, stop/reset toggling, reset preserves code and restores scene');
  for (const [i, demo] of strawberryLevels.entries()) {
    await page.getByRole('button', { name: `${i + 1} ${demo.title}`, exact: true }).click(); await ready();
    assert.equal(await page.locator('.farm-grid-cell').count(), 64);
    assert.deepEqual(await page.getByTestId('farm-strawberry').evaluateAll(nodes => nodes.map(n => [Number(n.dataset.x), Number(n.dataset.y)])), STRAWBERRY_POSITIONS[i]);
    assert.deepEqual(JSON.parse(await scene().getAttribute('data-berries')).map(o => [o.x, o.y]), STRAWBERRY_POSITIONS[i]);
    assert.equal(await stage().getAttribute('data-x'), '0'); assert.equal(await stage().getAttribute('data-map-y'), '0'); assert.equal(await stage().getAttribute('data-heading'), '0');
    assert.match(await page.getByTestId('farm-control-mode').innerText(), /编程控制/);
    await page.screenshot({ path: join(output, `level-${i + 1}-ready.png`), fullPage: true });
    const solution = solveStrawberryRoute(demo);
    if (i === 0) {
      await source().fill(`move(1)\nmove(-1)\n${solution.program}`); await start(); await phase('completed');
      assert.equal(await page.getByTestId('farm-score').innerText(), '83 分'); assert.match(await page.getByTestId('farm-best').innerText(), /^12/);
      await page.getByRole('button', { name: '再挑战一次' }).click();
    }
    await source().fill(solution.program); await start(); await phase('completed');
    assert.equal(await stage().getAttribute('data-collected'), String(demo.scene_config.objects.length));
    assert.equal(await stage().getAttribute('data-holding'), ''); assert.equal(await stage().getAttribute('data-steps'), String(solution.steps));
    assert.equal(await page.getByTestId('farm-score').innerText(), '100 分'); assert.match(await page.getByTestId('farm-best').innerText(), new RegExp(`^${solution.steps}`));
    await page.screenshot({ path: join(output, `level-${i + 1}-complete.png`), fullPage: true });
    if (i === 0) {
      await source().fill(`move(1)\nmove(-1)\n${solution.program}`); await start(); await phase('completed'); assert.match(await page.getByTestId('farm-best').innerText(), /^10/);
    }
  }
  checks.push('three levels complete with real programs; optimal steps 10/12/16; scoring and best improvement/retention');
  await page.getByRole('button', { name: '再挑战一次' }).click(); await source().fill('move(2)\n# 第三关草稿');
  await page.getByRole('button', { name: '1 单株草莓', exact: true }).click(); await ready(); assert.doesNotMatch(await source().inputValue(), /第三关/);
  await page.goBack(); await ready(); assert.equal(await source().inputValue(), 'move(2)\n# 第三关草稿');
  await page.reload(); await confirm(); await ready(); assert.equal(await source().inputValue(), 'move(2)\n# 第三关草稿'); assert.match(await page.getByTestId('farm-best').innerText(), /^16/);
  for (const [route, expected] of [['/farm/manual/collect/', 1], ['/farm/auto/place/', 2], ['/farm/place/', 2]]) {
    await page.goto(origin + route); await confirm(); await ready(); assert.match(page.url(), new RegExp(`/farm/strawberry-${expected}/$`));
  }
  checks.push('draft/best persistence, history navigation, legacy link normalization');
  for (const viewport of [{ width: 1543, height: 884 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await ready(); await wait(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `no horizontal overflow at ${viewport.width}`);
    const board = await page.getByTestId('strawberry-board').boundingBox(); assert.ok(board.width > 250 && board.height > 280);
    await page.locator('[data-track-id="camera.reset"]').click(); await wait(150);
    assert.ok(JSON.parse(await scene().getAttribute('data-bounds')).every(n => Math.abs(n) <= 1), '3D board and coordinates fit in the viewport');
    const runBox = await page.getByTestId('third-start').boundingBox(), editor = await page.locator('.third-program-editor').boundingBox(); assert.ok(runBox.y + runBox.height <= editor.y + editor.height + 1);
    if (viewport.width >= 1000) {
      assert.ok(board.height > viewport.height * .52, 'map remains the main interaction area');
      const objective = await page.locator('.farm-mission-heading p').boundingBox(), heading = await page.locator('.farm-mission-heading').boundingBox();
      const inset = await page.locator('.farm-mission-heading').evaluate(node => parseFloat(getComputedStyle(node).paddingRight) + parseFloat(getComputedStyle(node).borderRightWidth));
      assert.ok(Math.abs(heading.x + heading.width - objective.x - objective.width - inset) <= 1);
    }
    await page.screenshot({ path: join(output, `layout-${viewport.width}.png`), fullPage: true });
  }
  checks.push('desktop/tablet/mobile layout, right-aligned task, large board, run-button access');
  await page.getByRole('button', { name: '返回首页', exact: true }).click(); await page.getByRole('button', { name: '更换玩家' }).click();
  await page.getByLabel('你的名字', { exact: true }).fill('另一位采摘员'); await confirm(); await page.getByRole('button', { name: /单株草莓.*编程控制/ }).click(); await ready();
  assert.equal(await page.getByTestId('farm-best').innerText(), '—'); assert.equal(await source().inputValue(), strawberryLevels[0].starter);
  assert.doesNotMatch(await page.getByRole('button', { name: '1 单株草莓', exact: true }).innerText(), /完成/);
  await scene().evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.locator('.farm-3d-fallback').waitFor(); assert.equal(await page.locator('.farm-grid-cell').count(), 64);
  await source().fill('move(1)'); await start(); await phase('stopped'); assert.equal(await stage().getAttribute('data-map-y'), '1');
  checks.push('WebGL context loss falls back to the grid without losing playable state');
  await page.goto(origin + '/farm/unknown/'); await page.getByRole('heading', { name: '没有找到这个农场任务' }).waitFor();
  assert.deepEqual(farmApiRequests, []); assert.deepEqual(remoteRequests, []);
  checks.push('player isolation, invalid routes, no farm API submission or remote dependencies');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/demo/collect/auto/simulation3d/collect-simulation3d-sample/'); await page.locator('canvas[data-third-scene][data-ready=true]').waitFor();
  assert.equal(await source().inputValue(), 'forward(36)'); assert.equal(await page.locator('.farm-game').count(), 0);
  for (const route of ['/', '/future/']) {
    await page.goto(origin + route); await page.getByLabel('你的名字', { exact: true }).fill('农场回归测试'); await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.locator('[data-track-id="onboarding.mode.keyboard"]').click(); await page.locator('[data-track-id="attempt.start"]').click(); await page.waitForFunction(() => !document.querySelector('[data-track-id="move.right"], [data-track-id="move.forward"]')?.disabled);
    const response = page.waitForResponse(r => r.url().endsWith('/commands') && r.request().method() === 'POST'); await page.keyboard.press(route === '/' ? 'ArrowRight' : 'd'); assert.equal((await response).status(), 200);
  }
  checks.push('existing 3D DEMO and first/second competition gameplay smoke checks'); assert.deepEqual(errors, []);
  const report = { passed: true, checks, errors, farmApiRequests, remoteRequests, optimalSteps: strawberryLevels.map(l => solveStrawberryRoute(l).steps), environment: 'local production build; headless Edge; isolated test database' };
  writeFileSync(join(output, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {});
  writeFileSync(join(output, 'failure.txt'), `${error.stack}\n${serverOutput}\npage errors: ${errors.join('\n')}`); throw error;
} finally {
  await browser?.close(); server.kill(); if (server.exitCode === null) await new Promise(r => server.once('exit', r));
  const resolved = resolve(temp);
  if (!resolved.startsWith(resolve(tmpdir()) + sep) || !basename(resolved).startsWith('farm-browser-')) throw new Error('Refusing cleanup outside generated test directory');
  rmSync(resolved, { recursive: true, force: true });
}
